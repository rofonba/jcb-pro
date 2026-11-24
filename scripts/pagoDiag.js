#!/usr/bin/env node
/* global process */
// ¿Qué pasó con un pago? Reconstruye el rastro de un PaymentIntent en Firestore (y en Stripe si hay clave).
//   node scripts/pagoDiag.js pi_3UfIPQ2OrpQOQqK403K3XxMS
//   node scripts/pagoDiag.js --ultimos 5        → los últimos pedidos (modelo de grupo) y revisiones
// Credenciales: FIREBASE_* (como Vercel) o GOOGLE_APPLICATION_CREDENTIALS. Opcional: STRIPE_SECRET_KEY.
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, STRIPE_SECRET_KEY } = process.env
initializeApp(FIREBASE_PRIVATE_KEY
  ? { credential: cert({ projectId: FIREBASE_PROJECT_ID, clientEmail: FIREBASE_CLIENT_EMAIL, privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') }) }
  : { credential: applicationDefault() })
const db = getFirestore()
const args = process.argv.slice(2)
const fmt = d => d?.toDate ? d.toDate().toLocaleString('es-ES') : String(d ?? '—')
const show = (label, data) => console.log(`\n${label}\n` + JSON.stringify(data, (k, v) => (v && typeof v === 'object' && typeof v.toDate === 'function') ? fmt(v) : v, 2))

if (args[0] === '--ultimos') {
  const n = Number(args[1] ?? 5)
  const ped = await db.collection('pedidos').orderBy('createdAt', 'desc').limit(n).get()
  for (const d of ped.docs) { const p = d.data(); console.log(`• pedido ${d.id} · ${p.estado} · ${p.eventoTitulo ?? p.eventId} · ${p.pagadorNombre} · ${(p.totalConComisionCent ?? 0) / 100} € · ${p.stripePaymentId ?? 'sin PI'} · ${fmt(p.createdAt)}`) }
  const rev = await db.collection('pagosPendientesRevision').orderBy('createdAt', 'desc').limit(n).get()
  console.log(`\nRevisiones manuales (${rev.size}):`)
  for (const d of rev.docs) { const r = d.data(); console.log(`• ${d.id} · ${r.motivo} · ${fmt(r.createdAt)} · ${JSON.stringify({ ...r, createdAt: undefined })}`) }
  process.exit(0)
}

const pi = args[0]
if (!pi) { console.error('Uso: node scripts/pagoDiag.js <pi_…> | --ultimos N'); process.exit(1) }

if (STRIPE_SECRET_KEY) {
  const { default: Stripe } = await import('stripe')
  const intent = await new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' }).paymentIntents.retrieve(pi)
  show('🔵 Stripe PaymentIntent', { status: intent.status, livemode: intent.livemode, amount: intent.amount, amount_received: intent.amount_received, metadata: intent.metadata, created: new Date(intent.created * 1000).toLocaleString('es-ES') })
} else console.log('(sin STRIPE_SECRET_KEY: no se consulta Stripe)')

const rev = await db.collection('pagosPendientesRevision').doc(pi).get()
if (rev.exists) show('🟠 pagosPendientesRevision (el webhook NO marcó pagado):', rev.data())
else console.log('\n🟢 No hay entrada en pagosPendientesRevision para este PI')

const ped = await db.collection('pedidos').where('stripePaymentId', '==', pi).get()
if (ped.size) {
  for (const d of ped.docs) {
    show(`🧾 pedido ${d.id}`, d.data())
    const ins = await db.collection('inscripciones').where('pedidoId', '==', d.id).get()
    console.log(`\n   inscripciones del pedido: ${ins.size}`)
    for (const i of ins.docs) { const x = i.data(); console.log(`   • ${i.id} · ${x.asistenteNombre} · pagado=${x.pagado} · estadoPago=${x.estadoPago} · checkIn=${x.checkIn}`) }
  }
} else {
  const ins = await db.collection('inscripciones').where('stripePaymentId', '==', pi).get()
  if (ins.size) { for (const i of ins.docs) show(`🧾 inscripción clásica ${i.id}`, i.data()) }
  else console.log('\n⚪ Ningún pedido ni inscripción con ese stripePaymentId: el webhook no llegó a ejecutarse (revisa Stripe → Developers → Webhooks, modo LIVE, y STRIPE_WEBHOOK_SECRET).')
}
