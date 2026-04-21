import { useState, useEffect } from 'react'
import {
  collection, query, orderBy, getDocs, where,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import {
  Download, Users, ChevronRight, X, Loader2,
  Shield, Star, Flame,
} from 'lucide-react'

const GOLD  = '#D4AF37'
const RED   = '#CE1126'
const CARD  = '#141414'

// ─── Carnet Digital ──────────────────────────────────────────────────────────
function CarnetDigital({ nombre, numFallero, rol }) {
  const isAdmin = rol === 'admin'

  return (
    <div style={{
      borderRadius: '20px',
      background: `linear-gradient(145deg, #1a1a1a 0%, #0f0f0f 100%)`,
      border: `1.5px solid rgba(212,175,55,0.35)`,
      overflow: 'hidden',
      boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(212,175,55,0.1)',
      marginBottom: '1.5rem',
      animation: 'falla-fadeIn 0.4s ease-out',
      position: 'relative',
    }}>
      {/* Card header band */}
      <div style={{
        background: 'linear-gradient(90deg, #CE1126, #8a0a1a 40%, #D4AF37 100%)',
        padding: '0.75rem 1.25rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Flame size={16} color="white" strokeWidth={2} />
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: '800', color: 'white', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Falla Joaquín Costa
            </div>
            <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.7)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
              Burriana · Valencia
            </div>
          </div>
        </div>
        {isAdmin && (
          <div style={{
            background: 'rgba(255,255,255,0.2)',
            borderRadius: '6px', padding: '0.15rem 0.5rem',
            display: 'flex', alignItems: 'center', gap: '0.3rem',
          }}>
            <Shield size={10} color="white" fill="white" />
            <span style={{ fontSize: '0.58rem', fontWeight: '800', color: 'white', letterSpacing: '0.1em' }}>ADMIN</span>
          </div>
        )}
      </div>

      {/* Card body */}
      <div style={{ padding: '1.5rem 1.25rem' }}>
        {/* Avatar + number */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginBottom: '1.25rem' }}>
          {/* Avatar placeholder */}
          <div style={{
            width: '64px', height: '64px', flexShrink: 0,
            background: 'linear-gradient(135deg, rgba(212,175,55,0.2), rgba(206,17,38,0.2))',
            border: `1.5px solid rgba(212,175,55,0.3)`,
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.6rem',
          }}>
            👤
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
              Número de Fallero
            </div>
            <div style={{
              fontSize: '2.4rem', fontWeight: '900', lineHeight: 1,
              letterSpacing: '-0.02em',
              background: 'linear-gradient(180deg, #F5D06A 0%, #D4AF37 60%, #A07C1C 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>
              {String(numFallero).padStart(3, '0')}
            </div>
          </div>
        </div>

        {/* Name + role */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '1rem' }}>
          <div style={{ fontSize: '1.05rem', fontWeight: '800', color: 'white', marginBottom: '0.4rem', lineHeight: 1.2 }}>
            {nombre}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
              padding: '0.2rem 0.6rem',
              background: isAdmin ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.07)',
              border: isAdmin ? '1px solid rgba(212,175,55,0.35)' : '1px solid rgba(255,255,255,0.1)',
              borderRadius: '100px',
            }}>
              {isAdmin
                ? <Shield size={10} color={GOLD} fill={GOLD} />
                : <Star size={10} color={GOLD} fill={GOLD} />}
              <span style={{ fontSize: '0.65rem', fontWeight: '700', color: isAdmin ? GOLD : 'rgba(255,255,255,0.6)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {isAdmin ? 'Administrador' : 'Fallero'}
              </span>
            </span>
            <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)' }}>· 2027</span>
          </div>
        </div>
      </div>

      {/* Bottom holographic strip */}
      <div style={{
        height: '4px',
        background: 'linear-gradient(90deg, #CE1126, #D4AF37, #F5D06A, #D4AF37, #CE1126)',
      }} />

      {/* Shimmer sweep — barrido metálico sobre el carnet */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', borderRadius: '20px' }}>
        <div style={{
          position: 'absolute', top: 0, bottom: 0, width: '35%',
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.055), transparent)',
          animation: 'falla-cardShimmer 5s ease-in-out infinite',
        }} />
      </div>
    </div>
  )
}

// ─── Modal lista de inscritos (admin) ────────────────────────────────────────
function AttendeesModal({ event, onClose }) {
  const [attendees, setAttendees] = useState([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    const fetch = async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'inscripciones'),
          where('eventId', '==', event.id),
          orderBy('createdAt', 'asc'),
        ))
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        setAttendees(list)
        // Log en consola (base para exportar a CSV en el futuro)
        console.table(list.map(a => ({
          'Nº Fallero': a.numFallero,
          Nombre: a.nombre,
          Personas: a.nPersonas,
          Nota: a.nota || '—',
        })))
      } catch (e) {
        console.error('Error cargando inscritos:', e)
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [event.id])

  const totalPersonas = attendees.reduce((sum, a) => sum + (a.nPersonas ?? 1), 0)

  const handleDownload = () => {
    const rows = [
      ['Nº Fallero', 'Nombre', 'Personas', 'Nota'],
      ...attendees.map(a => [a.numFallero, a.nombre, a.nPersonas ?? 1, a.nota || '']),
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `inscritos-${event.titulo.replace(/\s+/g, '-')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ width: '100%', maxWidth: '480px', background: '#141414', border: '1px solid rgba(212,175,55,0.18)', borderRadius: '24px 24px 0 0', padding: `1.5rem 1.5rem calc(1.5rem + env(safe-area-inset-bottom))`, animation: 'falla-slideUp 0.25s ease-out', maxHeight: '80dvh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div style={{ width: '40px', height: '4px', background: 'rgba(255,255,255,0.12)', borderRadius: '2px', margin: '0 auto 1.25rem' }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', flexShrink: 0 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '800', color: GOLD }}>
              Inscritos — {event.titulo}
            </h3>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)' }}>
              {attendees.length} {attendees.length === 1 ? 'fallero' : 'falleros'} · {totalPersonas} personas en total
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '10px', padding: '0.5rem', color: 'rgba(255,255,255,0.4)', display: 'flex', cursor: 'pointer', minHeight: 'auto', minWidth: 'auto' }}>
            <X size={18} />
          </button>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', marginBottom: '1rem' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
              <Loader2 size={22} color={GOLD} style={{ animation: 'falla-spin 0.8s linear infinite', display: 'inline-block' }} />
            </div>
          ) : attendees.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 0', color: 'rgba(255,255,255,0.3)', fontSize: '0.85rem' }}>
              Nadie apuntado todavía
            </div>
          ) : (
            attendees.map((a, i) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ width: '28px', height: '28px', background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '0.7rem', fontWeight: '800', color: GOLD }}>
                  {String(a.numFallero).padStart(2, '0')}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: '600', color: 'white', lineHeight: 1.2 }}>{a.nombre}</div>
                  {a.nota && <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)', marginTop: '0.1rem' }}>{a.nota}</div>}
                </div>
                <div style={{ flexShrink: 0, textAlign: 'right' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: '700', color: 'white' }}>{a.nPersonas ?? 1}</div>
                  <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.3)' }}>pers.</div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Download button */}
        {!loading && attendees.length > 0 && (
          <button
            onClick={handleDownload}
            className="btn-shimmer"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              width: '100%', minHeight: '50px',
              background: 'linear-gradient(135deg, #D4AF37, #8a6f1a)',
              border: 'none', borderRadius: '14px',
              color: 'white', fontSize: '0.9rem', fontWeight: '700',
              cursor: 'pointer', boxShadow: '0 4px 18px rgba(212,175,55,0.3)',
            }}
          >
            <Download size={17} />
            Descargar listado CSV
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Admin panel ─────────────────────────────────────────────────────────────
function AdminPanel() {
  const [events, setEvents]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [selectedEvent, setSelected] = useState(null)

  useEffect(() => {
    getDocs(query(collection(db, 'eventos'), orderBy('fecha', 'asc')))
      .then(snap => setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div style={{ marginTop: '0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.9rem' }}>
        <Shield size={14} color={GOLD} />
        <h3 style={{ margin: 0, fontSize: '0.78rem', fontWeight: '700', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Panel Administración
        </h3>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
          <Loader2 size={20} color={GOLD} style={{ animation: 'falla-spin 0.8s linear infinite', display: 'inline-block' }} />
        </div>
      ) : events.length === 0 ? (
        <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.82rem', textAlign: 'center', padding: '1rem 0' }}>
          No hay eventos creados
        </p>
      ) : (
        events.map(ev => (
          <button
            key={ev.id}
            onClick={() => setSelected(ev)}
            style={{
              width: '100%', textAlign: 'left',
              background: '#1a1a1a',
              border: '1px solid rgba(212,175,55,0.12)',
              borderRadius: '14px', padding: '0.85rem 1rem',
              marginBottom: '0.6rem', cursor: 'pointer', minHeight: 'auto',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem',
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(212,175,55,0.3)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(212,175,55,0.12)'}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.88rem', fontWeight: '600', color: 'white', marginBottom: '0.2rem' }}>
                {ev.titulo}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Users size={11} color="rgba(255,255,255,0.3)" />
                <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)' }}>
                  Ver inscritos y descargar listado
                </span>
              </div>
            </div>
            <ChevronRight size={16} color="rgba(212,175,55,0.5)" />
          </button>
        ))
      )}

      {selectedEvent && (
        <AttendeesModal event={selectedEvent} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}

// ─── Profile (main export) ───────────────────────────────────────────────────
export default function Profile() {
  const { user, fallero, logout } = useAuth()

  const nombre     = fallero ? `${fallero.nombre} ${fallero.apellidos}` : user?.displayName || user?.email?.split('@')[0] || 'Fallero'
  const numFallero = fallero?.numero ?? '—'
  const rol        = fallero?.rol ?? 'fallero'
  const isAdmin    = rol === 'admin'

  return (
    <>
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: '800', color: 'white' }}>Mi Perfil</h2>
        <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'rgba(255,255,255,0.35)' }}>
          Tu carnet digital de fallero
        </p>
      </div>

      <CarnetDigital nombre={nombre} numFallero={numFallero} rol={rol} />

      {/* Info extra */}
      <div style={{ background: '#141414', border: '1px solid rgba(212,175,55,0.12)', borderRadius: '16px', padding: '1rem 1.1rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.65rem', marginBottom: '0.65rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)' }}>Email</span>
          <span style={{ fontSize: '0.82rem', color: 'white', fontWeight: '500' }}>{user?.email ?? '—'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)' }}>Rol</span>
          <span style={{ fontSize: '0.82rem', color: isAdmin ? GOLD : 'rgba(255,255,255,0.6)', fontWeight: '600', textTransform: 'capitalize' }}>{rol}</span>
        </div>
      </div>

      {/* Admin panel */}
      {isAdmin && <AdminPanel />}

      {/* Logout */}
      <button
        onClick={logout}
        style={{
          width: '100%', minHeight: '50px', marginTop: '1rem',
          background: 'rgba(206,17,38,0.1)',
          border: '1px solid rgba(206,17,38,0.25)',
          borderRadius: '14px', color: RED,
          fontSize: '0.9rem', fontWeight: '700',
          cursor: 'pointer', letterSpacing: '0.04em',
        }}
      >
        Cerrar sesión
      </button>
    </>
  )
}
