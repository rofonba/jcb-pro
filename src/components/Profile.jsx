import { useState, useEffect } from 'react'
import {
  collection, query, orderBy, getDocs, where,
  doc, updateDoc, arrayUnion, arrayRemove,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import {
  Download, Users, ChevronRight, X, Loader2,
  Shield, Star, Flame, Plus, Trash2, Baby, Bell, Phone, Check,
} from 'lucide-react'

const GOLD  = '#D4AF37'
const RED   = '#CE1126'
const WHITE = '#FFFFFF'
const TEXT  = '#111827'
const TEXT2 = '#6B7280'
const MUTED = '#9CA3AF'
const BORDER = '#F3F4F6'
const BG    = '#F9FAFB'

// ─── Card primitive ───────────────────────────────────────────────────────────
function Card({ children, style = {} }) {
  return (
    <div style={{
      background: WHITE, borderRadius: 20, padding: '18px 20px',
      border: `1.5px solid ${BORDER}`, boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
      ...style,
    }}>
      {children}
    </div>
  )
}

function InfoRow({ label, value, last = false }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      paddingBottom: last ? 0 : '0.65rem', marginBottom: last ? 0 : '0.65rem',
      borderBottom: last ? 'none' : `1px solid ${BORDER}`,
    }}>
      <span style={{ fontSize: 13, color: TEXT2 }}>{label}</span>
      <span style={{ fontSize: 13, color: TEXT, fontWeight: 600 }}>{value}</span>
    </div>
  )
}

function calcAge(fechaNacimiento) {
  if (!fechaNacimiento) return null
  const birth = new Date(fechaNacimiento)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

// ─── Contact info (phone + birthdate, editable) ───────────────────────────────
function ContactSection({ fallero, userId, onUpdate }) {
  const [editPhone, setEditPhone] = useState(false)
  const [phone, setPhone]         = useState(fallero?.telefono ?? '')
  const [saving, setSaving]       = useState(false)

  const savePhone = async () => {
    setSaving(true)
    try {
      await updateDoc(doc(db, 'falleros', userId), { telefono: phone.trim() })
      onUpdate({ telefono: phone.trim() })
      setEditPhone(false)
    } finally { setSaving(false) }
  }

  const age = calcAge(fallero?.fechaNacimiento)
  const fmtBirth = fallero?.fechaNacimiento
    ? new Date(fallero.fechaNacimiento).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Phone size={15} color={GOLD} />
        <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>Contacto</span>
      </div>

      {/* Phone row */}
      <div style={{ paddingBottom: '0.65rem', marginBottom: '0.65rem', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: TEXT2 }}>Teléfono</span>
          {!editPhone ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {fallero?.telefono
                ? <a href={`tel:${fallero.telefono}`} style={{ fontSize: 13, color: TEXT, fontWeight: 600, textDecoration: 'none' }}>{fallero.telefono}</a>
                : <span style={{ fontSize: 13, color: MUTED }}>Sin teléfono</span>
              }
              <button
                onClick={() => { setPhone(fallero?.telefono ?? ''); setEditPhone(true) }}
                style={{ fontSize: 11, color: GOLD, background: `${GOLD}14`, border: `1px solid ${GOLD}30`, borderRadius: 8, padding: '3px 8px', cursor: 'pointer', minHeight: 'auto', fontWeight: 700 }}
              >
                ✏️
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                autoFocus type="tel"
                value={phone} onChange={e => setPhone(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && savePhone()}
                style={{ padding: '6px 10px', background: BG, border: `1.5px solid ${GOLD}50`, borderRadius: 10, fontSize: 13, color: TEXT, outline: 'none', fontFamily: 'inherit', width: 130 }}
              />
              <button onClick={savePhone} disabled={saving} style={{ background: GOLD, border: 'none', borderRadius: 8, padding: '6px 8px', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', minHeight: 'auto' }}>
                {saving ? <Loader2 size={13} color="white" style={{ animation: 'falla-spin 0.8s linear infinite' }} /> : <Check size={13} color="white" strokeWidth={2.5} />}
              </button>
              <button onClick={() => setEditPhone(false)} style={{ background: BORDER, border: 'none', borderRadius: 8, padding: '6px 8px', cursor: 'pointer', display: 'flex', minHeight: 'auto' }}>
                <X size={13} color={MUTED} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Birthdate row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: TEXT2 }}>Fecha de nacimiento</span>
        <span style={{ fontSize: 13, color: TEXT, fontWeight: 600 }}>
          {fmtBirth
            ? `${fmtBirth}${age != null ? ` · ${age} años` : ''}`
            : '—'}
        </span>
      </div>
    </Card>
  )
}

// ─── Carnet Digital (dark — es un carnet físico) ──────────────────────────────
function CarnetDigital({ nombre, numFallero, rol }) {
  const isAdmin = rol === 'admin'
  return (
    <div style={{
      borderRadius: 20, overflow: 'hidden',
      background: 'linear-gradient(145deg, #1a1a1a 0%, #0f0f0f 100%)',
      border: `1.5px solid rgba(212,175,55,0.35)`,
      boxShadow: '0 20px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(212,175,55,0.1)',
      marginBottom: 20, position: 'relative',
      animation: 'falla-fadeIn 0.4s ease-out',
    }}>
      {/* Header band */}
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
            background: 'rgba(255,255,255,0.2)', borderRadius: '6px', padding: '0.15rem 0.5rem',
            display: 'flex', alignItems: 'center', gap: '0.3rem',
          }}>
            <Shield size={10} color="white" fill="white" />
            <span style={{ fontSize: '0.58rem', fontWeight: '800', color: 'white', letterSpacing: '0.1em' }}>ADMIN</span>
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '1.5rem 1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginBottom: '1.25rem' }}>
          <div style={{
            width: 64, height: 64, flexShrink: 0,
            background: 'linear-gradient(135deg, rgba(212,175,55,0.2), rgba(206,17,38,0.2))',
            border: `1.5px solid rgba(212,175,55,0.3)`, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem',
          }}>
            👤
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
              Número de Fallero
            </div>
            <div style={{
              fontSize: '2.4rem', fontWeight: '900', lineHeight: 1, letterSpacing: '-0.02em',
              background: 'linear-gradient(180deg, #F5D06A 0%, #D4AF37 60%, #A07C1C 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>
              {String(numFallero).padStart(3, '0')}
            </div>
          </div>
        </div>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '1rem' }}>
          <div style={{ fontSize: '1.05rem', fontWeight: '800', color: 'white', marginBottom: '0.4rem' }}>{nombre}</div>
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
        </div>
      </div>

      {/* Bottom strip */}
      <div style={{ height: '4px', background: 'linear-gradient(90deg, #CE1126, #D4AF37, #F5D06A, #D4AF37, #CE1126)' }} />

      {/* Shimmer */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', borderRadius: 20 }}>
        <div style={{
          position: 'absolute', top: 0, bottom: 0, width: '35%',
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.055), transparent)',
          animation: 'falla-cardShimmer 5s ease-in-out infinite',
        }} />
      </div>
    </div>
  )
}

// ─── Gestión de hijos ─────────────────────────────────────────────────────────
function HijosSection({ fallero, userId, onUpdate }) {
  const hijos = fallero?.hijos ?? []
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)

  const addHijo = async () => {
    const name = newName.trim()
    if (!name || hijos.includes(name)) return
    setSaving(true)
    try {
      await updateDoc(doc(db, 'falleros', userId), { hijos: arrayUnion(name) })
      onUpdate({ hijos: [...hijos, name] })
      setNewName('')
      setAdding(false)
    } finally {
      setSaving(false)
    }
  }

  const removeHijo = async (name) => {
    try {
      await updateDoc(doc(db, 'falleros', userId), { hijos: arrayRemove(name) })
      onUpdate({ hijos: hijos.filter(h => h !== name) })
    } catch {}
  }

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: hijos.length > 0 || adding ? 14 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Baby size={16} color={GOLD} />
          <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>Familia</span>
          {hijos.length > 0 && (
            <span style={{
              background: `${GOLD}18`, color: GOLD,
              fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20,
              border: `1px solid ${GOLD}35`,
            }}>
              {hijos.length}
            </span>
          )}
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            style={{
              background: `${GOLD}14`, color: GOLD,
              border: `1.5px solid ${GOLD}40`, borderRadius: 10,
              padding: '6px 12px', fontSize: 12, fontWeight: 700,
              cursor: 'pointer', minHeight: 'auto',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <Plus size={13} />
            Añadir
          </button>
        )}
      </div>

      {/* Hijo list */}
      {hijos.map((h, i) => (
        <div key={h} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 0',
          borderTop: `1px solid ${BORDER}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32,
              background: `${GOLD}14`, borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16,
            }}>
              👦
            </div>
            <span style={{ fontSize: 14, fontWeight: 500, color: TEXT }}>{h}</span>
          </div>
          <button
            onClick={() => removeHijo(h)}
            style={{
              background: 'rgba(239,68,68,0.08)', color: '#EF4444',
              border: '1.5px solid rgba(239,68,68,0.2)', borderRadius: 8,
              padding: '6px', cursor: 'pointer', minHeight: 'auto', minWidth: 'auto',
              display: 'flex', alignItems: 'center',
            }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}

      {/* Add input */}
      {adding && (
        <div style={{ marginTop: hijos.length > 0 ? 12 : 0, display: 'flex', gap: 8 }}>
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addHijo()}
            placeholder="Nombre del hijo/a"
            style={{
              flex: 1, padding: '10px 14px',
              background: BG, border: `1.5px solid ${BORDER}`,
              borderRadius: 12, fontSize: 14, color: TEXT, outline: 'none',
              fontFamily: 'inherit',
            }}
            onFocus={e => e.target.style.borderColor = GOLD}
            onBlur={e => e.target.style.borderColor = BORDER}
          />
          <button
            onClick={addHijo}
            disabled={saving || !newName.trim()}
            style={{
              background: GOLD, color: '#fff', border: 'none', borderRadius: 12,
              padding: '10px 16px', fontSize: 13, fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer', minHeight: 'auto',
              opacity: !newName.trim() ? 0.5 : 1,
            }}
          >
            {saving ? '…' : 'Añadir'}
          </button>
          <button
            onClick={() => { setAdding(false); setNewName('') }}
            style={{
              background: BORDER, color: MUTED, border: 'none', borderRadius: 12,
              padding: '10px 12px', cursor: 'pointer', minHeight: 'auto',
              display: 'flex', alignItems: 'center',
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {hijos.length === 0 && !adding && (
        <p style={{ fontSize: 13, color: MUTED, margin: '8px 0 0' }}>
          Añade a tus hijos para inscribirlos en eventos fácilmente.
        </p>
      )}
    </Card>
  )
}

// ─── Notification Preferences ────────────────────────────────────────────────

const NOTIF_PREFS = [
  { key: 'recordatorioEventos',       emoji: '⏰', label: 'Recordatorio de eventos',        desc: '24h antes del acto' },
  { key: 'nuevosAvisos',              emoji: '📢', label: 'Nuevos avisos de la directiva',   desc: 'Cuando se publique un aviso' },
  { key: 'confirmacionInscripciones', emoji: '✅', label: 'Confirmación de inscripciones',   desc: 'Al apuntarte a un evento' },
]

function NotificationPreferences({ fallero, userId, onUpdate }) {
  const prefs = fallero?.notificaciones ?? {}
  const [saving, setSaving] = useState(null)

  const toggle = async (key) => {
    const newVal = !(prefs[key] ?? true)
    setSaving(key)
    try {
      await updateDoc(doc(db, 'falleros', userId), { [`notificaciones.${key}`]: newVal })
      onUpdate({ notificaciones: { ...prefs, [key]: newVal } })
    } finally {
      setSaving(null)
    }
  }

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Bell size={15} color={GOLD} />
        <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>Configuración de Avisos</span>
      </div>

      {NOTIF_PREFS.map((p, i) => {
        const isOn   = prefs[p.key] ?? true
        const isLast = i === NOTIF_PREFS.length - 1
        return (
          <div
            key={p.key}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              paddingTop: 12, paddingBottom: isLast ? 0 : 12,
              borderTop: `1px solid ${BORDER}`,
            }}
          >
            <div style={{
              width: 36, height: 36, flexShrink: 0,
              background: BG, borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 17,
            }}>
              {p.emoji}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: TEXT, margin: '0 0 1px' }}>{p.label}</p>
              <p style={{ fontSize: 11, color: MUTED, margin: 0 }}>{p.desc}</p>
            </div>
            {/* Toggle pill */}
            <button
              onClick={() => toggle(p.key)}
              disabled={saving === p.key}
              style={{
                flexShrink: 0, width: 44, height: 24,
                background: isOn ? GOLD : '#D1D5DB',
                border: 'none', borderRadius: 12,
                cursor: saving === p.key ? 'not-allowed' : 'pointer',
                minHeight: 'auto', minWidth: 'auto',
                position: 'relative',
                transition: 'background 0.25s',
              }}
            >
              <div style={{
                position: 'absolute', top: 2,
                left: isOn ? 22 : 2,
                width: 20, height: 20,
                background: WHITE, borderRadius: '50%',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                transition: 'left 0.25s',
              }} />
            </button>
          </div>
        )
      })}

      <p style={{ fontSize: 11, color: MUTED, marginTop: 14, marginBottom: 0 }}>
        Las notificaciones se enviarán a tu email registrado.
      </p>
    </Card>
  )
}

// ─── Admin: Modal lista de inscritos ─────────────────────────────────────────
function AttendeesModal({ event, onClose }) {
  const [attendees, setAttendees] = useState([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    getDocs(query(
      collection(db, 'inscripciones'),
      where('eventId', '==', event.id),
      orderBy('createdAt', 'asc'),
    ))
      .then(snap => setAttendees(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [event.id])

  const totalPersonas = attendees.length

  const handleDownload = () => {
    const rows = [
      ['Nº Fallero', 'Nombre', 'Miembro', 'Nota'],
      ...attendees.map(a => [a.numFallero, a.nombre, a.esHijo ? 'Hijo/a' : 'Fallero', a.nota || '']),
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `inscritos-${event.titulo.replace(/\s+/g, '-')}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ width: '100%', maxWidth: '480px', background: WHITE, borderRadius: '24px 24px 0 0', padding: `1.5rem 1.5rem calc(1.5rem + env(safe-area-inset-bottom))`, animation: 'falla-slideUp 0.25s ease-out', maxHeight: '80dvh', display: 'flex', flexDirection: 'column', boxShadow: '0 -4px 40px rgba(0,0,0,0.15)' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ width: 40, height: 4, background: BORDER, borderRadius: 2, margin: '0 auto 1.25rem' }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', flexShrink: 0 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '800', color: TEXT }}>
              Inscritos — {event.titulo}
            </h3>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', color: TEXT2 }}>
              {totalPersonas} {totalPersonas === 1 ? 'persona' : 'personas'}
            </p>
          </div>
          <button onClick={onClose} style={{ background: BORDER, border: 'none', borderRadius: 10, padding: '0.5rem', color: MUTED, display: 'flex', cursor: 'pointer', minHeight: 'auto', minWidth: 'auto' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', marginBottom: '1rem' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
              <Loader2 size={22} color={GOLD} style={{ animation: 'falla-spin 0.8s linear infinite', display: 'inline-block' }} />
            </div>
          ) : attendees.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 0', color: MUTED, fontSize: '0.85rem' }}>
              Nadie apuntado todavía
            </div>
          ) : (
            attendees.map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 0', borderBottom: `1px solid ${BORDER}` }}>
                <div style={{ width: 32, height: 32, background: `${GOLD}15`, border: `1px solid ${GOLD}30`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14 }}>
                  {a.esHijo ? '👦' : '👤'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: '600', color: TEXT }}>{a.nombre}</div>
                  {a.nota && <div style={{ fontSize: '0.72rem', color: MUTED, marginTop: '0.1rem' }}>{a.nota}</div>}
                </div>
                <div style={{ flexShrink: 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: a.esHijo ? TEXT2 : GOLD }}>
                    {a.esHijo ? 'Hijo/a' : `Nº ${String(a.numFallero).padStart(3,'0')}`}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {!loading && attendees.length > 0 && (
          <button
            onClick={handleDownload}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              width: '100%', minHeight: '50px',
              background: `linear-gradient(135deg, ${GOLD}, #8a6f1a)`,
              border: 'none', borderRadius: '14px',
              color: 'white', fontSize: '0.9rem', fontWeight: '700',
              cursor: 'pointer', boxShadow: `0 4px 18px ${GOLD}40`,
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

// ─── Panel de Admin ───────────────────────────────────────────────────────────
function AdminPanel() {
  const [events, setEvents]          = useState([])
  const [loading, setLoading]        = useState(true)
  const [selectedEvent, setSelected] = useState(null)

  useEffect(() => {
    getDocs(query(collection(db, 'eventos'), orderBy('fecha', 'asc')))
      .then(snap => setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Shield size={15} color={GOLD} fill={`${GOLD}40`} />
        <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>Panel de Administración</span>
        <span style={{ background: `${GOLD}18`, color: GOLD, fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, border: `1px solid ${GOLD}35` }}>
          ADMIN
        </span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
          <Loader2 size={20} color={GOLD} style={{ animation: 'falla-spin 0.8s linear infinite', display: 'inline-block' }} />
        </div>
      ) : events.length === 0 ? (
        <p style={{ color: MUTED, fontSize: 13, textAlign: 'center', padding: '1rem 0', margin: 0 }}>
          No hay eventos creados
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {events.map(ev => (
            <button
              key={ev.id}
              onClick={() => setSelected(ev)}
              style={{
                width: '100%', textAlign: 'left',
                background: BG, border: `1.5px solid ${BORDER}`,
                borderRadius: 14, padding: '12px 14px',
                cursor: 'pointer', minHeight: 'auto',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = `${GOLD}60`}
              onMouseLeave={e => e.currentTarget.style.borderColor = BORDER}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 2 }}>{ev.titulo}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Users size={11} color={MUTED} />
                  <span style={{ fontSize: 11, color: MUTED }}>Ver inscritos y exportar CSV</span>
                </div>
              </div>
              <ChevronRight size={15} color={MUTED} />
            </button>
          ))}
        </div>
      )}

      {selectedEvent && (
        <AttendeesModal event={selectedEvent} onClose={() => setSelected(null)} />
      )}
    </Card>
  )
}

// ─── Profile (main export) ────────────────────────────────────────────────────
export default function Profile() {
  const { user, fallero, logout, updateFallero } = useAuth()

  const nombre     = fallero ? `${fallero.nombre} ${fallero.apellidos ?? ''}`.trim() : user?.displayName || user?.email?.split('@')[0] || 'Fallero'
  const numFallero = fallero?.numero ?? '—'
  const rol        = fallero?.rol ?? 'fallero'
  const isAdmin    = rol === 'admin'

  return (
    <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 26, fontWeight: 700, color: TEXT, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Mi Perfil</h2>
        <p style={{ fontSize: 13, color: TEXT2, margin: 0 }}>Tu carnet digital de fallero</p>
      </div>

      <CarnetDigital nombre={nombre} numFallero={numFallero} rol={rol} />

      {/* Info */}
      <Card>
        <InfoRow label="Email" value={user?.email ?? '—'} />
        <InfoRow label="Rol" value={isAdmin ? '👑 Administrador' : '🔥 Fallero'} />
        <InfoRow label="Estado" value={fallero?.estaActivo ? '✅ Activo' : '⏸ Inactivo'} last />
      </Card>

      {/* Contact info */}
      {user && fallero && (
        <ContactSection
          fallero={fallero}
          userId={user.uid}
          onUpdate={updateFallero}
        />
      )}

      {/* Hijos */}
      {user && (
        <HijosSection
          fallero={fallero}
          userId={user.uid}
          onUpdate={updateFallero}
        />
      )}

      {/* Notification preferences */}
      {user && (
        <NotificationPreferences
          fallero={fallero}
          userId={user.uid}
          onUpdate={updateFallero}
        />
      )}

      {/* Admin panel */}
      {isAdmin && <AdminPanel />}

      {/* Logout */}
      <button
        onClick={logout}
        style={{
          width: '100%', minHeight: '50px', marginTop: 4,
          background: 'rgba(239,68,68,0.06)',
          border: '1.5px solid rgba(239,68,68,0.2)',
          borderRadius: 16, color: '#EF4444',
          fontSize: 14, fontWeight: 700, cursor: 'pointer',
        }}
      >
        Cerrar sesión
      </button>
    </div>
  )
}
