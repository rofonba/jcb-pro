// Webhook de Stripe — ÚNICA vía por la que una inscripción pasa a pagado: true.
//
// Seguridad:
//   - Verifica la firma con STRIPE_WEBHOOK_SECRET sobre el body RAW (sin parsear).
//   - Sólo actúa con payment_intent.succeeded.
//   - Los importes salen del propio PaymentIntent (amount_received) y de los metadata
//     que escribió nuestro backend en createPaymentIntent; nunca del cliente.
//   - Comprueba que las personas pagadas coinciden con las de la inscripción
//     (si no, NO marca pagado y deja el caso en `pagosPendientesRevision`).
//   - Idempotente: Stripe puede reenviar el mismo evento.
//
// Configuración (Stripe Dashboard → Developers → Webhooks):
//   Endpoint: https://<tu-dominio>/api/stripe-webhook   Evento: payment_intent.succeeded
//   Variable de entorno en Vercel: STRIPE_WEBHOOK_SECRET (whsec_...)

import Stripe from 'stripe'
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app'
import { getFirestore, FieldValue }             from 'firebase-admin/firestore'

// Necesario para poder verificar la firma: Vercel no debe parsear el body.
export const config = { api: { bodyParser: false } }

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
  if (!key) throw new Error('Falta STRIPE_SECRET_KEY')
  _stripe = new Stripe(key, { apiVersion: '2024-06-20' })
  return _stripe
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', c => chunks.push(typeof c === 'string' ? Buffer.from(c) : c))
    req.on('end',  () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

const round2 = n => Math.round(n * 100) / 100

async function handleSucceeded(pi) {
  const db = getFirestore(adminApp())
  const { eventId, userId } = pi.metadata ?? {}
  if (!eventId || !userId) {
    console.error('[stripe-webhook] PaymentIntent sin metadata eventId/userId', pi.id)
    return // 200: no es un pago de la app, no tiene sentido reintentar
  }

  const totalConComision = round2((pi.amount_received ?? pi.amount) / 100)
  const totalNeto        = round2(Number(pi.metadata.totalNeto))
  const gastosGestion    = round2(totalConComision - totalNeto)
  const personasPagadas  = Number(pi.metadata.adultCount) + Number(pi.metadata.childCount)

  const ref = db.collection('inscripciones').doc(`${userId}_${eventId}`)

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const revisionRef = db.collection('pagosPendientesRevision').doc(pi.id)

    // Cobro sin inscripción (p. ej. el usuario la anuló durante el pago): revisión manual.
    if (!snap.exists) {
      tx.set(revisionRef, {
        motivo: 'sin-inscripcion', eventId, userId, stripePaymentId: pi.id,
        totalConComision, createdAt: FieldValue.serverTimestamp(),
      })
      return
    }

    const ins = snap.data()
    if (ins.pagado === true && ins.stripePaymentId === pi.id) return // reenvío: ya procesado

    // Lo cobrado debe cubrir a todas las personas inscritas.
    if (!Number.isFinite(personasPagadas) || personasPagadas !== (ins.totalPersonas ?? 1)) {
      tx.set(revisionRef, {
        motivo: 'personas-no-coinciden', eventId, userId, stripePaymentId: pi.id,
        totalConComision, personasPagadas, personasInscritas: ins.totalPersonas ?? 1,
        createdAt: FieldValue.serverTimestamp(),
      })
      return
    }

    tx.update(ref, {
      pagado:           true,
      pagadoAt:         FieldValue.serverTimestamp(),
      stripePaymentId:  pi.id,
      totalNeto,
      totalConComision,
      gastosGestion,
      estadoPago:       FieldValue.delete(),
    })
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const secret = process.env.STRIPE_WEBHOOK_SECRET
  const sig    = req.headers['stripe-signature']
  if (!secret || !sig) return res.status(400).json({ error: 'Falta firma o secret' })

  let event
  try {
    const raw = await readRawBody(req)
    event = stripeClient().webhooks.constructEvent(raw, sig, secret)
  } catch (err) {
    console.error('[stripe-webhook] firma inválida:', err.message)
    return res.status(400).json({ error: 'Firma inválida' })
  }

  if (event.type === 'payment_intent.succeeded') {
    try {
      await handleSucceeded(event.data.object)
    } catch (err) {
      // 500 → Stripe reintenta automáticamente (hasta 3 días).
      console.error('[stripe-webhook] error procesando', event.id, err)
      return res.status(500).json({ error: 'Error procesando el evento' })
    }
  }

  return res.status(200).json({ received: true })
}
