import { useState, useEffect, useCallback } from 'react'
import {
  collection, query, orderBy, onSnapshot,
  addDoc, serverTimestamp, getDocs, where,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import {
  Plus, MapPin, Calendar, Users, ChevronRight,
  X, Check, AlertCircle, Loader2,
} from 'lucide-react'

const GOLD  = '#D4AF37'
const RED   = '#CE1126'
const GREEN = '#10b981'
const CARD  = '#141414'

const EVENT_TYPES = {
  comida:  { emoji: '🍽️', label: 'Comida',  color: GOLD },
  cena:    { emoji: '🌙', label: 'Cena',    color: '#6366f1' },
  acto:    { emoji: '🎭', label: 'Acto',    color: RED },
  reunion: { emoji: '📋', label: 'Reunión', color: '#6B7280' },
}

const sharedInput = {
  width: '100%', padding: '0.8rem 1rem',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '12px', color: 'white', fontSize: '1rem',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
}
const sharedLabel = {
  display: 'block', color: 'rgba(255,255,255,0.45)',
  fontSize: '0.7rem', fontWeight: '700',
  letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '0.4rem',
}

function fmtDate(f) {
  if (!f) return '—'
  const d = f?.toDate ? f.toDate() : new Date(f)
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
}
function fmtTime(f) {
  if (!f) return ''
  const d = f?.toDate ? f.toDate() : new Date(f)
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

// ─── Overlay / bottom sheet ──────────────────────────────────────────────────
function Overlay({ children, onClose, scrollable = false }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%', maxWidth: '480px',
          background: CARD,
          border: '1px solid rgba(212,175,55,0.18)',
          borderRadius: '24px 24px 0 0',
          padding: `1.5rem 1.5rem calc(1.5rem + env(safe-area-inset-bottom))`,
          animation: 'falla-slideUp 0.25s ease-out',
          ...(scrollable ? { maxHeight: '90dvh', overflowY: 'auto' } : {}),
        }}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

// ─── Event card ──────────────────────────────────────────────────────────────
function EventCard({ event, onPress, isRegistered, index = 0 }) {
  const t       = EVENT_TYPES[event.tipo] ?? EVENT_TYPES.acto
  const ocupadas = event.plazasOcupadas ?? 0
  const pct     = event.plazasTotal ? Math.min(100, (ocupadas / event.plazasTotal) * 100) : null

  return (
    <button
      onClick={() => onPress(event)}
      style={{
        width: '100%', textAlign: 'left',
        background: CARD,
        border: `1px solid ${isRegistered ? 'rgba(212,175,55,0.3)' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: '18px', padding: '1rem 1.1rem',
        marginBottom: '0.75rem', cursor: 'pointer', minHeight: 'auto',
        transition: 'border-color 0.15s, transform 0.12s',
        animation: 'falla-cardEnter 0.35s ease-out both',
        animationDelay: `${index * 0.07}s`,
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = isRegistered ? 'rgba(212,175,55,0.55)' : 'rgba(212,175,55,0.35)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = isRegistered ? 'rgba(212,175,55,0.3)' : 'rgba(255,255,255,0.07)'; e.currentTarget.style.transform = 'translateY(0)' }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', marginBottom: '0.75rem' }}>
        <div style={{ width: '44px', height: '44px', flexShrink: 0, background: `${t.color}1a`, border: `1px solid ${t.color}28`, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem' }}>
          {t.emoji}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.95rem', fontWeight: '700', color: 'white', lineHeight: 1.3, marginBottom: '0.2rem' }}>
            {event.titulo}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-block', padding: '0.1rem 0.45rem', background: `${t.color}20`, borderRadius: '6px', fontSize: '0.6rem', fontWeight: '700', letterSpacing: '0.08em', color: t.color, textTransform: 'uppercase' }}>
              {t.label}
            </span>
            {/* "Ya apuntado" badge — visible en la tarjeta */}
            {isRegistered && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                padding: '0.1rem 0.45rem',
                background: 'rgba(212,175,55,0.12)',
                border: '1px solid rgba(212,175,55,0.3)',
                borderRadius: '6px',
                fontSize: '0.6rem', fontWeight: '700', color: GOLD, letterSpacing: '0.06em',
              }}>
                <Check size={9} strokeWidth={3} />
                YA APUNTADO
              </span>
            )}
          </div>
        </div>
        <ChevronRight size={17} color="rgba(255,255,255,0.2)" style={{ flexShrink: 0, marginTop: '3px' }} />
      </div>

      {/* Meta */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.28rem', marginBottom: '0.75rem' }}>
        {event.fecha && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <Calendar size={12} color="rgba(255,255,255,0.28)" />
            <span style={{ fontSize: '0.77rem', color: 'rgba(255,255,255,0.45)', textTransform: 'capitalize' }}>
              {fmtDate(event.fecha)}{fmtTime(event.fecha) && ` · ${fmtTime(event.fecha)}`}
            </span>
          </div>
        )}
        {event.lugar && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <MapPin size={12} color="rgba(255,255,255,0.28)" />
            <span style={{ fontSize: '0.77rem', color: 'rgba(255,255,255,0.45)' }}>{event.lugar}</span>
          </div>
        )}
        {event.plazasTotal && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <Users size={12} color="rgba(255,255,255,0.28)" />
            <span style={{ fontSize: '0.77rem', color: 'rgba(255,255,255,0.45)' }}>{ocupadas} / {event.plazasTotal} plazas</span>
          </div>
        )}
      </div>

      {/* Aforo bar */}
      {pct !== null && (
        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: '4px', height: '3px' }}>
            <div style={{ width: `${pct}%`, height: '100%', borderRadius: '4px', background: pct > 80 ? RED : pct > 50 ? GOLD : GREEN, transition: 'width 0.4s ease' }} />
          </div>
        </div>
      )}

      {/* Footer — botón cambia si ya está apuntado */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.7rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <span style={{ fontSize: '1.1rem', fontWeight: '800', color: GOLD }}>
          {event.precio != null ? `${event.precio} €` : 'Gratuito'}
        </span>
        {isRegistered ? (
          // Estado deshabilitado — oro — no interactuable
          <span style={{
            padding: '0.38rem 0.9rem',
            background: 'rgba(212,175,55,0.12)',
            border: `1px solid rgba(212,175,55,0.35)`,
            borderRadius: '8px',
            fontSize: '0.73rem', fontWeight: '700', color: GOLD,
            display: 'flex', alignItems: 'center', gap: '0.3rem',
          }}>
            <Check size={12} strokeWidth={3} />
            Ya estás apuntado
          </span>
        ) : (
          <span style={{ padding: '0.38rem 0.9rem', background: 'rgba(206,17,38,0.15)', border: '1px solid rgba(206,17,38,0.3)', borderRadius: '8px', fontSize: '0.73rem', fontWeight: '700', color: RED }}>
            Apuntarse →
          </span>
        )}
      </div>
    </button>
  )
}

// ─── Registration modal ──────────────────────────────────────────────────────
function RegistrationModal({ event, isRegistered, onClose, onSuccess }) {
  const { user, fallero } = useAuth()
  const [nPersonas, setNPersonas] = useState(1)
  const [nota, setNota]           = useState('')
  const [status, setStatus]       = useState(isRegistered ? 'duplicate' : 'clean')
  const [saving, setSaving]       = useState(false)

  const t     = EVENT_TYPES[event.tipo] ?? EVENT_TYPES.acto
  const total = event.precio != null ? event.precio * nPersonas : null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (status !== 'clean') return
    setSaving(true)
    try {
      await addDoc(collection(db, 'inscripciones'), {
        eventId:      event.id,
        eventoTitulo: event.titulo,
        uid:          user.uid,
        nombre:       fallero ? `${fallero.nombre} ${fallero.apellidos}` : user.email,
        numFallero:   fallero?.numero ?? '—',
        nPersonas,
        nota:         nota.trim() || null,
        createdAt:    serverTimestamp(),
      })
      setStatus('saved')
      setTimeout(onSuccess, 900)
    } catch {
      setSaving(false)
    }
  }

  return (
    <Overlay onClose={onClose}>
      <div style={{ width: '40px', height: '4px', background: 'rgba(255,255,255,0.12)', borderRadius: '2px', margin: '0 auto 1.25rem' }} />

      {/* Event header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div style={{ width: '50px', height: '50px', flexShrink: 0, background: `${t.color}1a`, border: `1px solid ${t.color}28`, borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>
          {t.emoji}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '800', color: 'white', lineHeight: 1.25 }}>{event.titulo}</h3>
          <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: 'rgba(255,255,255,0.38)', textTransform: 'capitalize' }}>
            {fmtDate(event.fecha)}{fmtTime(event.fecha) && ` · ${fmtTime(event.fecha)}`}
          </p>
        </div>
        <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '10px', padding: '0.5rem', color: 'rgba(255,255,255,0.35)', display: 'flex', cursor: 'pointer', minHeight: 'auto', minWidth: 'auto' }}>
          <X size={18} />
        </button>
      </div>

      {/* ── Duplicate ─────────────────────────────────────────────────────── */}
      {status === 'duplicate' && (
        <div style={{ display: 'flex', gap: '0.65rem', padding: '1rem 1.1rem', background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.28)', borderRadius: '14px' }}>
          <Check size={20} color={GOLD} style={{ flexShrink: 0, marginTop: '1px' }} />
          <div>
            <p style={{ margin: 0, fontWeight: '800', fontSize: '0.92rem', color: GOLD }}>¡Ya estás apuntado!</p>
            <p style={{ margin: '0.3rem 0 0', fontSize: '0.78rem', color: 'rgba(255,255,255,0.38)', lineHeight: 1.4 }}>
              Tu inscripción está confirmada. Para cambiarla, contacta con la comisión.
            </p>
          </div>
        </div>
      )}

      {/* ── Saved ─────────────────────────────────────────────────────────── */}
      {status === 'saved' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem 1rem', gap: '0.75rem' }}>
          <div style={{ width: '58px', height: '58px', background: `${GREEN}18`, border: `1px solid ${GREEN}35`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Check size={28} color={GREEN} strokeWidth={2.5} />
          </div>
          <p style={{ margin: 0, fontWeight: '800', fontSize: '1rem', color: GREEN }}>¡Inscripción confirmada!</p>
        </div>
      )}

      {/* ── Form ──────────────────────────────────────────────────────────── */}
      {status === 'clean' && (
        <form onSubmit={handleSubmit}>
          <label style={sharedLabel}>Número de personas</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
            <button type="button" onClick={() => setNPersonas(v => Math.max(1, v - 1))}
              style={{ width: '52px', height: '52px', flexShrink: 0, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px', color: 'white', fontSize: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', minHeight: 'auto' }}>
              −
            </button>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <span style={{ fontSize: '2.5rem', fontWeight: '900', color: GOLD, letterSpacing: '-0.02em' }}>{nPersonas}</span>
              <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.28)', marginLeft: '0.4rem' }}>
                {nPersonas === 1 ? 'persona' : 'personas'}
              </span>
            </div>
            <button type="button" onClick={() => setNPersonas(v => v + 1)}
              style={{ width: '52px', height: '52px', flexShrink: 0, background: 'rgba(206,17,38,0.12)', border: `1px solid rgba(206,17,38,0.28)`, borderRadius: '14px', color: RED, fontSize: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', minHeight: 'auto' }}>
              +
            </button>
          </div>

          <label style={sharedLabel}>Nota (opcional)</label>
          <textarea value={nota} onChange={e => setNota(e.target.value)} placeholder="Alergias, menú infantil, silla de ruedas…" rows={2}
            style={{ ...sharedInput, resize: 'vertical', marginBottom: '1.25rem' }}
            onFocus={e => e.target.style.borderColor = GOLD}
            onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'} />

          {total !== null && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'rgba(212,175,55,0.07)', border: '1px solid rgba(212,175,55,0.18)', borderRadius: '12px', marginBottom: '1.25rem' }}>
              <span style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.4)' }}>{nPersonas} × {event.precio} €</span>
              <span style={{ fontSize: '1.1rem', fontWeight: '800', color: GOLD }}>Total: {total} €</span>
            </div>
          )}

          <button type="submit" disabled={saving}
            className={saving ? '' : 'btn-shimmer'}
            style={{
              width: '100%', minHeight: '52px',
              background: saving ? 'rgba(206,17,38,0.35)' : `linear-gradient(135deg, ${RED}, #a00d1e)`,
              border: 'none', borderRadius: '14px', color: 'white', fontSize: '1rem', fontWeight: '800',
              cursor: saving ? 'not-allowed' : 'pointer',
              boxShadow: saving ? 'none' : `0 6px 24px rgba(206,17,38,0.35)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
            }}>
            {saving
              ? <Loader2 size={18} style={{ animation: 'falla-spin 0.8s linear infinite' }} />
              : '✅ Confirmar inscripción'}
          </button>
        </form>
      )}
    </Overlay>
  )
}

// ─── Admin event form ────────────────────────────────────────────────────────
function EventFormModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ titulo: '', tipo: 'comida', fecha: '', hora: '', lugar: '', precio: '', plazasTotal: '', descripcion: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const fg  = e => e.target.style.borderColor = GOLD
  const fb  = e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      const fechaDate = (form.fecha && form.hora)
        ? new Date(`${form.fecha}T${form.hora}`)
        : form.fecha ? new Date(`${form.fecha}T00:00`) : null
      await addDoc(collection(db, 'eventos'), {
        titulo: form.titulo.trim(), tipo: form.tipo, fecha: fechaDate,
        lugar: form.lugar.trim() || null,
        precio: form.precio !== '' ? parseFloat(form.precio) : null,
        plazasTotal: form.plazasTotal !== '' ? parseInt(form.plazasTotal) : null,
        plazasOcupadas: 0, descripcion: form.descripcion.trim() || null,
        createdAt: serverTimestamp(),
      })
      onCreated()
    } catch (err) {
      setError('Error al crear el evento. Inténtalo de nuevo.')
    } finally { setLoading(false) }
  }

  return (
    <Overlay onClose={onClose} scrollable>
      <div style={{ width: '40px', height: '4px', background: 'rgba(255,255,255,0.12)', borderRadius: '2px', margin: '0 auto 1.25rem' }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: GOLD }}>➕ Nuevo evento</h3>
        <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '10px', padding: '0.5rem', color: 'rgba(255,255,255,0.35)', display: 'flex', cursor: 'pointer', minHeight: 'auto', minWidth: 'auto' }}>
          <X size={18} />
        </button>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <label style={sharedLabel}>Título *</label>
          <input required style={sharedInput} value={form.titulo} onChange={e => set('titulo', e.target.value)} placeholder="Ej: Paella de la Falla" onFocus={fg} onBlur={fb} />
        </div>
        <div>
          <label style={sharedLabel}>Tipo</label>
          <select value={form.tipo} onChange={e => set('tipo', e.target.value)} style={{ ...sharedInput, cursor: 'pointer' }}>
            {Object.entries(EVENT_TYPES).map(([k, v]) => (
              <option key={k} value={k} style={{ background: CARD }}>{v.emoji} {v.label}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div>
            <label style={sharedLabel}>Fecha</label>
            <input type="date" style={sharedInput} value={form.fecha} onChange={e => set('fecha', e.target.value)} onFocus={fg} onBlur={fb} />
          </div>
          <div>
            <label style={sharedLabel}>Hora</label>
            <input type="time" style={sharedInput} value={form.hora} onChange={e => set('hora', e.target.value)} onFocus={fg} onBlur={fb} />
          </div>
        </div>
        <div>
          <label style={sharedLabel}>Lugar</label>
          <input style={sharedInput} value={form.lugar} onChange={e => set('lugar', e.target.value)} placeholder="Carpa de la Falla" onFocus={fg} onBlur={fb} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div>
            <label style={sharedLabel}>Precio (€)</label>
            <input type="number" min="0" step="0.5" style={sharedInput} value={form.precio} onChange={e => set('precio', e.target.value)} placeholder="Gratis" onFocus={fg} onBlur={fb} />
          </div>
          <div>
            <label style={sharedLabel}>Plazas</label>
            <input type="number" min="1" style={sharedInput} value={form.plazasTotal} onChange={e => set('plazasTotal', e.target.value)} placeholder="Ilimitado" onFocus={fg} onBlur={fb} />
          </div>
        </div>
        <div>
          <label style={sharedLabel}>Descripción</label>
          <textarea rows={2} style={{ ...sharedInput, resize: 'vertical' }} value={form.descripcion} onChange={e => set('descripcion', e.target.value)} placeholder="Detalles…" onFocus={fg} onBlur={fb} />
        </div>
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', background: 'rgba(206,17,38,0.08)', border: '1px solid rgba(206,17,38,0.28)', borderRadius: '10px' }}>
            <AlertCircle size={15} color={RED} />
            <span style={{ color: '#ff8080', fontSize: '0.82rem' }}>{error}</span>
          </div>
        )}
        <button type="submit" disabled={loading} style={{ minHeight: '52px', background: loading ? `rgba(212,175,55,0.35)` : `linear-gradient(135deg, ${GOLD}, #8a6f1a)`, border: 'none', borderRadius: '14px', color: 'white', fontSize: '1rem', fontWeight: '800', cursor: loading ? 'not-allowed' : 'pointer', boxShadow: loading ? 'none' : `0 6px 20px rgba(212,175,55,0.3)`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
          {loading ? <Loader2 size={18} style={{ animation: 'falla-spin 0.8s linear infinite' }} /> : '🔥 Crear evento'}
        </button>
      </form>
    </Overlay>
  )
}

// ─── Success toast ───────────────────────────────────────────────────────────
function SuccessToast({ message, onDismiss }) {
  useEffect(() => {
    const id = setTimeout(onDismiss, 3200)
    return () => clearTimeout(id)
  }, [onDismiss])

  return (
    <div style={{
      position: 'fixed', top: '1rem', left: '50%', transform: 'translateX(-50%)',
      zIndex: 200, display: 'flex', alignItems: 'center', gap: '0.5rem',
      padding: '0.7rem 1.25rem', background: 'rgba(16,185,129,0.14)', border: '1px solid rgba(16,185,129,0.38)',
      borderRadius: '50px', color: '#6ee7b7', fontSize: '0.85rem', fontWeight: '600',
      backdropFilter: 'blur(14px)', boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
      animation: 'falla-slideDown 0.3s ease-out', whiteSpace: 'nowrap',
    }}>
      <Check size={15} />
      {message}
    </div>
  )
}

// ─── EventList (main export) ──────────────────────────────────────────────────
export default function EventList() {
  const { user, fallero } = useAuth()
  const isAdmin = fallero?.rol === 'admin'

  const [events, setEvents]              = useState([])
  const [loading, setLoading]            = useState(true)
  // Set de eventIds en los que el usuario ya está inscrito
  const [registeredIds, setRegisteredIds] = useState(new Set())
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [showForm, setShowForm]          = useState(false)
  const [toast, setToast]                = useState(null)

  // Carga de eventos en tiempo real
  useEffect(() => {
    const q = query(collection(db, 'eventos'), orderBy('fecha', 'asc'))
    const unsub = onSnapshot(q, snap => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }, () => setLoading(false))
    return unsub
  }, [])

  // Carga única de inscripciones del usuario — un solo query para todas las tarjetas
  useEffect(() => {
    if (!user?.uid) return
    getDocs(query(collection(db, 'inscripciones'), where('uid', '==', user.uid)))
      .then(snap => {
        setRegisteredIds(new Set(snap.docs.map(d => d.data().eventId)))
      })
      .catch(() => {})
  }, [user?.uid])

  const handleRegistered = useCallback((eventId) => {
    setSelectedEvent(null)
    // Actualizar el Set localmente para reflejo inmediato en las tarjetas
    setRegisteredIds(prev => new Set([...prev, eventId]))
    setToast('¡Inscripción confirmada! 🎉')
  }, [])

  const handleCreated = useCallback(() => {
    setShowForm(false)
    setToast('Evento creado correctamente 🔥')
  }, [])

  return (
    <>
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: '900', color: 'white' }}>Eventos</h2>
        <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'rgba(255,255,255,0.32)' }}>
          Pulsa en un evento para apuntarte
        </p>
      </div>

      {loading ? (
        <>{[1, 2, 3].map(i => (
          <div key={i} style={{ height: '148px', background: '#1a1a1a', borderRadius: '18px', marginBottom: '0.75rem', animation: 'falla-pulse 1.6s ease-in-out infinite' }} />
        ))}</>
      ) : events.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3.5rem 1rem', background: CARD, border: '1px dashed rgba(212,175,55,0.12)', borderRadius: '18px' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🎭</div>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.28)', fontSize: '0.9rem' }}>No hay eventos próximos</p>
          {isAdmin && <p style={{ margin: '0.5rem 0 0', color: 'rgba(255,255,255,0.18)', fontSize: '0.78rem' }}>Pulsa + para crear el primero</p>}
        </div>
      ) : (
        events.map((ev, i) => (
          <EventCard
            key={ev.id}
            event={ev}
            index={i}
            isRegistered={registeredIds.has(ev.id)}
            onPress={setSelectedEvent}
          />
        ))
      )}

      {/* FAB admin */}
      {isAdmin && (
        <button onClick={() => setShowForm(true)} style={{
          position: 'fixed', bottom: 'calc(76px + env(safe-area-inset-bottom))', right: '1.25rem',
          width: '56px', height: '56px',
          background: `linear-gradient(135deg, ${GOLD}, #8a6f1a)`,
          border: 'none', borderRadius: '18px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', minHeight: 'auto', boxShadow: `0 8px 28px rgba(212,175,55,0.4)`, zIndex: 40,
        }}>
          <Plus size={26} color="white" strokeWidth={2.5} />
        </button>
      )}

      {selectedEvent && (
        <RegistrationModal
          event={selectedEvent}
          isRegistered={registeredIds.has(selectedEvent.id)}
          onClose={() => setSelectedEvent(null)}
          onSuccess={() => handleRegistered(selectedEvent.id)}
        />
      )}
      {showForm && <EventFormModal onClose={() => setShowForm(false)} onCreated={handleCreated} />}
      {toast && <SuccessToast message={toast} onDismiss={() => setToast(null)} />}
    </>
  )
}
