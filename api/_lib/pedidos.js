// Checkout de GRUPO (modelo v2): un documento de `inscripciones` por asistente, agrupados por
// `pedidoId`, con un único cobro en Stripe (una sola comisión fija de 0,25 €).
//
// Lo comparten /api/createGroupCheckout (crea pedido + inscripciones pendientes + PaymentIntent)
// y /api/stripe-webhook (verifica y marca pagados). El navegador sólo dice QUIÉN va; el servidor
// decide adulto/niño por edad (misma regla que pricing.js) y calcula todos los importes.
//
// Tipos de asistente que acepta el cliente:
//   { tipo:'titular' }                                       → el propio pagador
//   { tipo:'familiar'|'fallero', uid }                        → fallero con app (falleros/{uid})
//   { tipo:'hijo', key:'<uidPadre>|h<i>' }                    → hijo del censo (falleros/{padre}.hijos[i])
//   { tipo:'fallero', uid:null, nombre, apellidos, categoria } → fallero SIN app (texto libre)
//   { tipo:'invitado', nombre, apellidos, categoria }         → persona de fuera de la falla
//
// El prefijo `_` evita que Vercel exponga este fichero como endpoint.

import { FieldValue } from 'firebase-admin/firestore'
import { ageYears, madridToday, CHILD_MAX_AGE, PricingError } from './pricing.js'

export const MAX_ASISTENTES   = 30
export const PENDING_TTL_MS   = 15 * 60 * 1000   // igual que src/utils/inscripciones.js
export const STRIPE_VARIABLE_FEE  = 0.015
export const STRIPE_FIXED_FEE_CENT = 25

const TIPOS = new Set(['titular', 'familiar', 'fallero', 'hijo', 'invitado'])
const HIJO_RE = /^(.+)\|h(\d+)$/

const cleanName = s => String(s ?? '').trim().replace(/\s+/g, ' ').slice(0, 80)
const fullName  = f => `${f?.nombre ?? ''} ${f?.apellidos ?? ''}`.trim()

export function tarifaInversa(totalNetoCent) {
  const totalConComisionCent = Math.ceil((totalNetoCent + STRIPE_FIXED_FEE_CENT) / (1 - STRIPE_VARIABLE_FEE))
  return { totalConComisionCent, gastosGestionCent: totalConComisionCent - totalNetoCent }
}

// Id determinista por persona (bloqueo de duplicados en Firestore, no sólo en pantalla).
// Personas sin clave (sin app / invitados) → id por pedido.
export function inscripcionId(eventId, pedidoId, linea, idx) {
  return linea.asistenteKey ? `${eventId}_${linea.asistenteKey}` : `${eventId}_${pedidoId}_${idx}`
}

// Valida la lista del cliente y resuelve cada persona contra Firestore.
// Devuelve las líneas con categoría y precio, ya listas para guardar.
export async function resolveLineas(db, payerUid, asistentes, ev) {
  if (!Array.isArray(asistentes) || asistentes.length === 0) throw new PricingError('No hay asistentes')
  if (asistentes.length > MAX_ASISTENTES) throw new PricingError('Demasiados asistentes')

  const precioAdulto = Number(ev.precio ?? 0)
  const precioNino   = ev.precioNino != null ? Number(ev.precioNino) : precioAdulto
  const priceFor     = cat => Math.round((cat === 'nino' ? precioNino : precioAdulto) * 100)

  const keys = new Set()
  const ids  = new Set([payerUid])
  const raw  = []
  for (const a of asistentes) {
    const tipo = a?.tipo
    if (!TIPOS.has(tipo)) throw new PricingError('Tipo de asistente no válido')
    if (tipo === 'titular') {
      if (keys.has(payerUid)) throw new PricingError('Asistente repetido')
      keys.add(payerUid); raw.push({ tipo, uid: payerUid }); continue
    }
    if (tipo === 'hijo') {
      const key = typeof a.key === 'string' ? a.key : ''
      const m = HIJO_RE.exec(key)
      if (!m || keys.has(key)) throw new PricingError('Hijo del censo no válido o repetido')
      keys.add(key); ids.add(m[1]); raw.push({ tipo, key, parent: m[1], idx: Number(m[2]) }); continue
    }
    if (tipo === 'invitado' || (tipo === 'fallero' && a.uid == null)) {
      const nombre = cleanName(a.nombre), apellidos = cleanName(a.apellidos)
      if (nombre.length < 2 || apellidos.length < 2) throw new PricingError('Nombre y apellidos obligatorios')
      if (a.categoria !== 'adulto' && a.categoria !== 'nino') throw new PricingError('Indica si es adulto o infantil')
      raw.push({ tipo, nombre, apellidos, categoria: a.categoria }); continue
    }
    // familiar | fallero con app
    const uid = typeof a.uid === 'string' ? a.uid : ''
    if (!uid || uid === payerUid || keys.has(uid)) throw new PricingError('Fallero no válido o repetido')
    keys.add(uid); ids.add(uid); raw.push({ tipo, uid })
  }

  const snaps = await db.getAll(...[...ids].map(id => db.collection('falleros').doc(id)))
  const docs  = new Map(snaps.map(s => [s.id, s.exists ? s.data() : null]))
  const payer = docs.get(payerUid)
  if (!payer) throw new PricingError('Tu perfil de fallero no existe')
  const today = madridToday()
  const catByAge = (dob, unknown) => { const age = ageYears(dob, today); return age == null ? unknown : (age <= CHILD_MAX_AGE ? 'nino' : 'adulto') }

  const lineas = raw.map(r => {
    let categoria, asistenteUid = null, asistenteKey = null, asistenteNombre
    if (r.tipo === 'titular' || ((r.tipo === 'familiar' || r.tipo === 'fallero') && r.uid)) {
      const d = docs.get(r.uid)
      if (!d) throw new PricingError('Fallero no encontrado')
      categoria = catByAge(d.fechaNacimiento, 'adulto')      // sin fecha → adulto (no demostrable)
      asistenteUid = r.uid; asistenteKey = r.uid; asistenteNombre = fullName(d)
    } else if (r.tipo === 'hijo') {
      const h = docs.get(r.parent)?.hijos?.[r.idx]
      if (h == null) throw new PricingError('Hijo del censo no encontrado')
      categoria = catByAge(typeof h === 'object' ? h.fechaNacimiento : null, 'nino')
      asistenteKey = r.key; asistenteNombre = typeof h === 'string' ? h : (h?.nombre ?? 'Hijo/a')
    } else {
      categoria = r.categoria; asistenteNombre = `${r.nombre} ${r.apellidos}`
    }
    return { tipo: r.tipo, asistenteUid, asistenteKey, asistenteNombre, categoria, precioNetoCent: priceFor(categoria) }
  })

  return { lineas, pagadorNombre: fullName(payer) }
}

export const sumNeto = lineas => lineas.reduce((s, l) => s + l.precioNetoCent, 0)

export function buildInscripcion({ eventId, pedidoId, pagadorUid, pagadorNombre, linea, cobraOnline }) {
  return {
    modelo: 2,
    eventId, pedidoId, pagadorUid, pagadorNombre,
    tipo:            linea.tipo,
    asistenteUid:    linea.asistenteUid,
    asistenteKey:    linea.asistenteKey,
    asistenteNombre: linea.asistenteNombre,
    categoria:       linea.categoria,
    precioNetoCent:  linea.precioNetoCent,
    pagado:          false,
    estadoPago:      cobraOnline ? 'pendiente' : null,
    checkIn:         false,
    createdAt:       FieldValue.serverTimestamp(),
  }
}

// ¿Esta inscripción (v2) ocupa plaza? Pagada, o pendiente reciente (reserva en curso).
export function ocupaPlaza(ins, nowMs = Date.now()) {
  if (ins.pagado === true || ins.estadoPago !== 'pendiente') return true
  const t = ins.createdAt?.toMillis?.()
  return t != null && nowMs - t <= PENDING_TTL_MS
}
