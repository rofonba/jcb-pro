import { useEffect, useState } from 'react'
import { Flame } from 'lucide-react'

export default function SplashScreen({ visible }) {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    console.log('FLASH: SplashScreen montado')
    const id = requestAnimationFrame(() => {
      console.log('FLASH: SplashScreen visible activado')
      setShown(true)
    })
    return () => cancelAnimationFrame(id)
  }, [])

  console.log('FLASH: SplashScreen render — shown:', shown, 'visible:', visible)

  return (
    <div
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: '#0a0a0a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.75rem',
        zIndex: 9999,
        opacity: shown && visible ? 1 : 0,
        transition: 'opacity 0.65s ease',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          animation: 'jcb-beat 1.8s ease-in-out infinite, jcb-glow 2.2s ease-in-out infinite',
        }}
      >
        <Flame size={76} color="#D4AF37" strokeWidth={1.5} />
      </div>

      <p
        style={{
          color: 'white',
          fontSize: '0.78rem',
          fontWeight: 700,
          letterSpacing: '0.25em',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          userSelect: 'none',
          opacity: 0,
          animation: 'jcb-text-in 1.3s ease 0.5s forwards',
        }}
      >
        JOAQUÍN COSTA · BURRIANA
      </p>
    </div>
  )
}
