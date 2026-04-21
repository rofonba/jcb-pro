import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import { getMessaging } from 'firebase/messaging'

// Las API keys de Firebase web son públicas por diseño.
// La seguridad real se gestiona vía Firestore Rules y Authentication.
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

if (import.meta.env.DEV) {
  const missing = Object.entries(firebaseConfig)
    .filter(([, v]) => !v)
    .map(([k]) => k)
  if (missing.length) {
    console.error('[firebase.js] Faltan variables de entorno:', missing.join(', '))
  }
}

export const app      = initializeApp(firebaseConfig)
export const db       = getFirestore(app)
export const auth     = getAuth(app)

let _messaging = null
try {
  if (typeof window !== 'undefined' && 'Notification' in window) {
    _messaging = getMessaging(app)
  }
} catch (_) { /* messaging no disponible en este entorno */ }
export const messaging = _messaging
