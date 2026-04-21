import { createContext, useContext, useEffect, useState } from 'react'
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [fallero, setFallero] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
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
    return unsubscribe
  }, [])

  const login = async (email, password) => {
    const cred = await signInWithEmailAndPassword(auth, email, password)
    const snap = await getDoc(doc(db, 'falleros', cred.user.uid))
    if (!snap.exists()) {
      await signOut(auth)
      throw new Error('Número de fallero no registrado. Contacta con la comisión.')
    }
    setFallero(snap.data())
    return cred
  }

  const logout = () => signOut(auth)

  return (
    <AuthContext.Provider value={{ user, fallero, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
