#!/usr/bin/env node
/* global process */
// Diagnóstico de notificaciones push SIN enviar nada (dry-run de FCM).
//   node scripts/pushDiag.js            → cuenta tokens, plataformas, antigüedad y valida cada token
//   node scripts/pushDiag.js --clean    → además borra de Firestore los tokens que FCM da por caducados
// Credenciales: FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY (como en Vercel)
//               o GOOGLE_APPLICATION_CREDENTIALS=/ruta/serviceAccount.json
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { buildMessage, sendToTokens } from '../api/sendPush.js'

const CLEAN = process.argv.includes('--clean')
const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env
initializeApp(FIREBASE_PRIVATE_KEY
  ? { credential: cert({ projectId: FIREBASE_PROJECT_ID, clientEmail: FIREBASE_CLIENT_EMAIL, privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') }) }
  : { credential: applicationDefault() })
const db = getFirestore()

const snap = await db.collection('falleros').get()
const withTok = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(f => typeof f.fcmToken === 'string' && f.fcmToken)
console.log(`👥 falleros: ${snap.size} · con fcmToken: ${withTok.length}`)
const plat = withTok.reduce((m, f) => { const k = f.fcmPlatform ?? '?'; m[k] = (m[k] ?? 0) + 1; return m }, {})
console.log('📱 plataformas:', plat)
const days = withTok.map(f => f.fcmTokenUpdatedAt?.toMillis?.()).filter(Boolean).map(t => Math.round((Date.now() - t) / 864e5)).sort((a, b) => a - b)
if (days.length) console.log(`🕒 antigüedad del token (días): min ${days[0]} · mediana ${days[Math.floor(days.length / 2)]} · max ${days[days.length - 1]}`)

const byToken = new Map()
for (const f of withTok) { if (!byToken.has(f.fcmToken)) byToken.set(f.fcmToken, []); byToken.get(f.fcmToken).push(f.id) }
const dup = [...byToken.values()].filter(v => v.length > 1).length
if (dup) console.log(`⚠️  ${dup} token(s) repetidos en varios usuarios (se deduplican al enviar)`)

const tokens = [...byToken.keys()]
if (!tokens.length) { console.log('❌ Nadie tiene notificaciones activadas: no hay a quién enviar.'); process.exit(0) }

const r = await sendToTokens(getMessaging(), tokens, buildMessage('diagnóstico', 'dry-run', 'diag'), { dryRun: true })
console.log(`\n🧪 DRY-RUN FCM → válidos: ${r.sent} · inválidos: ${r.failed}`)
if (Object.keys(r.errors).length) console.log('   códigos:', r.errors)
if (r.stale.size) {
  console.log(`   ${r.stale.size} token(s) caducados (registration-token-not-registered / invalid)`)
  if (CLEAN) {
    const batch = db.batch(); let n = 0
    for (const t of r.stale) for (const uid of byToken.get(t)) { batch.update(db.collection('falleros').doc(uid), { fcmToken: FieldValue.delete(), fcmPlatform: FieldValue.delete(), fcmTokenUpdatedAt: FieldValue.delete() }); n++ }
    await batch.commit(); console.log(`   🧹 limpiados ${n} documentos`)
  } else console.log('   (ejecuta con --clean para borrarlos de Firestore)')
}
if (r.failed === 0) console.log('\n✅ Todos los tokens son válidos: si no llegan, el problema está en el dispositivo (permiso, SW, app en primer plano) o en las variables de Vercel.')
