// Checkout de GRUPO: UN pago para varios asistentes (modelo v2: un doc por asistente).
//
// POST { eventId, asistentes:[...] }  (Authorization: Bearer <Firebase ID token>)
//   → { pedidoId, clientSecret, paymentIntentId, inscripcionIds, lineas, totalNeto, totalConComision, gastosGestion }
//
// Seguridad:
//   - uid SIEMPRE del token. pagadorUid = uid; nadie paga "en nombre de" otro.
//   - Precios, categorías (edad) e importes: sólo el servidor (api/_lib/pedidos.js).
//   - Todo en UNA transacción: duplicados (ids deterministas), aforo y creación de las
//     inscripciones en 'pendiente'. El webhook es el único que las pasa a pagadas.
//   - Una reserva pendiente caduca a los 15 min: entonces otro puede inscribir a esa persona.

import Stripe from 'stripe'
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app'
import { getAuth }      from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { PricingError } from './_lib/pricing.js'
import { resolveLineas, sumNeto, tarifaInversa, inscripcionId, buildInscripcion, ocupaPlaza } from './_lib/pedidos.js'

function adminApp() {
  if (getApps().length) return getApp()
  return initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  })
}

let _stripe = null
function stripeClient() {
  if (_stripe) return _stripe
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('Falta STRIPE_SECRET_KEY en variables de entorno.')
  _stripe = new Stripe(key, { apiVersion: '2024-06-20' })
  return _stripe
}

class ConflictError extends Error { constructor(msg, detail) { super(msg); this.status = 409; this.detail = detail } }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' })

  // ── 1. Auth ───────────────────────────────────────────────────────────────
  const bearer = req.headers.authorization
  if (!bearer?.startsWith('Bearer ')) return res.status(401).json({ error: 'Sin token' })
  let decoded
  try { decoded = await getAuth(adminApp()).verifyIdToken(bearer.slice(7)) }
  catch { return res.status(401).json({ error: 'Token inválido' }) }
  const uid = decoded.uid
  const db  = getFirestore(adminApp())

  // ── 2. Evento ─────────────────────────────────────────────────────────────
  const { eventId, asistentes } = req.body ?? {}
  if (!eventId || typeof eventId !== 'string') return res.status(400).json({ error: 'Falta eventId' })
  const evSnap = await db.collection('eventos').doc(eventId).get()
  if (!evSnap.exists) return res.status(404).json({ error: 'Evento no encontrado' })
  const ev = evSnap.data()
  if (ev.pagoApp !== true || !(ev.precio > 0)) {
    return res.status(400).json({ error: 'Este evento no se cobra online: la inscripción se guarda directamente desde la app.' })
  }
  if (ev.fechaLimite && new Date(`${ev.fechaLimite}T23:59:59`) < new Date()) {
    return res.status(400).json({ error: 'El plazo de inscripción ha terminado.' })
  }

  // ── 3. Personas → líneas con categoría y precio (servidor) ────────────────
  let lineas, pagadorNombre
  try { ({ lineas, pagadorNombre } = await resolveLineas(db, uid, asistentes, ev)) }
  catch (err) {
    if (err instanceof PricingError) return res.status(err.status).json({ error: err.message })
    return res.status(500).json({ error: 'Error calculando el precio: ' + err.message })
  }
  const totalNetoCent = sumNeto(lineas)
  if (totalNetoCent <= 0) return res.status(400).json({ error: 'El importe debe ser mayor que cero' })
  const { totalConComisionCent, gastosGestionCent } = tarifaInversa(totalNetoCent)
  if (totalConComisionCent < 50) return res.status(400).json({ error: 'Importe demasiado bajo para procesar el pago' })

  // ── 4. Transacción: duplicados + aforo + inscripciones pendientes + pedido ──
  const pedidoRef = db.collection('pedidos').doc()
  const pedidoId  = pedidoRef.id
  const ids       = lineas.map((l, i) => inscripcionId(eventId, pedidoId, l, i))
  const insCol    = db.collection('inscripciones')
  const adultCount = lineas.filter(l => l.categoria === 'adulto').length
  const childCount = lineas.length - adultCount

  try {
    await db.runTransaction(async (tx) => {
      const now = Date.now()
      // Aforo: todo lo que ocupa plaza en el evento (v1: totalPersonas; v2: 1 por doc)
      if (ev.plazasTotal != null && ev.plazasTotal > 0) {
        const all = await tx.get(insCol.where('eventId', '==', eventId))
        let ocupadas = 0
        for (const d of all.docs) {
          const x = d.data()
          if (!ocupaPlaza(x, now) || ids.includes(d.id)) continue   // caducadas o las que vamos a sobrescribir
          ocupadas += x.modelo === 2 ? 1 : (x.totalPersonas ?? 1)
        }
        if (ocupadas + lineas.length > ev.plazasTotal) {
          throw new ConflictError(`Sólo quedan ${Math.max(0, ev.plazasTotal - ocupadas)} plazas.`, { aforo: true })
        }
      }
      // Duplicados: la persona ya está inscrita (pagada o reserva reciente de otro)
      const existing = await tx.getAll(...ids.map(id => insCol.doc(id)))
      const conflictos = []
      existing.forEach((s, i) => {
        if (!s.exists) return
        const x = s.data()
        if (ocupaPlaza(x, now)) conflictos.push({ nombre: lineas[i].asistenteNombre, por: x.pagadorNombre ?? 'otra persona', pendiente: x.pagado !== true })
      })
      if (conflictos.length) {
        throw new ConflictError(conflictos.map(c => `${c.nombre}: ${c.pendiente ? 'reserva en curso' : 'ya inscrito/a'} por ${c.por}`).join(' · '), { conflictos })
      }
      lineas.forEach((l, i) => tx.set(insCol.doc(ids[i]), buildInscripcion({ eventId, pedidoId, pagadorUid: uid, pagadorNombre, linea: l, cobraOnline: true })))
      tx.set(pedidoRef, {
        eventId, pagadorUid: uid, pagadorNombre, estado: 'pendiente', stripePaymentId: null,
        lineas: lineas.map((l, i) => ({ inscripcionId: ids[i], ...l })),
        adultCount, childCount, totalNetoCent, totalConComisionCent, gastosGestionCent,
        createdAt: FieldValue.serverTimestamp(),
      })
    })
  } catch (err) {
    if (err instanceof ConflictError) return res.status(409).json({ error: err.message, ...err.detail })
    return res.status(500).json({ error: 'Error reservando las plazas: ' + err.message })
  }

  // ── 5. PaymentIntent (una sola comisión fija para todo el grupo) ──────────
  try {
    const intent = await stripeClient().paymentIntents.create({
      amount:   totalConComisionCent,
      currency: 'eur',
      automatic_payment_methods: { enabled: true },
      ...(decoded.email && { receipt_email: decoded.email }),
      description: `Inscripción a "${ev.titulo ?? eventId}" · ${lineas.length} ${lineas.length === 1 ? 'persona' : 'personas'}`,
      metadata: {
        pedidoId, eventId, pagadorUid: uid,
        numAsistentes: String(lineas.length), adultCount: String(adultCount), childCount: String(childCount),
        totalNetoCent: String(totalNetoCent),
      },
    })
    await pedidoRef.update({ stripePaymentId: intent.id })
    return res.status(200).json({
      pedidoId, clientSecret: intent.client_secret, paymentIntentId: intent.id,
      inscripcionIds: ids,
      lineas: lineas.map((l, i) => ({ inscripcionId: ids[i], tipo: l.tipo, asistenteNombre: l.asistenteNombre, categoria: l.categoria, precioNetoCent: l.precioNetoCent })),
      totalNeto: totalNetoCent, totalConComision: totalConComisionCent, gastosGestion: gastosGestionCent,
    })
  } catch (err) {
    // Sin PaymentIntent no hay cobro posible: liberamos las reservas.
    const batch = db.batch()
    ids.forEach(id => batch.delete(insCol.doc(id)))
    batch.delete(pedidoRef)
    await batch.commit().catch(() => {})
    return res.status(500).json({ error: 'Error creando el pago: ' + err.message })
  }
}
