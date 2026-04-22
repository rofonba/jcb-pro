import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Flame, Lock, Mail, Eye, EyeOff, AlertCircle, User } from 'lucide-react'

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

function Field({ icon: Icon, type, value, onChange, placeholder, right }) {
  return (
    <div style={{ position: 'relative' }}>
      <Icon size={16} style={{
        position: 'absolute', left: '14px', top: '50%',
        transform: 'translateY(-50%)',
        color: 'rgba(255,255,255,0.3)', pointerEvents: 'none',
      }} />
      <input
        type={type} value={value} onChange={onChange}
        placeholder={placeholder} required
        style={{ ...inputBase, paddingRight: right ? '3rem' : '1rem' }}
        onFocus={e => { e.target.style.borderColor = GOLD }}
        onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)' }}
      />
      {right}
    </div>
  )
}

export default function Login() {
  const { login, register } = useAuth()
  const [mode, setMode]           = useState('login')
  const [nombre, setNombre]       = useState('')
  const [apellidos, setApellidos] = useState('')
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [showPass, setShowPass]   = useState(false)
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)

  const switchMode = (m) => {
    setMode(m); setError('')
    setNombre(''); setApellidos(''); setEmail(''); setPassword('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (mode === 'register') {
      if (!nombre.trim()) return setError('Introduce tu nombre')
      if (password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres')
    }
    setLoading(true)
    try {
      if (mode === 'login') {
        await login(email, password)
      } else {
        await register(email, password, nombre, apellidos)
      }
    } catch (err) {
      const code = err.code
      if (code === 'auth/invalid-credential' || code === 'auth/user-not-found' || code === 'auth/wrong-password') {
        setError('Email o contraseña incorrectos')
      } else if (code === 'auth/email-already-in-use') {
        setError('Ya existe una cuenta con ese email')
      } else if (code === 'auth/invalid-email') {
        setError('El email no es válido')
      } else {
        setError(err.message || 'Error al procesar la solicitud')
      }
    } finally {
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
          <div style={{
            width: '76px', height: '76px',
            background: 'linear-gradient(145deg, #C9A84C 0%, #CE1126 60%, #8a0a1a 100%)',
            borderRadius: '22px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1rem',
            boxShadow: '0 8px 32px rgba(206,17,38,0.45), 0 0 0 1px rgba(201,168,76,0.3)',
            transform: 'rotate(-2deg)',
          }}>
            <Flame size={38} color="white" strokeWidth={1.5} />
          </div>
          <h1 style={{
            color: '#C9A84C', fontSize: '1.1rem', fontWeight: '800',
            letterSpacing: '0.12em', textTransform: 'uppercase', margin: 0,
          }}>
            Falla Joaquín Costa
          </h1>
          <p style={{
            color: 'rgba(255,255,255,0.35)', fontSize: '0.72rem',
            letterSpacing: '0.25em', textTransform: 'uppercase', margin: '0.2rem 0 0',
          }}>
            Burriana · Valencia
          </p>
          <div style={{
            width: '50px', height: '1px',
            background: 'linear-gradient(90deg, transparent, #C9A84C, transparent)',
            margin: '1rem auto 0',
          }} />
        </div>

        {/* Mode tabs */}
        <div style={{
          display: 'flex', background: 'rgba(255,255,255,0.05)',
          borderRadius: '14px', padding: '4px', gap: '4px', marginBottom: '1.5rem',
        }}>
          {[['login', '🔑 Entrar'], ['register', '✨ Registrarse']].map(([m, label]) => (
            <button
              key={m} type="button" onClick={() => switchMode(m)}
              style={{
                flex: 1, padding: '0.55rem 0.5rem',
                background: mode === m ? 'rgba(201,168,76,0.15)' : 'transparent',
                border: mode === m ? '1px solid rgba(201,168,76,0.35)' : '1px solid transparent',
                borderRadius: '10px',
                color: mode === m ? GOLD : 'rgba(255,255,255,0.35)',
                fontSize: '0.78rem', fontWeight: '700',
                cursor: 'pointer', minHeight: 'auto',
                transition: 'all 0.2s', letterSpacing: '0.02em',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>Nombre</label>
                <Field
                  icon={User} type="text"
                  value={nombre} onChange={e => setNombre(e.target.value)}
                  placeholder="Tu nombre"
                />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>Apellidos</label>
                <Field
                  icon={User} type="text"
                  value={apellidos} onChange={e => setApellidos(e.target.value)}
                  placeholder="Tus apellidos"
                />
              </div>
            </>
          )}

          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Email</label>
            <Field
              icon={Mail} type="email"
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder="tu@email.com"
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={labelStyle}>Contraseña{mode === 'register' && ' (mín. 6 caracteres)'}</label>
            <Field
              icon={Lock}
              type={showPass ? 'text' : 'password'}
              value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              right={
                <button
                  type="button" onClick={() => setShowPass(v => !v)}
                  style={{
                    position: 'absolute', right: '12px', top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none', border: 'none',
                    color: 'rgba(255,255,255,0.3)', cursor: 'pointer',
                    padding: 0, minHeight: 'auto', minWidth: 'auto', display: 'flex',
                  }}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
            />
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
                : mode === 'login'
                  ? 'linear-gradient(135deg, #CE1126 0%, #a00d1e 100%)'
                  : 'linear-gradient(135deg, #C9A84C 0%, #8a6f1a 100%)',
              border: 'none', borderRadius: '14px',
              color: 'white', fontSize: '0.95rem', fontWeight: '700',
              letterSpacing: '0.04em',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: loading ? 'none' : mode === 'login'
                ? '0 6px 24px rgba(206,17,38,0.45)'
                : '0 6px 24px rgba(212,175,55,0.4)',
              transition: 'all 0.2s',
            }}
          >
            {loading
              ? (mode === 'login' ? 'Entrando…' : 'Creando cuenta…')
              : (mode === 'login' ? '🔥 Entrar a la Falla' : '✨ Crear mi cuenta')}
          </button>
        </form>

        <p style={{
          color: 'rgba(255,255,255,0.2)', fontSize: '0.7rem',
          textAlign: 'center', marginTop: '1.5rem', marginBottom: 0,
        }}>
          ¿Problemas para acceder?{' '}
          <a href="mailto:comision@fallajc.es" style={{ color: '#C9A84C', textDecoration: 'none' }}>
            Contacta con la comisión
          </a>
        </p>
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
