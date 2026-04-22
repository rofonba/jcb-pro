import { createContext, useContext, useEffect, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db, authReady } from '../firebase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [fallero, setFallero] = useState(null)
  const [loading, setLoading] = useState(true)

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
            setFallero(snap.exists() ? snap.data() : null)
          } catch {
            // Network error — keep user logged in, fallero data stays null
          }
        } else {
          setUser(null)
          setFallero(null)
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
    if (!snap.exists()) {
      await signOut(auth)
      throw new Error('Cuenta no encontrada. Regístrate o contacta con la comisión.')
    }
    setFallero(snap.data())
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
    await setDoc(doc(db, 'falleros', cred.user.uid), data)
    setFallero(data)
    return cred
  }

  const updateFallero = (patch) => setFallero(prev => ({ ...prev, ...patch }))

  const logout = () => signOut(auth)

  return (
    <AuthContext.Provider value={{ user, fallero, loading, login, register, logout, updateFallero }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
