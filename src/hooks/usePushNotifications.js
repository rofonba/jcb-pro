import { getToken } from 'firebase/messaging'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { messaging, db } from '../firebase'
import { useState, useEffect } from 'react'

const VAPID_KEY   = import.meta.env.VITE_FIREBASE_VAPID_KEY
const STORAGE_KEY = 'jcb_fcm_token_saved'

// Register (or find) the SW and return the registration.
// Passing serviceWorkerRegistration to getToken() is required for reliable
// token generation on iOS Safari and some Android browsers.
async function getSwRegistration() {
  const existing = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js')
  if (existing) return existing
  return navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' })
}

async function persistToken(userId) {
  const swReg = await getSwRegistration()
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg })
  if (!token) throw new Error('FCM devolvió un token vacío. Comprueba la VAPID key.')

  const platform = /iPhone|iPad/.test(navigator.userAgent) ? 'ios'
    : /Android/.test(navigator.userAgent) ? 'android' : 'web'

  await setDoc(doc(db, 'fcm_tokens', userId), {
    token,
    userId,
    updatedAt: serverTimestamp(),
    platform,
  })
  localStorage.setItem(STORAGE_KEY, 'true')
  return token
}

export function usePushNotifications(userId) {
  const [permission, setPermission] = useState(() => {
    if (typeof Notification === 'undefined') return 'unsupported'
    return Notification.permission
  })
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)
  const [tokenSaved, setTokenSaved] = useState(
    () => localStorage.getItem(STORAGE_KEY) === 'true'
  )

  // Silently refresh the token on every app load when permission is already
  // granted. FCM rotates tokens periodically; if we only save on the first
  // click the stored token goes stale and no push ever arrives.
  useEffect(() => {
    if (!messaging || !userId || Notification.permission !== 'granted') return
    persistToken(userId)
      .then(() => setTokenSaved(true))
      .catch(e => console.warn('[FCM] token refresh silencioso falló:', e))
  }, [userId])

  async function enableNotifications() {
    if (!messaging) {
      setError('Tu navegador no soporta notificaciones push.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await Notification.requestPermission()
      setPermission(result)
      if (result !== 'granted') return
      await persistToken(userId)
      setTokenSaved(true)
    } catch (err) {
      console.error('[usePushNotifications]', err)
      setError(err?.message || 'No se pudo activar las notificaciones.')
    } finally {
      setLoading(false)
    }
  }

  return { permission, loading, error, tokenSaved, enableNotifications }
}
