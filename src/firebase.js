import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import { getMessaging } from 'firebase/messaging'

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

const missing = Object.entries(firebaseConfig).filter(([, v]) => !v).map(([k]) => k)
if (missing.length) {
  console.error(
    '[firebase.js] ❌ FALTAN variables de entorno en Vercel:\n' +
    missing.map(k => `  · ${k}`).join('\n') +
    '\n→ Ve a Vercel → Project → Settings → Environment Variables y añádelas.'
  )
}

export const app  = initializeApp(firebaseConfig)
export const db   = getFirestore(app)
export const auth = getAuth(app)

let _messaging = null
try {
  if (typeof window !== 'undefined' && 'Notification' in window) {
    _messaging = getMessaging(app)
  }
} catch (_) { /* messaging no disponible en este entorno */ }
export const messaging = _messaging
