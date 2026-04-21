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
  const [showSplash, setShowSplash]     = useState(true)
  const [splashVisible, setSplashVisible] = useState(true)

  // Proof-of-life: si ves el borde rojo, el JS se ejecuta
  useEffect(() => {
    document.body.style.border = '5px solid red'
    console.log('FLASH: App montada — JS ejecutándose ✅')
    console.log('FLASH: user =', typeof window !== 'undefined' ? 'browser OK' : 'no window')
  }, [])

  useEffect(() => {
    console.log('FLASH: Timers del Splash iniciados')
    let t1, t2, t3
    try {
      t1 = setTimeout(() => {
        console.log('FLASH: Forzando salida del Splash (fade-out)')
        setSplashVisible(false)
      }, 2500)
      t2 = setTimeout(() => {
        console.log('FLASH: Splash eliminado del DOM')
        setShowSplash(false)
        document.body.style.border = ''
      }, 3200)
      t3 = setTimeout(() => {
        console.log('FLASH: FAILSAFE activado')
        setSplashVisible(false)
        setShowSplash(false)
        document.body.style.border = ''
      }, 5000)
    } catch (e) {
      console.error('FLASH: Error en timers', e)
      setSplashVisible(false)
      setShowSplash(false)
    }
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [])

  return (
    <>
      {showSplash && <SplashScreen visible={splashVisible} />}
      {loading ? <LoadingScreen /> : (user ? <Dashboard /> : <Login />)}
    </>
  )
}
