import { useState, useEffect } from 'react'
import { Flame } from 'lucide-react'

// Target fijo: La Nit de la Plantà — arranque oficial de las Fallas 2027
const PLANTA = new Date('2027-03-14T20:00:00')

function getTimeLeft() {
  const diff = PLANTA - new Date()
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 }
  return {
    days:    Math.floor(diff / 86400000),
    hours:   Math.floor((diff / 3600000) % 24),
    minutes: Math.floor((diff / 60000) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  }
}

function pad(n) { return String(n).padStart(2, '0') }

// ─── Bloque de tiempo pequeño (horas / min / seg) ────────────────────────────
function SmallUnit({ value, label }) {
  return (
    <div style={{ textAlign: 'center', flex: 1 }}>
      <div style={{
        background: 'rgba(0,0,0,0.45)',
        border: '1px solid rgba(212,175,55,0.15)',
        borderRadius: '12px',
        padding: '0.6rem 0.25rem',
        fontSize: '1.5rem',
        fontWeight: '800',
        fontVariantNumeric: 'tabular-nums',
        color: '#fff',
        letterSpacing: '-0.02em',
        lineHeight: 1,
      }}>
        {pad(value)}
      </div>
      <div style={{
        fontSize: '0.58rem', color: 'rgba(255,255,255,0.4)',
        textTransform: 'uppercase', letterSpacing: '0.1em',
        marginTop: '0.35rem',
      }}>
        {label}
      </div>
    </div>
  )
}

// ─── Separador : ─────────────────────────────────────────────────────────────
function Sep() {
  return (
    <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: '1.4rem', fontWeight: '300', alignSelf: 'flex-start', paddingTop: '0.6rem' }}>
      :
    </div>
  )
}

export default function Countdown() {
  const [time, setTime] = useState(getTimeLeft)

  useEffect(() => {
    const id = setInterval(() => setTime(getTimeLeft()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{
      background: 'linear-gradient(160deg, #1a0505 0%, #0f0f0f 50%, #120808 100%)',
      border: '1px solid rgba(212,175,55,0.25)',
      borderRadius: '24px',
      padding: '1.75rem 1.5rem',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Gold top border accent */}
      <div style={{
        position: 'absolute', top: 0, left: '10%', right: '10%', height: '2px',
        background: 'linear-gradient(90deg, transparent, #D4AF37, #F5D06A, #D4AF37, transparent)',
      }} />

      {/* Ambient red glow */}
      <div style={{
        position: 'absolute', bottom: '-40px', right: '-30px',
        width: '180px', height: '180px',
        background: 'radial-gradient(circle, rgba(206,17,38,0.15) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
          <Flame size={14} color="#D4AF37" strokeWidth={2} />
          <span style={{
            fontSize: '0.68rem', fontWeight: '700', letterSpacing: '0.2em',
            textTransform: 'uppercase', color: '#D4AF37',
          }}>
            Fallas 2027 · Burriana
          </span>
          <Flame size={14} color="#D4AF37" strokeWidth={2} />
        </div>
        <p style={{ margin: 0, fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.06em' }}>
          La Plantà · 14 de marzo · 20:00 h
        </p>
      </div>

      {/* ─── DÍAS — número protagonista ───────────────────────────────────── */}
      <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
        <div style={{
          fontSize: 'clamp(4rem, 20vw, 6rem)',
          fontWeight: '900',
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.04em',
          background: 'linear-gradient(180deg, #F5D06A 0%, #D4AF37 50%, #A07C1C 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          filter: 'drop-shadow(0 0 24px rgba(212,175,55,0.4))',
        }}>
          {pad(time.days)}
        </div>
        <div style={{
          fontSize: '0.8rem', fontWeight: '700', letterSpacing: '0.25em',
          textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)',
          marginTop: '0.2rem',
        }}>
          {time.days === 1 ? 'día' : 'días'}
        </div>
      </div>

      {/* ─── Horas / Minutos / Segundos ────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem', maxWidth: '280px', margin: '0 auto' }}>
        <SmallUnit value={time.hours}   label="Horas" />
        <Sep />
        <SmallUnit value={time.minutes} label="Min" />
        <Sep />
        <SmallUnit value={time.seconds} label="Seg" />
      </div>

      {/* Footer */}
      <p style={{
        margin: '1rem 0 0',
        fontSize: '0.7rem', color: 'rgba(255,255,255,0.25)',
        textAlign: 'center', letterSpacing: '0.04em',
      }}>
        Domingo, 14 de marzo de 2027
      </p>
    </div>
  )
}
