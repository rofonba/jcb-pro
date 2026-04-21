import { useEffect, useState } from 'react'
import { Flame } from 'lucide-react'

const css = `
@keyframes jcb-beat {
  0%, 100% { transform: scale(1); }
  14%       { transform: scale(1.18); }
  28%       { transform: scale(1); }
  42%       { transform: scale(1.10); }
  70%       { transform: scale(1); }
}
@keyframes jcb-glow {
  0%, 100% {
    filter: drop-shadow(0 0 8px #D4AF37)
            drop-shadow(0 0 20px rgba(212,175,55,0.4));
  }
  50% {
    filter: drop-shadow(0 0 22px #D4AF37)
            drop-shadow(0 0 55px rgba(212,175,55,0.6))
            drop-shadow(0 0 90px rgba(212,175,55,0.2));
  }
}
@keyframes jcb-text-in {
  from { opacity: 0; letter-spacing: 0.25em; }
  to   { opacity: 0.45; letter-spacing: 0.52em; }
}
`

export default function SplashScreen({ visible }) {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <>
      <style>{css}</style>
      <div style={{
        position: 'fixed',
        inset: 0,
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
      }}>
        <div style={{
          animation: 'jcb-beat 1.8s ease-in-out infinite, jcb-glow 2.2s ease-in-out infinite',
        }}>
          <Flame size={76} color="#D4AF37" strokeWidth={1.5} />
        </div>

        <p style={{
          color: 'white',
          fontSize: '0.78rem',
          fontWeight: 700,
          letterSpacing: '0.25em',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          userSelect: 'none',
          opacity: 0,
          animation: 'jcb-text-in 1.3s ease 0.5s forwards',
        }}>
          JOAQUÍN COSTA · BURRIANA
        </p>
      </div>
    </>
  )
}
