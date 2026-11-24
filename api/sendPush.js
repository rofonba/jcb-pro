// Envío de notificaciones push (FCM) a TODOS los dispositivos registrados.
//
// Sólo admin/directiva (se verifica el ID token y el rol en Firestore).
// Tokens: campo `fcmToken` de cada doc falleros/{uid} (los guarda usePushNotifications.js).
//
// Robustez:
//   · sendEachForMulticast en LOTES de 500 (límite de FCM); un lote que falle no tumba al resto.
//   · Cada token se evalúa por separado: los caducados (registration-token-not-registered /
//     invalid-registration-token / invalid-argument) se borran de TODOS los docs que los tengan.
//   · Nunca se lanza por un token: la respuesta siempre llega con { sent, failed, … }.
//   · Cada envío queda registrado en `push_logs` (quién, qué, cuándo, resultado) → AdminMetrics.

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app'
import { getAuth }                              from 'firebase-admin/auth'
import { getFirestore, FieldValue }             from 'firebase-admin/firestore'
import { getMessaging }                         from 'firebase-admin/messaging'

const BATCH = 500

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

const STALE_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',          // token malformado
])

export function buildMessage(title, body, tag) {
  return {
    notification: { title, body: body ?? '' },
    webpush: {
      headers: { Urgency: 'high' },
      notification: {
        icon: '/logo-falla.png', badge: '/logo-falla.png',
        vibrate: [200, 100, 200], tag, renotify: false,
      },
      fcmOptions: { link: '/' },
    },
    apns: {
      headers: { 'apns-priority': '10', 'apns-collapse-id': tag.slice(0, 64) },
      payload: { aps: { sound: 'default', badge: 1 } },
    },
  }
}

// Envía a todos los tokens en lotes. Devuelve { sent, failed, stale:Set<token>, errors:{code:n} }.
export async function sendToTokens(messaging, tokens, message, { dryRun = false } = {}) {
  const out = { sent: 0, failed: 0, stale: new Set(), errors: {} }
  for (let i = 0; i < tokens.length; i += BATCH) {
    const chunk = tokens.slice(i, i + BATCH)
    let result
    try {
      result = await messaging.sendEachForMulticast({ ...message, tokens: chunk }, dryRun)
    } catch (err) {
      // Fallo del lote entero (red, cuota…): se cuenta y se sigue con el siguiente
      out.failed += chunk.length
      out.errors[err.code ?? 'batch-error'] = (out.errors[err.code ?? 'batch-error'] ?? 0) + chunk.length
      console.error('[sendPush] lote', i / BATCH, 'falló:', err.message)
      continue
    }
    out.sent   += result.successCount
    out.failed += result.failureCount
    result.responses.forEach((r, j) => {
      if (r.success) return
      const code = r.error?.code ?? 'unknown'
      out.errors[code] = (out.errors[code] ?? 0) + 1
      if (STALE_CODES.has(code)) out.stale.add(chunk[j])
    })
  }
  return out
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' })

  const bearer = req.headers.authorization
  if (!bearer?.startsWith('Bearer ')) return res.status(401).json({ error: 'Sin token' })

  let app, decoded
  try {
    app = adminApp()
    decoded = await getAuth(app).verifyIdToken(bearer.slice(7))
  } catch (err) {
    const envMissing = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'].filter(k => !process.env[k])
    if (envMissing.length) return res.status(500).json({ error: `Faltan variables de entorno en Vercel: ${envMissing.join(', ')}` })
    return res.status(401).json({ error: 'Token inválido: ' + err.message })
  }

  const db = getFirestore(app)
  const adminSnap = await db.collection('falleros').doc(decoded.uid).get()
  const admin = adminSnap.data() ?? {}
  if (admin.rol !== 'admin' && admin.rol !== 'directiva') return res.status(403).json({ error: 'No autorizado' })

  const { title, body } = req.body ?? {}
  if (!title || typeof title !== 'string') return res.status(400).json({ error: 'Falta el título' })

  const logRef = db.collection('push_logs').doc()
  const base = {
    title: title.trim().slice(0, 200), body: String(body ?? '').trim().slice(0, 1000),
    adminUid: decoded.uid, adminNombre: `${admin.nombre ?? ''} ${admin.apellidos ?? ''}`.trim() || null,
    adminEmail: decoded.email ?? admin.email ?? null,
    createdAt: FieldValue.serverTimestamp(),
  }

  try {
    // Tokens registrados (dedupe: un mismo dispositivo puede figurar en varios docs)
    const snap = await db.collection('falleros').where('fcmToken', '!=', null).get()
    const docsByToken = new Map()   // token → [uid]
    for (const d of snap.docs) {
      const t = d.data().fcmToken
      if (typeof t !== 'string' || !t) continue
      if (!docsByToken.has(t)) docsByToken.set(t, [])
      docsByToken.get(t).push(d.id)
    }
    const tokens = [...docsByToken.keys()]

    if (!tokens.length) {
      await logRef.set({ ...base, tokens: 0, sent: 0, failed: 0, staleRemoved: 0, errors: {} })
      return res.json({ sent: 0, failed: 0, tokens: 0, staleRemoved: 0, warning: 'Ningún usuario tiene notificaciones activadas.' })
    }

    const tag = `jcb_${Date.now()}`
    const r = await sendToTokens(getMessaging(app), tokens, buildMessage(base.title, base.body, tag))

    // Limpieza de tokens caducados en TODOS los docs que los contengan
    let staleRemoved = 0
    if (r.stale.size) {
      const batch = db.batch()
      for (const t of r.stale) for (const uid of docsByToken.get(t) ?? []) {
        batch.update(db.collection('falleros').doc(uid), {
          fcmToken: FieldValue.delete(), fcmPlatform: FieldValue.delete(), fcmTokenUpdatedAt: FieldValue.delete(),
        })
        staleRemoved++
      }
      await batch.commit().catch(err => console.error('[sendPush] limpieza tokens:', err.message))
    }

    const summary = { tokens: tokens.length, sent: r.sent, failed: r.failed, staleRemoved, errors: r.errors }
    await logRef.set({ ...base, ...summary }).catch(err => console.error('[sendPush] push_logs:', err.message))
    return res.json(summary)
  } catch (err) {
    console.error('[sendPush]', err)
    await logRef.set({ ...base, tokens: null, sent: 0, failed: 0, staleRemoved: 0, errors: { fatal: 1 }, error: err.message }).catch(() => {})
    return res.status(500).json({ error: err.message })
  }
}
