import { createContext, useContext, useEffect, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../firebase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [fallero, setFallero] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser)
        const snap = await getDoc(doc(db, 'falleros', firebaseUser.uid))
        setFallero(snap.exists() ? snap.data() : null)
      } else {
        setUser(null)
        setFallero(null)
      }
      setLoading(false)
    })
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

  const register = async (email, password, nombre, apellidos) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    const data = {
      nombre:     nombre.trim(),
      apellidos:  apellidos.trim(),
      email,
      rol:        'fallero',
      estaActivo: true,
      hijos:      [],
      createdAt:  serverTimestamp(),
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
