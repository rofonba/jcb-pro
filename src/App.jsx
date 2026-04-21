import { useState, useEffect } from 'react'
import { useAuth } from './contexts/AuthContext'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import SplashScreen from './components/SplashScreen'

function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(150deg, #080818, #1c0509)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: '44px', height: '44px',
        border: '3px solid rgba(201,168,76,0.15)',
        borderTopColor: '#C9A84C',
        borderRadius: '50%',
        animation: 'falla-spin 0.75s linear infinite',
      }} />
    </div>
  )
}

export default function App() {
  const { user, loading } = useAuth()
  const [showSplash, setShowSplash]       = useState(true)
  const [splashVisible, setSplashVisible] = useState(true)

  useEffect(() => {
    const t1 = setTimeout(() => setSplashVisible(false), 2500)
    const t2 = setTimeout(() => setShowSplash(false), 3200)
    const t3 = setTimeout(() => { setSplashVisible(false); setShowSplash(false) }, 5000)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [])

  return (
    <>
      {showSplash && <SplashScreen visible={splashVisible} />}
      {loading ? <LoadingScreen /> : (user ? <Dashboard /> : <Login />)}
    </>
  )
}
