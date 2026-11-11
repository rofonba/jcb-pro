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
// Cruce por NOMBRE COMPLETO. En la app se concatenan `nombre` + `apellidos` (fullNameApp): así da igual
// que el usuario lo escribiera todo en `nombre` y dejara `apellidos` vacío o repetido. En el Excel,
// Nom + Cognoms (fullNameExcel). Ambos se normalizan: minúsculas, sin tildes, sin signos, sin espacios
// dobles. Si en la app los apellidos ya estaban escritos al final de `nombre`, no se duplican
// ("Pilar Gimeno Sabater" + "Gimeno Sabater" → "pilar gimeno sabater").
//   · EXACTO  → fullNameApp idéntico a fullNameExcel (también en orden "apellidos nombre"),
//               con un único candidato.
//   · PARCIAL → fullNameApp está INCLUIDO en fullNameExcel como palabras completas y seguidas
//               (p. ej. "pilar gimeno" ⊂ "pilar gimeno sabater"), con al menos 2 palabras y UN único
//               candidato. Nunca por trozos de palabra: "ana" no casa con "juliana".
//   · PARCIAL por APELLIDOS (apodos: Quique/Enrique, Paco/Francisco) → al menos 2 palabras de la app
//               coinciden con palabras de los APELLIDOS (Cognoms) del Excel —sin contar partículas
//               como "de", "la", "y" ni iniciales sueltas— y hay UN único candidato en todo el censo.
//               Se descartan candidatos cuyo nombre de pila contradiga el de la app según el
//               diccionario (Paco ≠ José Luis). Se marca "parcial (apellidos)": revísalos igualmente,
//               un familiar con nombre no reconocido y los mismos apellidos aún podría casar.
//   · APODOS: antes de cruzar, la primera palabra del nombre se traduce con el diccionario APODOS
//     (Paco → Francisco, Quique → Enrique, Pepe → José…) en LOS DOS LADOS, porque el propio censo
//     también usa apodos (FINA, CHELO, NACHO). Se prueba siempre primero el nombre tal cual y, si no
//     cruza, la versión traducida: "exacto (apodo)" / "parcial (apodo)". También se expanden
//     abreviaturas (Mª → María, Fco. → Francisco, Vte. → Vicente).
//   · Orden: exacto → exacto (apodo) → parcial → parcial (apodo) → parcial (apellidos). Cada vía
//     sólo se usa si la anterior no encontró nada. Con 2+ candidatos → ambiguo.
//   · Sólo los EXACTOS se escriben con --apply; todo lo demás necesita --partial.
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

// ─── Diccionario de apodos → nombre formal (en minúsculas y sin tildes) ───────────────────────
// Un apodo puede venir de varios nombres: se prueban todos y, si hay más de un candidato, es ambiguo.
// Incluye equivalencias valenciano/catalán ↔ castellano (Josep ↔ José, Vicent ↔ Vicente…).
const APODOS = {
  // Francisco/a
  paco: ['francisco'], paquito: ['francisco'], curro: ['francisco'], fran: ['francisco'],
  quico: ['francisco'], cisco: ['francisco'], frasco: ['francisco'],
  paqui: ['francisca'], paca: ['francisca'], fani: ['estefania'],
  // José / Josefa / Josefina
  pepe: ['jose'], pepito: ['jose'], pep: ['jose'], josep: ['jose'], jose: ['josep'],
  chema: ['jose maria'], josema: ['jose maria'], josemi: ['jose miguel'], joselu: ['jose luis'],
  juanjo: ['juan jose'], juanma: ['juan manuel'], juanvi: ['juan vicente'], juanra: ['juan ramon'],
  pepa: ['josefa'], pepi: ['josefa'], pepita: ['josefa'],
  fina: ['josefina', 'serafina'], finita: ['josefina'],
  // Enrique, Alejandro/a, Ignacio, Antonio…
  quique: ['enrique'], kike: ['enrique'],
  alex: ['alejandro', 'alejandra'], ale: ['alejandro', 'alejandra'],
  nacho: ['ignacio'], toni: ['antonio'], tono: ['antonio'], tonet: ['antonio'], antoni: ['antonio'],
  manolo: ['manuel'], nelo: ['manuel'], lolo: ['manuel'],
  rafa: ['rafael'], santi: ['santiago'], nando: ['fernando'], fer: ['fernando'],
  javi: ['javier'], xavi: ['javier'], xavier: ['javier'], dani: ['daniel'], edu: ['eduardo'],
  guille: ['guillermo'], nico: ['nicolas'], seba: ['sebastian'], chus: ['jesus', 'maria jesus'],
  chuso: ['jesus'], suso: ['jesus'], voro: ['salvador'], salva: ['salvador'],
  ximo: ['joaquin'], quim: ['joaquin'], joaquim: ['joaquin'], vicent: ['vicente'], vicen: ['vicente'],
  joan: ['juan'], jaume: ['jaime'], pere: ['pedro'], jordi: ['jorge'], miquel: ['miguel'],
  pau: ['pablo'], bernat: ['bernardo'], albert: ['alberto'], lluis: ['luis'], pascual: ['pasqual'],
  // María …
  mari: ['maria'], marita: ['maria'], maribel: ['maria isabel'], marisa: ['maria luisa'],
  maite: ['maria teresa'], marisol: ['maria soledad'], mayte: ['maria teresa'],
  maricarmen: ['maria carmen', 'maria del carmen'], mamen: ['maria carmen'], menchu: ['carmen'],
  pili: ['pilar', 'maria pilar'], lola: ['dolores', 'maria dolores'], loli: ['dolores', 'maria dolores'],
  dori: ['dorotea'], conchi: ['concepcion'], concha: ['concepcion'], conchita: ['concepcion'],
  charo: ['rosario', 'maria rosario'], chelo: ['consuelo'], tere: ['teresa'], isa: ['isabel'],
  merche: ['mercedes'], merxe: ['mercedes'], amparin: ['amparo'], cristi: ['cristina'],
  bea: ['beatriz'], vero: ['veronica'], patri: ['patricia'], susi: ['susana'], nati: ['natividad', 'natalia'],
  inma: ['inmaculada'], reme: ['remedios'], rosi: ['rosa'], neus: ['nieves'],
  angels: ['angeles'], montse: ['montserrat'], nuri: ['nuria'], elo: ['eloisa'], encarna: ['encarnacion'],
}

// Abreviaturas que se expanden SIEMPRE (Excel: "Mª", "MªCARMEN", "M.", "FCO.VTE.")
const ABREV = { m: 'maria', ma: 'maria', mª: 'maria', fco: 'francisco', vte: 'vicente', jm: 'jose maria', mj: 'maria jose' }

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
// minúsculas · sin tildes (ñ→n) · sólo letras y números · un único espacio entre palabras
const norm = s => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const tokens = s => norm(s).split(' ').filter(Boolean)

// Palabras del NOMBRE DE PILA con las abreviaturas expandidas ("Mª Carmen" → maria carmen) y sin
// iniciales sueltas ("ENRIQUE P." → enrique), que romperían la búsqueda de palabras seguidas
const givenTokens = nombre => tokens(nombre).flatMap(t => (ABREV[t] ?? t).split(' ')).filter(t => t.length > 1)

// Palabras de nombre + apellidos.
function fullNameTokens(nombre, apellidos) {
  return [...givenTokens(nombre), ...tokens(apellidos)]
}

// Variantes por apodo: se sustituye la PRIMERA palabra por cada nombre formal del diccionario
function apodoVariants(toks) {
  return (APODOS[toks[0]] ?? []).map(formal => [...formal.split(' '), ...toks.slice(1)])
}
// Sólo para la APP: si el final de `nombre` repite el principio de `apellidos` (el usuario escribió
// apellidos en los dos campos), se une el solapamiento en vez de duplicarlo:
//   "Pilar Gimeno Sabater" + "Gimeno Sabater"     → pilar gimeno sabater
//   "Óscar Rodríguez"      + "Rodríguez González" → oscar rodriguez gonzalez
// Siempre queda al menos una palabra de nombre, así que nunca se colapsan apellidos legítimos
// iguales del Excel como "Pérez Pérez" (el Excel no pasa por aquí).
function appNameTokens(nombre, apellidos) {
  const n = givenTokens(nombre), a = tokens(apellidos)
  for (let k = Math.min(n.length - 1, a.length); k > 0; k--) {
    if (a.slice(0, k).every((t, i) => n[n.length - k + i] === t)) return [...n, ...a.slice(k)]
  }
  return [...n, ...a]
}

// ¿`needle` aparece dentro de `hay` como palabras completas y consecutivas?
function containsWords(hay, needle) {
  if (!needle.length || needle.length > hay.length) return false
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer
    return true
  }
  return false
}

// Palabras que no identifican a nadie: partículas de apellidos compuestos e iniciales ("p.")
const STOPWORDS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'i', 'e', 'da', 'dos', 'van', 'von'])
const significant = toks => toks.filter(t => t.length > 1 && !STOPWORDS.has(t))

// Nº de palabras distintas de la app que están entre los apellidos del Excel
const surnameOverlap = (appTok, c) => new Set(significant(appTok).filter(t => c.surnameSet.has(t))).size

// Todos los nombres de pila conocidos (primeras palabras del censo + apodos y sus formas formales)
let KNOWN_GIVEN = null
const firstWords = s => s.split(' ')[0]
function knownGiven(censo) {
  if (!KNOWN_GIVEN) {
    KNOWN_GIVEN = new Set(censo.map(c => c.givenTok[0]).filter(Boolean))
    for (const [k, vs] of Object.entries(APODOS)) { KNOWN_GIVEN.add(k); for (const v of vs) KNOWN_GIVEN.add(firstWords(v)) }
  }
  return KNOWN_GIVEN
}
// ¿El primer nombre de la app es compatible con el del Excel? Si la primera palabra de la app no es
// un nombre de pila conocido (p. ej. empezó por los apellidos), no se puede contradecir → compatible.
function givenNameCompatible(appFirst, c, censo = CENSO) {
  const excelFirst = c.givenTok[0]
  if (!appFirst || !excelFirst || appFirst === excelFirst) return true
  if (!knownGiven(censo).has(appFirst)) return true
  const forms = t => new Set([t, ...(APODOS[t] ?? []).map(firstWords)])
  const a = forms(appFirst), e = forms(excelFirst)
  return [...a].some(x => e.has(x))
}
let CENSO = []

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
    const nameTok = fullNameTokens(nombre, apellidos)                       // "nom cognoms"
    const revTok  = [...tokens(apellidos), ...givenTokens(nombre)]          // "cognoms nom" (listado oficial)
    // El censo también usa apodos (FINA, CHELO, NACHO…): variantes con el nombre formal
    const apodoNameToks = apodoVariants(givenTokens(nombre)).map(g => [...g, ...tokens(apellidos)])
    const apodoRevToks  = apodoVariants(givenTokens(nombre)).map(g => [...tokens(apellidos), ...g])
    censo.push({ numeroCenso: num, nombre, apellidos, distintivo,
      nameTok, revTok, fullNameExcel: nameTok.join(' '), fullNameExcelRev: revTok.join(' '),
      apodoNameToks, apodoRevToks, givenTok: givenTokens(nombre),
      surnameSet: new Set(significant(tokens(apellidos))) })
  }
  CENSO = censo
  return { censo, invalid }
}

function match(falleros, censo) {
  const proposals = []   // { f, c, kind }
  const ambiguous = []
  const unmatched = []
  for (const f of falleros) {
    const appTok = appNameTokens(f.nombre, f.apellidos)
    const fullNameApp = appTok.join(' ')
    if (!fullNameApp) { unmatched.push(f); continue }

    const nums = list => `${list.slice(0, 3).map(c => c.numeroCenso).join(', ')}${list.length > 3 ? '…' : ''}`
    const same = (x, y) => x.length === y.length && x.every((t, i) => t === y[i])

    // Variantes de la app: tal cual + con la primera palabra traducida (Paco → Francisco)
    const appApodo = apodoVariants(appTok)
    // Variantes del Excel: tal cual + con su apodo traducido (FINA → Josefina)
    const excelPlain = c => [c.nameTok, c.revTok]
    const excelApodo = c => [...c.apodoNameToks, ...c.apodoRevToks]

    // Cada vía devuelve los candidatos; la primera que encuentre algo decide.
    const tiers = [
      ['exacto',          () => censo.filter(c => excelPlain(c).some(e => same(e, appTok)))],
      ['exacto (apodo)',  () => censo.filter(c =>
        appApodo.some(a => [...excelPlain(c), ...excelApodo(c)].some(e => same(e, a))) ||
        excelApodo(c).some(e => same(e, appTok)))],
      ['parcial',         () => appTok.length < 2 ? [] : censo.filter(c => excelPlain(c).some(e => containsWords(e, appTok)))],
      ['parcial (apodo)', () => censo.filter(c =>
        appApodo.some(a => a.length >= 2 && [...excelPlain(c), ...excelApodo(c)].some(e => containsWords(e, a))) ||
        (appTok.length >= 2 && excelApodo(c).some(e => containsWords(e, appTok))))],
    ]
    let decided = false
    for (const [kind, find] of tiers) {
      const cands = find()
      if (cands.length === 1) { proposals.push({ f, c: cands[0], kind }); decided = true; break }
      if (cands.length > 1) {
        ambiguous.push({ f, motivo: `${cands.length} candidatos en «${kind}» (${nums(cands)})` }); decided = true; break
      }
    }
    if (decided) continue

    // Vía 3: coincidencia de apellidos (≥ 2 palabras en común con los Cognoms del Excel), descartando
    // candidatos cuyo nombre de pila CONTRADIGA el de la app ("Paco" ≠ "José Luis")
    const bySurname = censo.filter(c => surnameOverlap(appTok, c) >= 2 && givenNameCompatible(appTok[0], c))
    if (bySurname.length === 1) { proposals.push({ f, c: bySurname[0], kind: 'parcial (apellidos)' }); continue }
    if (bySurname.length > 1) { ambiguous.push({ f, motivo: `${bySurname.length} personas comparten esos apellidos (${nums(bySurname)})` }); continue }

    unmatched.push(f)
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
const partial = ok.filter(p => p.kind !== 'exacto')
const fname   = f => `${f.nombre ?? ''} ${f.apellidos ?? ''}`.trim() || f.email || f.id

const changes = (list) => list.filter(({ f, c }) => f.numeroCenso !== c.numeroCenso || (f.distintivo ?? null) !== c.distintivo)

console.log(`✅ Cruces exactos: ${exact.length} (${changes(exact).length} con cambios)`)
console.log(`🟡 Cruces parciales: ${partial.length}${PARTIAL ? '' : '  → NO se escriben sin --partial'}`)
for (const { f, c, kind } of partial) console.log(`   · [${kind}] App "${fname(f)}"  →  Excel nº ${c.numeroCenso} "${c.nombre} ${c.apellidos}"`)
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
