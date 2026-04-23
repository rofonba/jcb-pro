import { getToken } from 'firebase/messaging'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { messaging, db } from '../firebase'
import { useState, useEffect } from 'react'

const VAPID_KEY   = import.meta.env.VITE_FIREBASE_VAPID_KEY
const STORAGE_KEY = 'jcb_fcm_token_saved'

// Returns the firebase-messaging SW registration, waiting until the worker
// reaches "activated" state. Calling getToken() before activation throws
// "AbortError: no active Service Worker".
async function getSwRegistration() {
  let reg = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js')
  if (!reg) {
    reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' })
  }

  if (!reg.active) {
    await new Promise((resolve, reject) => {
      const tid = setTimeout(
        () => reject(new Error('El Service Worker tardó demasiado en activarse.')),
        8000,
      )
      const sw = reg.installing ?? reg.waiting
      if (!sw) { clearTimeout(tid); resolve(); return }
      sw.addEventListener('statechange', function handler() {
        if (this.state === 'activated') {
          clearTimeout(tid)
          this.removeEventListener('statechange', handler)
          resolve()
        } else if (this.state === 'redundant') {
          clearTimeout(tid)
          this.removeEventListener('statechange', handler)
          reject(new Error('El Service Worker no se pudo activar.'))
        }
      })
    })
  }

  return reg
}

// Saves the FCM token directly into the falleros/{uid} document so it lives
// alongside the rest of the user data and matches the Firestore security rules.
async function persistToken(userId) {
  const swReg = await getSwRegistration()
  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: swReg,
  })
  if (!token) throw new Error('FCM devolvió un token vacío — comprueba la VAPID key.')

  const platform = /iPhone|iPad/.test(navigator.userAgent) ? 'ios'
    : /Android/.test(navigator.userAgent) ? 'android' : 'web'

  try {
    await updateDoc(doc(db, 'falleros', userId), {
      fcmToken:          token,
      fcmPlatform:       platform,
      fcmTokenUpdatedAt: serverTimestamp(),
    })
  } catch (err) {
    const msg = err?.message ?? ''
    const isBlocked = (
      msg.includes('ERR_BLOCKED') ||
      msg.includes('Failed to fetch') ||
      err?.code === 'unavailable' ||
      err?.code === 'failed-precondition'
    )
    throw new Error(
      isBlocked
        ? 'Un bloqueador de anuncios está impidiendo guardar el token. Desactívalo para esta web e inténtalo de nuevo.'
        : msg || 'Error al guardar el token en Firestore.',
    )
  }

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
    () => localStorage.getItem(STORAGE_KEY) === 'true',
  )

  // Silently refresh the token on every app load when permission is already
  // granted. FCM rotates tokens; if we only save on the first click the stored
  // token goes stale and no push ever arrives.
  useEffect(() => {
    if (!messaging || !userId || Notification.permission !== 'granted') return
    persistToken(userId)
      .then(() => setTokenSaved(true))
      .catch(e => console.warn('[FCM] token refresh silencioso falló:', e.message))
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
