import { useState, useEffect, useMemo } from 'react'
import { collection, query, orderBy, onSnapshot, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { ChevronLeft } from 'lucide-react'
import { RegistrationModal, CancelConfirmModal, SuccessToast } from './EventList'
import { getDocs, deleteDoc, doc } from 'firebase/firestore'

const GOLD   = '#D4AF37'
const WHITE  = '#FFFFFF'
const TEXT   = '#111827'
const TEXT2  = '#6B7280'
const MUTED  = '#9CA3AF'
const BORDER = '#F3F4F6'
const BG     = '#F9FAFB'
const RED    = '#CE1126'
const GREEN  = '#10b981'

const DELEGACIONES = [
  { key: 'Baile',      emoji: '💃', color: '#E91E63' },
  { key: 'Deportes',   emoji: '⚽', color: '#2196F3' },
  { key: 'Falla',      emoji: '🔥', color: GOLD      },
  { key: 'Festejos',   emoji: '🎉', color: '#FF9800' },
  { key: 'Infantiles', emoji: '🧒', color: '#4CAF50' },
  { key: 'Perchero',   emoji: '👗', color: '#9C27B0' },
  { key: 'Protocolo',  emoji: '📋', color: '#607D8B' },
]

const EVENT_TYPES = {
  comida:  { emoji: '🍽️', label: 'Comida',  color: GOLD    },
  cena:    { emoji: '🌙', label: 'Cena',    color: '#6366f1' },
  acto:    { emoji: '🎭', label: 'Acto',    color: RED     },
  reunion: { emoji: '📋', label: 'Reunión', color: TEXT2   },
  otro:    { emoji: '📌', label: 'Otro',    color: MUTED   },
}

function fmtDate(f) {
  if (!f) return '—'
  const d = f?.toDate ? f.toDate() : new Date(f)
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
}
function fmtTime(f) {
  if (!f) return ''
  const d = f?.toDate ? f.toDate() : new Date(f)
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

// ─── Delegation detail view ───────────────────────────────────────────────────

function DelegacionDetail({ delegacion, onBack }) {
  const { user } = useAuth()
  const [events,       setEvents]       = useState([])
  const [announcements, setAnn]         = useState([])
  const [registeredIds, setRegisteredIds] = useState(new Set())
  const [inscCountMap,  setInscCountMap]  = useState({})
  const [loading,       setLoading]       = useState(true)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [cancelTarget,  setCancelTarget]  = useState(null)
  const [deleting,      setDeleting]      = useState(false)
  const [toast,         setToast]         = useState(null)

  useEffect(() => {
    setLoading(true)
    const q = query(collection(db, 'eventos'), orderBy('fecha', 'asc'))
    return onSnapshot(q, snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setEvents(all.filter(ev => ev.delegacion === delegacion.key))
      setLoading(false)
    })
  }, [delegacion.key])

  useEffect(() => {
    const q = query(collection(db, 'anuncios'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setAnn(all.filter(a => a.delegacion === delegacion.key))
    })
  }, [delegacion.key])

  useEffect(() => {
    if (!user?.uid) return
    getDocs(query(collection(db, 'inscripciones'), where('uid', '==', user.uid)))
      .then(snap => setRegisteredIds(new Set(snap.docs.map(d => d.data().eventId))))
      .catch(() => {})
  }, [user?.uid])

  useEffect(() => {
    return onSnapshot(collection(db, 'inscripciones'), snap => {
      const map = {}
      for (const d of snap.docs) {
        const { eventId, totalPersonas } = d.data()
        if (eventId) map[eventId] = (map[eventId] ?? 0) + (totalPersonas ?? 1)
      }
      setInscCountMap(map)
    })
  }, [])

  const handleConfirmCancel = async () => {
    if (!cancelTarget || deleting) return
    setDeleting(true)
    try {
      const snap = await getDocs(query(
        collection(db, 'inscripciones'),
        where('eventId', '==', cancelTarget.id),
        where('uid', '==', user.uid),
      ))
      await Promise.all(snap.docs.map(d => deleteDoc(d.ref)))
      setRegisteredIds(prev => { const next = new Set(prev); next.delete(cancelTarget.id); return next })
      setCancelTarget(null)
      setToast('Inscripción anulada correctamente')
    } catch (err) {
      setCancelTarget(null)
      setToast(err?.message || 'Error al anular.')
    } finally { setDeleting(false) }
  }

  const upcomingEvents = useMemo(() => {
    const now = Date.now() - 3600000
    return events.filter(ev => {
      if (!ev.fecha) return true
      const d = ev.fecha?.toDate ? ev.fecha.toDate() : new Date(ev.fecha)
      return d.getTime() >= now
    })
  }, [events])

  return (
    <div style={{ paddingBottom: 100 }}>
      {/* Header */}
      <div style={{ background: WHITE, borderBottom: `1px solid ${BORDER}`, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <button
          onClick={onBack}
          style={{ background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', minHeight: 'auto', minWidth: 'auto', flexShrink: 0 }}
        >
          <ChevronLeft size={18} color={TEXT2} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: `${delegacion.color}18`, border: `1.5px solid ${delegacion.color}35`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
            {delegacion.emoji}
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: TEXT, letterSpacing: '-0.01em' }}>
              {delegacion.key}
            </h2>
            <p style={{ margin: 0, fontSize: 11, color: TEXT2 }}>Delegación</p>
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 20px', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Events section */}
        <div>
          <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: MUTED, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Próximos actos · {upcomingEvents.length}
          </p>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[1, 2].map(i => <div key={i} style={{ height: 82, background: '#E5E7EB', borderRadius: 16, animation: 'falla-pulse 1.6s ease-in-out infinite' }} />)}
            </div>
          ) : upcomingEvents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', background: WHITE, border: `1.5px solid ${BORDER}`, borderRadius: 16 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📅</div>
              <p style={{ margin: 0, fontSize: 13, color: MUTED }}>No hay actos programados</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {upcomingEvents.map(ev => {
                const t      = EVENT_TYPES[ev.tipo] ?? EVENT_TYPES.otro
                const isReg  = registeredIds.has(ev.id)
                const ocu    = inscCountMap[ev.id] ?? ev.plazasOcupadas ?? 0
                const isFull = ev.plazasTotal && ocu >= ev.plazasTotal && !isReg
                return (
                  <div
                    key={ev.id}
                    style={{ background: isReg ? 'rgba(16,185,129,0.04)' : WHITE, border: `1.5px solid ${isReg ? 'rgba(16,185,129,0.3)' : BORDER}`, borderRadius: 16, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: 12 }}
                  >
                    <div style={{ width: 42, height: 42, flexShrink: 0, background: `${t.color}14`, border: `1px solid ${t.color}22`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                      {t.emoji}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: TEXT, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                        {ev.titulo}
                      </p>
                      <p style={{ margin: '3px 0 0', fontSize: 11, color: TEXT2 }}>
                        {fmtDate(ev.fecha)}{fmtTime(ev.fecha) && ` · ${fmtTime(ev.fecha)}`}
                        {ev.precio != null ? ` · ${ev.precio} €` : ' · Gratis'}
                      </p>
                      {isReg && <span style={{ display: 'inline-block', marginTop: 3, fontSize: 10, fontWeight: 700, color: GREEN }}>✅ APUNTADO</span>}
                    </div>
                    <div style={{ flexShrink: 0 }}>
                      {isReg ? (
                        <button
                          onClick={() => setCancelTarget(ev)}
                          style={{ padding: '6px 10px', background: 'transparent', border: '1.5px solid rgba(206,17,38,0.35)', borderRadius: 8, fontSize: 11, fontWeight: 700, color: 'rgba(206,17,38,0.75)', cursor: 'pointer', minHeight: 'auto' }}
                        >
                          Anular
                        </button>
                      ) : isFull ? (
                        <span style={{ fontSize: 10, fontWeight: 700, color: RED, padding: '6px 8px', background: 'rgba(206,17,38,0.07)', border: '1px solid rgba(206,17,38,0.2)', borderRadius: 8, display: 'inline-block' }}>
                          Completo
                        </span>
                      ) : (
                        <button
                          onClick={() => setSelectedEvent(ev)}
                          style={{ padding: '7px 13px', background: RED, border: 'none', borderRadius: 8, fontSize: 11, fontWeight: 700, color: WHITE, cursor: 'pointer', minHeight: 'auto', boxShadow: '0 2px 8px rgba(206,17,38,0.25)' }}
                        >
                          Apuntarse
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Announcements section */}
        {announcements.length > 0 && (
          <div>
            <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: MUTED, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Avisos · {announcements.length}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {announcements.map(a => {
                const isUrgent = a.esUrgente || a.importante
                const date = a.createdAt?.toDate?.()
                  ? a.createdAt.toDate().toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
                  : null
                return (
                  <div
                    key={a.id}
                    className={isUrgent ? 'jcb-urgent-pulse' : ''}
                    style={{ background: WHITE, borderRadius: 16, padding: '14px 16px', border: `1.5px solid ${isUrgent ? 'rgba(206,17,38,0.45)' : BORDER}`, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                      <h3 style={{ fontSize: 14, fontWeight: 600, color: TEXT, margin: 0, flex: 1, lineHeight: 1.35 }}>{a.titulo}</h3>
                      {isUrgent && <span style={{ background: RED, color: WHITE, fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 20, letterSpacing: '0.05em', flexShrink: 0 }}>URGENTE</span>}
                    </div>
                    {a.cuerpo && <p style={{ fontSize: 12, color: TEXT2, margin: '0 0 6px', lineHeight: 1.5 }}>{a.cuerpo}</p>}
                    {date && <p style={{ fontSize: 11, color: MUTED, margin: 0 }}>{date}</p>}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {selectedEvent && (
        <RegistrationModal
          event={selectedEvent}
          isRegistered={registeredIds.has(selectedEvent.id)}
          onClose={() => setSelectedEvent(null)}
          onSuccess={() => {
            setRegisteredIds(prev => new Set([...prev, selectedEvent.id]))
            setSelectedEvent(null)
            setToast('¡Inscripción confirmada! 🎉')
          }}
          onCancelled={(evId) => {
            setRegisteredIds(prev => { const next = new Set(prev); next.delete(evId); return next })
            setSelectedEvent(null)
            setToast('Inscripción anulada correctamente')
          }}
        />
      )}
      {cancelTarget && (
        <CancelConfirmModal
          event={cancelTarget}
          onConfirm={handleConfirmCancel}
          onCancel={() => !deleting && setCancelTarget(null)}
          deleting={deleting}
        />
      )}
      {toast && <SuccessToast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}

// ─── Delegation list ──────────────────────────────────────────────────────────

export default function Delegaciones({ isAdmin = false }) {
  const [selected, setSelected] = useState(null)

  if (selected) {
    return <DelegacionDetail delegacion={selected} onBack={() => setSelected(null)} />
  }

  return (
    <div style={{ padding: '24px 20px', paddingBottom: 100 }}>
      <h2 style={{ fontSize: 26, fontWeight: 700, color: TEXT, margin: '0 0 4px', letterSpacing: '-0.02em' }}>
        Delegaciones
      </h2>
      <p style={{ fontSize: 13, color: TEXT2, margin: '0 0 24px' }}>
        Actos y avisos por área
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {DELEGACIONES.map(d => (
          <button
            key={d.key}
            onClick={() => setSelected(d)}
            style={{
              width: '100%',
              background: WHITE,
              border: `1.5px solid ${BORDER}`,
              borderRadius: 18,
              padding: '16px 18px',
              display: 'flex', alignItems: 'center', gap: 14,
              cursor: 'pointer', minHeight: 'auto', textAlign: 'left',
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
              transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
            onTouchStart={e => { e.currentTarget.style.borderColor = d.color; e.currentTarget.style.boxShadow = `0 4px 16px ${d.color}20` }}
            onTouchEnd={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)' }}
          >
            <div style={{
              width: 52, height: 52, flexShrink: 0,
              background: `${d.color}14`,
              border: `1.5px solid ${d.color}30`,
              borderRadius: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24,
            }}>
              {d.emoji}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: TEXT }}>{d.key}</p>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: TEXT2 }}>Eventos y avisos</p>
            </div>
            <ChevronLeft size={18} color={MUTED} style={{ transform: 'rotate(180deg)', flexShrink: 0 }} />
          </button>
        ))}
      </div>
    </div>
  )
}
