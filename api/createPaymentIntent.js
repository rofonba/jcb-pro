// Crea un PaymentIntent en Stripe para un evento de pago.
//
// Seguridad:
//   - Verifica el Firebase ID token del cliente (cabecera Authorization Bearer)
//     y usa SIEMPRE el uid decodificado, nunca el userId que pueda mandar el body.
//   - Lee precio y precioNino del documento del evento en Firestore.
//   - NUNCA confía en el desglose adultos/niños del navegador: éste sólo envía QUIÉN
//     va (type + uid de cada acompañante) y el servidor deduce adulto/niño por edad
//     (fechaNacimiento en Firestore, ≤14 años = niño). Ver api/_lib/pricing.js.
//   - Aplica la fórmula de tarifa inversa con Math.ceil para que la falla
//     reciba el importe íntegro y el usuario cubra el 100% de la comisión.
//
// Modelo de comisión (Stripe Europa, tarjetas estándar):
//   variable: 1,5 %
//   fija:     0,25 €
//   totalConComision = ceil( (neto + 25c) / (1 - 0.015) )  ← Math.ceil para no perder céntimos
//
// Devuelve al cliente: clientSecret + desglose en céntimos.

import Stripe from 'stripe'
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app'
import { getAuth }                              from 'firebase-admin/auth'
import { getFirestore }                         from 'firebase-admin/firestore'
import { computeBreakdown, netCents, PricingError } from './_lib/pricing.js'

const STRIPE_VARIABLE_FEE = 0.015 // 1,5 %
const STRIPE_FIXED_FEE_CENT = 25  // 0,25 €

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
  try {
    const app = adminApp()
    decoded = await getAuth(app).verifyIdToken(bearer.slice(7))
  } catch {
    return res.status(401).json({ error: 'Token inválido' })
  }
  const uid = decoded.uid

  // ── 2. Payload ────────────────────────────────────────────────────────────
  const { eventId, companions, email } = req.body ?? {}
  if (!eventId || typeof eventId !== 'string') {
    return res.status(400).json({ error: 'Falta eventId' })
  }
  // El desglose adulto/niño lo calcula el servidor a partir de las personas y sus fechas de nacimiento
  let aCount, cCount
  try {
    ;({ adultCount: aCount, childCount: cCount } =
      await computeBreakdown(getFirestore(adminApp()), uid, companions ?? []))
  } catch (err) {
    if (err instanceof PricingError) return res.status(err.status).json({ error: err.message })
    return res.status(500).json({ error: 'Error calculando el precio: ' + err.message })
  }

  // Email para el recibo oficial de Stripe. Preferimos el email verificado del token;
  // si no lo trae, usamos el del body siempre que tenga formato válido.
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const bodyEmail = typeof email === 'string' ? email.trim() : ''
  const receiptEmail = decoded.email || (EMAIL_RE.test(bodyEmail) ? bodyEmail : undefined)

  // ── 3. Lee precios + flag pagoApp del evento desde Firestore (única fuente de verdad)
  //    Regla de negocio: si pagoApp !== true, el evento NO acepta cobros online.
  //    El usuario se apunta de forma tradicional y paga en mano en el casal.
  let precio = null
  let precioNino = null
  let eventoTitulo = ''
  try {
    const app = adminApp()
    const evSnap = await getFirestore(app).collection('eventos').doc(eventId).get()
    if (!evSnap.exists) return res.status(404).json({ error: 'Evento no encontrado' })
    const ev = evSnap.data()
    if (ev.pagoApp !== true) {
      return res.status(400).json({ error: 'Este evento no admite pago online. El cobro se realiza en el casal.' })
    }
    precio       = ev.precio
    precioNino   = ev.precioNino != null ? ev.precioNino : ev.precio
    eventoTitulo = ev.titulo ?? ''
    if (precio == null || precio <= 0) {
      return res.status(400).json({ error: 'Este evento es gratuito; no procede pago' })
    }
  } catch (err) {
    return res.status(500).json({ error: 'Error leyendo el evento: ' + err.message })
  }

  // ── 4. Tarifa inversa (Math.ceil — falla recibe importe íntegro) ──────────
  const totalNetoCent = netCents(aCount, cCount, precio, precioNino)
  if (totalNetoCent <= 0) {
    return res.status(400).json({ error: 'El importe neto debe ser mayor que cero' })
  }
  const totalConComisionCent = Math.ceil(
    (totalNetoCent + STRIPE_FIXED_FEE_CENT) / (1 - STRIPE_VARIABLE_FEE),
  )
  const gastosGestionCent = totalConComisionCent - totalNetoCent

  // Stripe rechaza importes < 50 céntimos en EUR
  if (totalConComisionCent < 50) {
    return res.status(400).json({ error: 'Importe demasiado bajo para procesar el pago' })
  }

  // ── 5. PaymentIntent ──────────────────────────────────────────────────────
  try {
    const intent = await stripeClient().paymentIntents.create({
      amount:   totalConComisionCent,
      currency: 'eur',
      automatic_payment_methods: { enabled: true },
      ...(receiptEmail && { receipt_email: receiptEmail }),
      description: eventoTitulo ? `Inscripción a "${eventoTitulo}"` : `Inscripción evento ${eventId}`,
      metadata: {
        eventId,
        userId:     uid,
        adultCount: String(aCount),
        childCount: String(cCount),
        totalNeto:  (totalNetoCent / 100).toFixed(2),
        totalNetoCent: String(totalNetoCent),
      },
    })
    return res.status(200).json({
      clientSecret:     intent.client_secret,
      paymentIntentId:  intent.id,
      totalConComision: totalConComisionCent,
      totalNeto:        totalNetoCent,
      gastosGestion:    gastosGestionCent,
      adultCount:       aCount,   // desglose calculado por el servidor (informativo para la UI)
      childCount:       cCount,
    })
  } catch (err) {
    return res.status(500).json({ error: 'Error creando el PaymentIntent: ' + err.message })
  }
}
