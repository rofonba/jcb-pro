import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app'
import { getAuth }      from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST')   return res.status(405).end()

  const bearer = req.headers.authorization
  if (!bearer?.startsWith('Bearer ')) return res.status(401).json({ error: 'Sin token' })

  try {
    const app = adminApp()

    // Verify Firebase ID token
    const decoded = await getAuth(app).verifyIdToken(bearer.slice(7))

    // Only admin / directiva can send push
    const db      = getFirestore(app)
    const fallero = await db.collection('falleros').doc(decoded.uid).get()
    const rol     = fallero.data()?.rol
    if (rol !== 'admin' && rol !== 'directiva') {
      return res.status(403).json({ error: 'No autorizado' })
    }

    const { title, body } = req.body ?? {}
    if (!title) return res.status(400).json({ error: 'Falta el título' })

    // Fetch all registered FCM tokens
    const snap      = await db.collection('fcm_tokens').get()
    const tokenDocs = snap.docs
      .map(d => ({ uid: d.id, token: d.data().token }))
      .filter(d => d.token)

    if (!tokenDocs.length) return res.json({ sent: 0, failed: 0 })

    const result = await getMessaging(app).sendEachForMulticast({
      tokens: tokenDocs.map(d => d.token),
      notification: { title, body: body ?? '' },
      webpush: {
        headers:      { Urgency: 'high' },
        notification: { icon: '/icons.svg', badge: '/icons.svg', vibrate: [200, 100, 200] },
      },
      apns: {
        headers: { 'apns-priority': '10' },
        payload: { aps: { sound: 'default', badge: 1 } },
      },
    })

    // Remove stale / invalid tokens
    const staleUids = tokenDocs
      .filter((_, i) => {
        const code = result.responses[i]?.error?.code ?? ''
        return (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token'
        )
      })
      .map(d => d.uid)

    if (staleUids.length) {
      await Promise.all(staleUids.map(uid => db.collection('fcm_tokens').doc(uid).delete()))
    }

    res.json({ sent: result.successCount, failed: result.failureCount })
  } catch (err) {
    console.error('[sendPush]', err)
    res.status(500).json({ error: err.message })
  }
}
