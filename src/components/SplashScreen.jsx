import { useEffect, useState } from 'react'
import logoFalla from '../assets/logo-falla.png'

export default function SplashScreen({ visible }) {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <div
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'linear-gradient(150deg, #080818 0%, #1c0509 55%, #0d0d20 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.5rem',
        zIndex: 9999,
        opacity: shown && visible ? 1 : 0,
        transition: 'opacity 0.65s ease',
        pointerEvents: 'none',
      }}
    >
      {/* Ambient glow */}
      <div style={{
        position: 'absolute',
        top: '35%', left: '50%', transform: 'translate(-50%, -50%)',
        width: '340px', height: '340px',
        background: 'radial-gradient(circle, rgba(206,17,38,0.15) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Logo */}
      <img
        src={logoFalla}
        alt="Falla Joaquín Costa"
        style={{
          width: '148px',
          height: '148px',
          objectFit: 'contain',
          animation: 'jcb-beat 1.8s ease-in-out infinite, jcb-glow 2.2s ease-in-out infinite',
          filter: 'drop-shadow(0 0 32px rgba(206,17,38,0.5)) drop-shadow(0 0 16px rgba(212,175,55,0.35))',
          userSelect: 'none',
          WebkitUserDrag: 'none',
        }}
      />

      <p
        style={{
          color: 'white',
          fontSize: '0.75rem',
          fontWeight: 700,
          letterSpacing: '0.28em',
          textTransform: 'uppercase',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          userSelect: 'none',
          opacity: 0,
          animation: 'jcb-text-in 1.3s ease 0.5s forwards',
        }}
      >
        Joaquín Costa · Burriana
      </p>
    </div>
  )
}
