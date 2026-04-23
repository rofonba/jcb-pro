import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { User, Phone, Hash, AlertCircle, Loader2 } from 'lucide-react'
import logoFalla from '../assets/logo-falla.png'

const GOLD = '#C9A84C'
const RED  = '#CE1126'

const inputBase = {
  width: '100%',
  padding: '0.8rem 1rem 0.8rem 2.75rem',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '12px',
  color: 'white',
  fontSize: '1rem',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.2s',
}

const labelStyle = {
  display: 'block', color: 'rgba(255,255,255,0.4)',
  fontSize: '0.7rem', fontWeight: '700',
  letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '0.45rem',
}

function Field({ icon: Icon, type, value, onChange, placeholder, autoFocus }) {
  return (
    <div style={{ position: 'relative' }}>
      <Icon size={16} style={{
        position: 'absolute', left: '14px', top: '50%',
        transform: 'translateY(-50%)',
        color: 'rgba(255,255,255,0.3)', pointerEvents: 'none',
      }} />
      <input
        type={type} value={value} onChange={onChange}
        placeholder={placeholder} required autoFocus={autoFocus}
        style={inputBase}
        onFocus={e => { e.target.style.borderColor = GOLD }}
        onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)' }}
      />
    </div>
  )
}

export default function CompletarPerfil() {
  const { completeProfile, logout } = useAuth()
  const [nombre,         setNombre]         = useState('')
  const [apellidos,      setApellidos]      = useState('')
  const [telefono,       setTelefono]       = useState('')
  const [numeroFallero,  setNumeroFallero]  = useState('')
  const [loading,        setLoading]        = useState(false)
  const [error,          setError]          = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!nombre.trim())    return setError('El nombre es obligatorio.')
    if (!apellidos.trim()) return setError('Los apellidos son obligatorios.')
    if (!telefono.trim())  return setError('El teléfono es obligatorio.')
    if (!numeroFallero || isNaN(Number(numeroFallero)) || Number(numeroFallero) < 1)
      return setError('Introduce un número de fallero válido.')
    setLoading(true)
    try {
      await completeProfile(nombre, apellidos, telefono, numeroFallero)
    } catch (err) {
      setError(err?.message || 'No se pudo guardar el perfil. Inténtalo de nuevo.')
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(150deg, #080818 0%, #1c0509 55%, #0d0d20 100%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '1.5rem', position: 'relative', overflow: 'hidden',
    }}>
      {/* Ambient glow */}
      <div style={{
        position: 'fixed', top: '20%', left: '50%', transform: 'translateX(-50%)',
        width: '400px', height: '400px',
        background: 'radial-gradient(circle, rgba(206,17,38,0.12) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Top gold bar */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: '3px',
        background: 'linear-gradient(90deg, transparent 0%, #C9A84C 30%, #FFD700 50%, #C9A84C 70%, transparent 100%)',
      }} />

      {/* Card */}
      <div style={{
        width: '100%', maxWidth: '400px',
        background: 'rgba(255,255,255,0.035)',
        backdropFilter: 'blur(24px)',
        border: '1px solid rgba(201,168,76,0.18)',
        borderRadius: '28px',
        padding: '2.5rem 2rem',
        boxShadow: '0 32px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)',
        position: 'relative', zIndex: 1,
      }}>
        {/* Emblem */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <img
            src={logoFalla}
            alt="Falla Joaquín Costa"
            style={{
              width: '72px', height: '72px',
              objectFit: 'contain',
              display: 'block',
              margin: '0 auto 1rem',
              filter: 'drop-shadow(0 6px 24px rgba(206,17,38,0.45)) drop-shadow(0 0 8px rgba(201,168,76,0.25))',
            }}
          />
          <h1 style={{
            color: GOLD, fontSize: '1.1rem', fontWeight: '800',
            letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 0.3rem',
          }}>
            Completa tu perfil
          </h1>
          <p style={{
            color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem',
            margin: 0, lineHeight: 1.5,
          }}>
            Necesitamos unos datos básicos para activar tu cuenta de fallero.
          </p>
          <div style={{
            width: '50px', height: '1px',
            background: 'linear-gradient(90deg, transparent, #C9A84C, transparent)',
            margin: '1rem auto 0',
          }} />
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Nombre *</label>
            <Field
              icon={User} type="text"
              value={nombre} onChange={e => setNombre(e.target.value)}
              placeholder="Tu nombre" autoFocus
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Apellidos *</label>
            <Field
              icon={User} type="text"
              value={apellidos} onChange={e => setApellidos(e.target.value)}
              placeholder="Tus apellidos"
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Teléfono de contacto *</label>
            <Field
              icon={Phone} type="tel"
              value={telefono} onChange={e => setTelefono(e.target.value)}
              placeholder="6XX XXX XXX"
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={labelStyle}>Número de fallero *</label>
            <div style={{ position: 'relative' }}>
              <Hash size={16} style={{
                position: 'absolute', left: '14px', top: '50%',
                transform: 'translateY(-50%)',
                color: 'rgba(255,255,255,0.3)', pointerEvents: 'none',
              }} />
              <input
                type="number" min="1" inputMode="numeric"
                value={numeroFallero} onChange={e => setNumeroFallero(e.target.value)}
                placeholder="Ej: 124"
                required
                style={{ ...inputBase, MozAppearance: 'textfield' }}
                onFocus={e => { e.target.style.borderColor = GOLD }}
                onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)' }}
              />
            </div>
          </div>

          {error && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.7rem 1rem',
              background: 'rgba(206,17,38,0.12)',
              border: '1px solid rgba(206,17,38,0.35)',
              borderRadius: '10px', marginBottom: '1rem',
            }}>
              <AlertCircle size={15} color={RED} style={{ flexShrink: 0 }} />
              <span style={{ color: '#ff8080', fontSize: '0.82rem' }}>{error}</span>
            </div>
          )}

          <button
            type="submit" disabled={loading}
            style={{
              width: '100%', padding: '0.9rem',
              background: loading
                ? 'rgba(201,168,76,0.3)'
                : `linear-gradient(135deg, ${GOLD} 0%, #8a6f1a 100%)`,
              border: 'none', borderRadius: '14px',
              color: 'white', fontSize: '0.95rem', fontWeight: '700',
              letterSpacing: '0.04em',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: loading ? 'none' : '0 6px 24px rgba(201,168,76,0.35)',
              transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {loading
              ? <Loader2 size={18} style={{ animation: 'falla-spin 0.8s linear infinite' }} />
              : '🔥 Activar mi cuenta'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
          <button
            type="button" onClick={logout}
            style={{
              background: 'none', border: 'none',
              color: 'rgba(255,255,255,0.25)',
              fontSize: '0.75rem', cursor: 'pointer',
              padding: 0, minHeight: 'auto',
            }}
          >
            Cerrar sesión
          </button>
        </div>
      </div>

      <p style={{
        color: 'rgba(255,255,255,0.15)', fontSize: '0.65rem',
        marginTop: '2rem', letterSpacing: '0.12em', textTransform: 'uppercase',
      }}>
        Falla Joaquín Costa · Burriana · {new Date().getFullYear()}
      </p>
    </div>
  )
}
