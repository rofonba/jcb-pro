#!/usr/bin/env node
/* global process */
// Volcado del censo oficial (Excel) a Firestore: añade `numeroCenso` y `distintivo` a falleros/{uid}.
//
// Uso (desde la raíz del repo):
//   node scripts/syncCenso.js                       → SIMULACRO: muestra qué haría, no escribe nada
//   node scripts/syncCenso.js --apply               → escribe los cruces EXACTOS
//   node scripts/syncCenso.js --apply --partial     → escribe también los cruces PARCIALES (revísalos antes)
//   node scripts/syncCenso.js --parse-only          → sólo lee el Excel (no necesita credenciales)
//   node scripts/syncCenso.js --file "ruta.xlsx"    → otro fichero (por defecto docs/261111 CENSO JCB.xlsx)
//
// Credenciales (cualquiera de las dos):
//   · Las mismas variables que Vercel: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
//   · o GOOGLE_APPLICATION_CREDENTIALS=/ruta/serviceAccount.json
//
// Excel esperado (hoja 1, fila 1 = cabecera): A = N.Censo · B = Cognoms · C = Nom · D = Recompensas
//
// Cruce: por nombre + apellidos normalizados (sin tildes, mayúsculas, sin signos). No hay otro campo
// común entre el Excel y la app. Reglas:
//   · EXACTO   → nombre y apellidos completos idénticos y únicos en ambos lados.
//   · PARCIAL  → mismo nombre y los apellidos de la app son el principio de los del Excel
//                (p. ej. la persona escribió sólo el primer apellido) y hay UN único candidato.
//   · Ambiguo / sin cruce → no se toca; se lista para revisarlo a mano.
// Es idempotente: se puede ejecutar varias veces.

import fs from 'node:fs'
import zlib from 'node:zlib'
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const args     = process.argv.slice(2)
const APPLY    = args.includes('--apply')
const PARTIAL  = args.includes('--partial')
const PARSE    = args.includes('--parse-only')
const fileIdx  = args.indexOf('--file')
const FILE     = fileIdx >= 0 ? args[fileIdx + 1] : 'docs/261111 CENSO JCB.xlsx'

// ─── Lector mínimo de .xlsx (ZIP + XML) sin dependencias ──────────────────────────────────────
function unzip(buf) {
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('No es un fichero .xlsx válido (ZIP sin directorio central)')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  const files = {}
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('ZIP corrupto')
    const method = buf.readUInt16LE(p + 10)
    const csize  = buf.readUInt32LE(p + 20)
    const nlen   = buf.readUInt16LE(p + 28)
    const xlen   = buf.readUInt16LE(p + 30)
    const clen   = buf.readUInt16LE(p + 32)
    const off    = buf.readUInt32LE(p + 42)
    const name   = buf.toString('utf8', p + 46, p + 46 + nlen)
    const lnlen  = buf.readUInt16LE(off + 26)
    const lxlen  = buf.readUInt16LE(off + 28)
    const data   = buf.subarray(off + 30 + lnlen + lxlen, off + 30 + lnlen + lxlen + csize)
    files[name] = method === 0 ? data : method === 8 ? zlib.inflateRawSync(data) : null
    p += 46 + nlen + xlen + clen
  }
  return files
}

const decode = s => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&amp;/g, '&')

function readSheetRows(path) {
  const files = unzip(fs.readFileSync(path))
  const shared = []
  const ssXml = files['xl/sharedStrings.xml']?.toString('utf8') ?? ''
  for (const [, si] of ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    shared.push(decode([...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(m => m[1]).join('')))
  }
  const sheet = files['xl/worksheets/sheet1.xml']?.toString('utf8')
  if (!sheet) throw new Error('No se encuentra la primera hoja del Excel')
  const rows = []
  for (const [, rowXml] of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = {}
    for (const [, attrs, body] of rowXml.matchAll(/<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const col = /r="([A-Z]+)\d+"/.exec(attrs)?.[1]
      if (!col) continue
      const type = /t="([^"]+)"/.exec(attrs)?.[1]
      const v = /<v>([\s\S]*?)<\/v>/.exec(body ?? '')?.[1]
      if (type === 's') row[col] = shared[Number(v)]
      else if (type === 'inlineStr') row[col] = decode([...(body ?? '').matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(m => m[1]).join(''))
      else row[col] = v != null ? decode(v) : undefined
    }
    rows.push(row)
  }
  return rows
}

// ─── Normalización y cruce ───────────────────────────────────────────────────────────────────
const norm = s => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
const tokens = s => norm(s).split(' ').filter(Boolean)

function loadCenso() {
  const rows = readSheetRows(FILE)
  const header = rows.shift() ?? {}
  if (!/censo/i.test(header.A ?? '') || !/recompens|distint/i.test(header.D ?? '')) {
    console.warn(`⚠️  Cabecera inesperada: A="${header.A}" D="${header.D}". Revisa que las columnas sean A=N.Censo, D=Recompensas.`)
  }
  const censo = []
  const invalid = []
  for (const r of rows) {
    const num = Number(String(r.A ?? '').trim())
    const nombre = String(r.C ?? '').trim()
    const apellidos = String(r.B ?? '').trim()
    if (!Number.isInteger(num) || num <= 0 || !nombre) { if (Object.keys(r).length) invalid.push(r); continue }
    const distintivo = String(r.D ?? '').trim() || null
    censo.push({ numeroCenso: num, nombre, apellidos, distintivo,
      nomTok: tokens(nombre), apeTok: tokens(apellidos), key: norm(`${nombre} ${apellidos}`) })
  }
  return { censo, invalid }
}

function match(falleros, censo) {
  const byKey = new Map()
  for (const c of censo) (byKey.get(c.key) ?? byKey.set(c.key, []).get(c.key)).push(c)

  const proposals = []   // { f, c, kind }
  const ambiguous = []
  const unmatched = []
  for (const f of falleros) {
    const key = norm(`${f.nombre ?? ''} ${f.apellidos ?? ''}`)
    const exact = byKey.get(key) ?? []
    if (exact.length === 1) { proposals.push({ f, c: exact[0], kind: 'exacto' }); continue }
    if (exact.length > 1) { ambiguous.push({ f, motivo: `${exact.length} personas con el mismo nombre en el Excel` }); continue }

    const fNom = tokens(f.nombre), fApe = tokens(f.apellidos)
    const cands = fApe.length === 0 ? [] : censo.filter(c =>
      c.nomTok.join(' ') === fNom.join(' ') &&
      fApe.length <= c.apeTok.length &&
      fApe.every((t, i) => c.apeTok[i] === t))
    if (cands.length === 1) proposals.push({ f, c: cands[0], kind: 'parcial' })
    else if (cands.length > 1) ambiguous.push({ f, motivo: `${cands.length} candidatos parciales` })
    else unmatched.push(f)
  }

  // Una fila del Excel no puede asignarse a dos usuarios distintos
  const byRow = new Map()
  for (const p of proposals) (byRow.get(p.c) ?? byRow.set(p.c, []).get(p.c)).push(p)
  const ok = []
  for (const [c, ps] of byRow) {
    if (ps.length === 1) ok.push(ps[0])
    else for (const p of ps) ambiguous.push({ f: p.f, motivo: `nº censo ${c.numeroCenso} coincide con ${ps.length} usuarios de la app` })
  }
  return { ok, ambiguous, unmatched }
}

// ─── Main ────────────────────────────────────────────────────────────────────────────────────
const { censo, invalid } = loadCenso()
const repeatedNums = censo.filter((c, i) => censo.findIndex(x => x.numeroCenso === c.numeroCenso) !== i)
console.log(`📄 Excel: ${censo.length} personas · ${censo.filter(c => c.distintivo).length} con distintivo` +
  (invalid.length ? ` · ${invalid.length} filas ignoradas (sin nº o sin nombre)` : ''))
if (repeatedNums.length) console.warn(`⚠️  Números de censo repetidos en el Excel: ${[...new Set(repeatedNums.map(c => c.numeroCenso))].join(', ')}`)

if (PARSE) {
  const kinds = [...new Set(censo.map(c => c.distintivo?.replace(/^\d{4}-/, '')).filter(Boolean))]
  console.log('Tipos de distintivo:', kinds.join(', '))
  process.exit(0)
}

const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env
initializeApp(FIREBASE_PRIVATE_KEY
  ? { credential: cert({ projectId: FIREBASE_PROJECT_ID, clientEmail: FIREBASE_CLIENT_EMAIL, privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') }) }
  : { credential: applicationDefault() })
const db = getFirestore()

const snap = await db.collection('falleros').get()
const falleros = snap.docs.map(d => ({ id: d.id, ...d.data() }))
console.log(`👥 Firestore: ${falleros.length} falleros con cuenta en la app\n`)

const { ok, ambiguous, unmatched } = match(falleros, censo)
const exact   = ok.filter(p => p.kind === 'exacto')
const partial = ok.filter(p => p.kind === 'parcial')
const fname   = f => `${f.nombre ?? ''} ${f.apellidos ?? ''}`.trim() || f.email || f.id

const changes = (list) => list.filter(({ f, c }) => f.numeroCenso !== c.numeroCenso || (f.distintivo ?? null) !== c.distintivo)

console.log(`✅ Cruces exactos: ${exact.length} (${changes(exact).length} con cambios)`)
console.log(`🟡 Cruces parciales: ${partial.length}${PARTIAL ? '' : '  → NO se escriben sin --partial'}`)
for (const { f, c } of partial) console.log(`   · App "${fname(f)}"  →  Excel nº ${c.numeroCenso} "${c.nombre} ${c.apellidos}"`)
console.log(`⚠️  Ambiguos (no se tocan): ${ambiguous.length}`)
for (const { f, motivo } of ambiguous) console.log(`   · "${fname(f)}": ${motivo}`)
console.log(`❌ Sin cruce en el Excel (no se tocan): ${unmatched.length}`)
for (const f of unmatched) console.log(`   · "${fname(f)}"`)

const toWrite = changes(PARTIAL ? ok : exact)
if (!APPLY) {
  console.log(`\nSIMULACRO: se escribirían ${toWrite.length} falleros. Ejecuta con --apply para guardar.`)
  process.exit(0)
}

for (let i = 0; i < toWrite.length; i += 400) {
  const batch = db.batch()
  for (const { f, c } of toWrite.slice(i, i + 400)) {
    batch.update(db.collection('falleros').doc(f.id), { numeroCenso: c.numeroCenso, distintivo: c.distintivo })
  }
  await batch.commit()
}
console.log(`\n💾 Guardado: ${toWrite.length} falleros actualizados con numeroCenso y distintivo.`)
