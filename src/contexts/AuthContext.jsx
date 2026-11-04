import { createContext, useContext, useEffect, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth'
import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { auth, db, authReady } from '../firebase'
import { syncDirectorio } from '../utils/directorio'

const AuthContext = createContext(null)

// Contador atómico: metadata/counters.ultimoNumeroFallero. Crea el documento fallero
// y asigna el siguiente número en la misma transacción (sin colisiones).
async function createFalleroWithNumber(uid, data) {
  const counterRef = doc(db, 'metadata', 'counters')
  const falleroRef = doc(db, 'falleros', uid)
  const next = await runTransaction(db, async (tx) => {
    const counterSnap = await tx.get(counterRef)
    const next = (counterSnap.exists() ? (counterSnap.data().ultimoNumeroFallero ?? 0) : 0) + 1
    tx.set(counterRef, { ultimoNumeroFallero: next }, { merge: true })
    tx.set(falleroRef, { ...data, numeroFallero: next })
    return next
  })
  // Copia reducida en `directorio` (buscador de acompañantes). No bloquea el registro si falla.
  await syncDirectorio(uid, { ...data, numeroFallero: next })
  return next
}

export function AuthProvider({ children }) {
  const [user, setUser]                   = useState(null)
  const [fallero, setFallero]             = useState(null)
  const [loading, setLoading]             = useState(true)
  const [profileMissing, setProfileMissing] = useState(false)

  useEffect(() => {
    let unsubscribe = () => {}

    // Subscribe to auth state ONLY after localStorage persistence is confirmed active.
    // Without this, onAuthStateChanged can fire with null (before IndexedDB is checked)
    // and push the user to Login — the iPhone PWA loop.
    authReady.then(() => {
      unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        if (firebaseUser) {
          setUser(firebaseUser)
          try {
            const snap = await getDoc(doc(db, 'falleros', firebaseUser.uid))
            if (snap.exists()) {
              setFallero(snap.data())
              setProfileMissing(false)
            } else {
              setFallero(null)
              setProfileMissing(true)
            }
          } catch {
            // Network error — keep user logged in, don't block access
            setProfileMissing(false)
          }
        } else {
          setUser(null)
          setFallero(null)
          setProfileMissing(false)
        }
        setLoading(false)
      })
    })

    // Safety valve: if Firebase hangs (cold start, no network) never block the app forever
    const timeout = setTimeout(() => setLoading(false), 7000)

    return () => { unsubscribe(); clearTimeout(timeout) }
  }, [])

  const login = async (email, password) => {
    const cred = await signInWithEmailAndPassword(auth, email, password)
    const snap = await getDoc(doc(db, 'falleros', cred.user.uid))
    if (snap.exists()) {
      setFallero(snap.data())
      setProfileMissing(false)
    } else {
      setFallero(null)
      setProfileMissing(true)
    }
    return cred
  }

  const register = async (email, password, nombre, apellidos, telefono, fechaNacimiento) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    const data = {
      nombre:          nombre.trim(),
      apellidos:       apellidos?.trim() ?? '',
      email,
      rol:             'fallero',
      estaActivo:      true,
      hijos:           [],
      telefono:        telefono?.trim() ?? '',
      fechaNacimiento: fechaNacimiento ?? '',
      createdAt:       serverTimestamp(),
    }
    const numeroFallero = await createFalleroWithNumber(cred.user.uid, data)
    setFallero({ ...data, numeroFallero })
    setProfileMissing(false)
    return cred
  }

  const completeProfile = async (nombre, apellidos, telefono) => {
    const currentUser = auth.currentUser
    if (!currentUser) throw new Error('No autenticado')
    const data = {
      nombre:         nombre.trim(),
      apellidos:      apellidos.trim(),
      email:          currentUser.email,
      telefono:       telefono.trim(),
      rol:            'fallero',
      estaActivo:     true,
      hijos:          [],
      createdAt:      serverTimestamp(),
    }
    const numeroFallero = await createFalleroWithNumber(currentUser.uid, data)
    setFallero({ ...data, numeroFallero })
    setProfileMissing(false)
  }

  const updateFallero = (patch) => setFallero(prev => ({ ...prev, ...patch }))

  const logout = () => signOut(auth)

  return (
    <AuthContext.Provider value={{ user, fallero, loading, profileMissing, login, register, logout, updateFallero, completeProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
