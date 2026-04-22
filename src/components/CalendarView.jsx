import { useState, useEffect, useCallback, useMemo } from 'react'
import { collection, query, orderBy, onSnapshot, getDocs, where, deleteDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { ChevronLeft, ChevronRight, Plus, BarChart2, Check, Pencil } from 'lucide-react'
import { RegistrationModal, EventFormModal, SuccessToast, CancelConfirmModal } from './EventList'
import AdminEventControl from './AdminEventControl'

const GOLD  = '#D4AF37'
const WHITE = '#FFFFFF'
const TEXT  = '#111827'
const TEXT2 = '#6B7280'
const MUTED = '#9CA3AF'
const BORDER = '#F3F4F6'
const BG    = '#F9FAFB'
const RED   = '#CE1126'

const EVENT_TYPES = {
  comida:  { emoji: '🍽️', label: 'Comida',  color: GOLD },
  cena:    { emoji: '🌙', label: 'Cena',    color: '#6366f1' },
  acto:    { emoji: '🎭', label: 'Acto',    color: RED },
  reunion: { emoji: '📋', label: 'Reunión', color: TEXT2 },
  otro:    { emoji: '📌', label: 'Otro',    color: MUTED },
}

const FILTER_DEFS = [
  { key: 'food',    label: '🍽️ Comidas/Cenas', types: new Set(['comida', 'cena']) },
  { key: 'acto',    label: '🎭 Actos',          types: new Set(['acto']) },
  { key: 'reunion', label: '📋 Reuniones',       types: new Set(['reunion']) },
]

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

function toKey(d) { return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` }

function buildCalendarDays(year, month) {
  const firstDay  = new Date(year, month, 1)
  const startDow  = (firstDay.getDay() + 6) % 7 // 0 = Mon
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const days = []
  for (let i = startDow - 1; i >= 0; i--) days.push(new Date(year, month, -i))
  for (let d = 1; d <= daysInMonth; d++) days.push(new Date(year, month, d))
  const tail = (7 - (days.length % 7)) % 7
  for (let d = 1; d <= tail; d++) days.push(new Date(year, month + 1, d))
  return days
}

function fmtShort(f) {
  if (!f) return '—'
  const d = f?.toDate ? f.toDate() : new Date(f)
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
}
function fmtTime(f) {
  if (!f) return ''
  const d = f?.toDate ? f.toDate() : new Date(f)
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

export default function CalendarView() {
  const { user, fallero } = useAuth()
  const isAdmin = fallero?.rol === 'admin'

  const [events, setEvents]               = useState([])
  const [loading, setLoading]             = useState(true)
  const [registeredIds, setRegisteredIds] = useState(new Set())
  const [viewDate, setViewDate]           = useState(() => {
    const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1)
  })
  const [selectedDay, setSelectedDay]     = useState(null)
  const [activeFilters, setActiveFilters] = useState(new Set())
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [adminEvent, setAdminEvent]       = useState(null)
  const [editEvent, setEditEvent]         = useState(null)
  const [showForm, setShowForm]           = useState(false)
  const [toast, setToast]                 = useState(null)
  const [cancelTarget, setCancelTarget]   = useState(null)
  const [deleting, setDeleting]           = useState(false)

  useEffect(() => {
    const q = query(collection(db, 'eventos'), orderBy('fecha', 'asc'))
    return onSnapshot(q,
      snap => { setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false) },
      () => setLoading(false),
    )
  }, [])

  useEffect(() => {
    if (!user?.uid) return
    getDocs(query(collection(db, 'inscripciones'), where('uid', '==', user.uid)))
      .then(snap => setRegisteredIds(new Set(snap.docs.map(d => d.data().eventId))))
      .catch(() => {})
  }, [user?.uid])

  const year    = viewDate.getFullYear()
  const month   = viewDate.getMonth()
  const calDays = useMemo(() => buildCalendarDays(year, month), [year, month])
  const todayKey = toKey(new Date())

  const eventsByDay = useMemo(() => {
    const map = {}
    for (const ev of events) {
      if (!ev.fecha) continue
      const d = ev.fecha?.toDate ? ev.fecha.toDate() : new Date(ev.fecha)
      const key = toKey(d)
      if (!map[key]) map[key] = []
      map[key].push(ev)
    }
    return map
  }, [events])

  const filterTypes = useMemo(() => {
    if (activeFilters.size === 0) return null
    return new Set(FILTER_DEFS.filter(f => activeFilters.has(f.key)).flatMap(f => [...f.types]))
  }, [activeFilters])

  const displayedEvents = useMemo(() => {
    let list = selectedDay ? (eventsByDay[toKey(selectedDay)] ?? []) : events
    if (filterTypes) list = list.filter(ev => filterTypes.has(ev.tipo))
    return list
  }, [events, eventsByDay, selectedDay, filterTypes])

  const toggleFilter = (key) => setActiveFilters(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })

  const handleDayClick = (date) => {
    setSelectedDay(prev => prev && toKey(prev) === toKey(date) ? null : date)
  }

  const handleRegistered = useCallback((eventId) => {
    setSelectedEvent(null)
    setRegisteredIds(prev => new Set([...prev, eventId]))
    setToast('¡Inscripción confirmada! 🎉')
  }, [])

  const handleCancelled = useCallback((eventId) => {
    setSelectedEvent(null)
    setRegisteredIds(prev => { const next = new Set(prev); next.delete(eventId); return next })
    setToast('Inscripción anulada correctamente')
  }, [])

  const handleConfirmCancel = useCallback(async () => {
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
    } catch {} finally { setDeleting(false) }
  }, [cancelTarget, deleting, user?.uid])

  const monthLabel = viewDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  const capitalMonth = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)

  return (
    <div style={{ paddingBottom: 100 }}>

      {/* ── Calendar card ─────────────────────────────── */}
      <div style={{ background: WHITE, borderBottom: `1px solid ${BORDER}`, padding: '20px 20px 16px' }}>

        {/* Month navigation */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <button
            onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
            style={{ background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 10, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', minHeight: 'auto', minWidth: 'auto' }}
          >
            <ChevronLeft size={16} color={TEXT2} />
          </button>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: TEXT, letterSpacing: '-0.01em' }}>
            {capitalMonth}
          </h3>
          <button
            onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
            style={{ background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 10, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', minHeight: 'auto', minWidth: 'auto' }}
          >
            <ChevronRight size={16} color={TEXT2} />
          </button>
        </div>

        {/* Weekday headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 6 }}>
          {WEEKDAYS.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: '0.06em', paddingBottom: 6 }}>
              {d}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
          {calDays.map((date, i) => {
            const key = toKey(date)
            const isCurrentMonth = date.getMonth() === month
            const isToday    = key === todayKey
            const isSelected = selectedDay && toKey(selectedDay) === key
            const hasEvents  = (eventsByDay[key]?.length ?? 0) > 0

            return (
              <button
                key={i}
                onClick={() => isCurrentMonth && hasEvents && handleDayClick(date)}
                style={{
                  background: isSelected ? GOLD : isToday ? `${GOLD}14` : 'transparent',
                  border: 'none', borderRadius: 10,
                  padding: '7px 2px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  cursor: isCurrentMonth && hasEvents ? 'pointer' : 'default',
                  minHeight: 'auto', minWidth: 'auto',
                  transition: 'background 0.15s',
                  opacity: isCurrentMonth ? 1 : 0.22,
                }}
              >
                <span style={{
                  fontSize: 13, lineHeight: 1,
                  fontWeight: isToday || isSelected ? 700 : 400,
                  color: isSelected ? WHITE : isToday ? GOLD : TEXT,
                }}>
                  {date.getDate()}
                </span>
                <div style={{
                  width: 4, height: 4, borderRadius: '50%',
                  background: hasEvents ? (isSelected ? WHITE : GOLD) : 'transparent',
                }} />
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Filter chips ──────────────────────────────── */}
      <div style={{
        padding: '10px 20px', background: WHITE,
        borderBottom: `1px solid ${BORDER}`,
        display: 'flex', gap: 8, overflowX: 'auto',
        scrollbarWidth: 'none',
      }}>
        {FILTER_DEFS.map(f => {
          const on = activeFilters.has(f.key)
          return (
            <button
              key={f.key}
              onClick={() => toggleFilter(f.key)}
              style={{
                flexShrink: 0, padding: '6px 14px',
                background: on ? `${GOLD}16` : BG,
                border: `1.5px solid ${on ? GOLD : BORDER}`,
                borderRadius: 20, cursor: 'pointer', minHeight: 'auto',
                fontSize: 12, fontWeight: on ? 700 : 400,
                color: on ? GOLD : TEXT2,
                transition: 'all 0.15s',
              }}
            >
              {f.label}
            </button>
          )
        })}
        {(activeFilters.size > 0 || selectedDay) && (
          <button
            onClick={() => { setActiveFilters(new Set()); setSelectedDay(null) }}
            style={{
              flexShrink: 0, padding: '6px 12px',
              background: 'rgba(239,68,68,0.06)',
              border: '1.5px solid rgba(239,68,68,0.18)',
              borderRadius: 20, cursor: 'pointer', minHeight: 'auto',
              fontSize: 12, color: '#EF4444', fontWeight: 600,
            }}
          >
            Limpiar ✕
          </button>
        )}
      </div>

      {/* ── Events list ───────────────────────────────── */}
      <div style={{ padding: '16px 20px' }}>

        {/* Section label */}
        <p style={{ fontSize: 12, fontWeight: 600, color: MUTED, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 12px' }}>
          {selectedDay
            ? selectedDay.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
            : filterTypes ? 'Filtrado' : 'Todos los actos'}
          {displayedEvents.length > 0 && ` · ${displayedEvents.length}`}
        </p>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ height: 82, background: '#E5E7EB', borderRadius: 16, animation: 'falla-pulse 1.6s ease-in-out infinite' }} />
            ))}
          </div>
        ) : displayedEvents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '44px 24px' }}>
            <div style={{ fontSize: 38, marginBottom: 10 }}>📅</div>
            <p style={{ color: MUTED, fontSize: 14, margin: 0 }}>
              {selectedDay ? 'No hay actos este día' : 'No hay actos próximos'}
            </p>
            {isAdmin && !selectedDay && (
              <p style={{ color: MUTED, fontSize: 12, margin: '6px 0 0', opacity: 0.6 }}>
                Pulsa + para crear el primero
              </p>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {displayedEvents.map(ev => {
              const t        = EVENT_TYPES[ev.tipo] ?? EVENT_TYPES.otro
              const isReg    = registeredIds.has(ev.id)
              const ocupadas = ev.plazasOcupadas ?? 0
              const isFull   = ev.plazasTotal && ocupadas >= ev.plazasTotal && !isReg

              return (
                <div
                  key={ev.id}
                  style={{
                    background: isReg ? 'rgba(16,185,129,0.04)' : WHITE,
                    border: `1.5px solid ${isReg ? 'rgba(16,185,129,0.38)' : BORDER}`,
                    borderRadius: 16, padding: '14px 16px',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                    display: 'flex', alignItems: 'center', gap: 14,
                  }}
                >
                  {/* Type icon */}
                  <div style={{
                    width: 44, height: 44, flexShrink: 0,
                    background: `${t.color}14`,
                    border: `1px solid ${t.color}25`,
                    borderRadius: 13,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20,
                  }}>
                    {t.emoji}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize: 14, fontWeight: 600, color: TEXT,
                      margin: '0 0 5px',
                      overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                    }}>
                      {ev.titulo}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: MUTED }}>
                        {fmtShort(ev.fecha)}
                      </span>
                      {fmtTime(ev.fecha) && (
                        <span style={{
                          display: 'inline-block', padding: '1px 7px',
                          background: `${GOLD}18`, border: `1px solid ${GOLD}35`,
                          borderRadius: 6, fontSize: 11, fontWeight: 700, color: GOLD,
                          letterSpacing: '0.03em',
                        }}>
                          {fmtTime(ev.fecha)}
                        </span>
                      )}
                      <span style={{ fontSize: 11, color: MUTED }}>
                        {ev.precio != null ? `· ${ev.precio} €` : '· Gratis'}
                      </span>
                    </div>
                    {ev.lugar && (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.lugar)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                          marginTop: 4, padding: '3px 8px',
                          background: 'rgba(107,114,128,0.07)', borderRadius: 6,
                          fontSize: 11, color: TEXT2, textDecoration: 'none',
                          fontWeight: 500,
                        }}
                      >
                        📍 {ev.lugar}
                      </a>
                    )}
                  </div>

                  {/* Actions column */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
                    {isAdmin && (
                      <>
                        <button
                          onClick={() => setAdminEvent(ev)}
                          style={{
                            background: `${GOLD}10`, border: `1px solid ${GOLD}28`,
                            borderRadius: 8, padding: '4px 8px',
                            color: GOLD, fontSize: 10, fontWeight: 700,
                            cursor: 'pointer', minHeight: 'auto', minWidth: 'auto',
                            display: 'flex', alignItems: 'center', gap: 3,
                          }}
                        >
                          <BarChart2 size={11} />
                          <span>Inscritos</span>
                        </button>
                        <button
                          onClick={() => setEditEvent(ev)}
                          style={{
                            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: 8, padding: '4px 8px',
                            color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: 700,
                            cursor: 'pointer', minHeight: 'auto', minWidth: 'auto',
                            display: 'flex', alignItems: 'center', gap: 3,
                          }}
                        >
                          <Pencil size={11} />
                          <span>Editar</span>
                        </button>
                      </>
                    )}
                    {isReg ? (
                      <button
                        onClick={() => setCancelTarget(ev)}
                        style={{
                          padding: '7px 12px',
                          background: 'transparent', border: '1.5px solid rgba(206,17,38,0.38)',
                          borderRadius: 8, fontSize: 10, fontWeight: 700, color: 'rgba(220,38,38,0.8)',
                          display: 'flex', alignItems: 'center', gap: 3,
                          cursor: 'pointer', minHeight: 'auto', minWidth: 'auto',
                        }}
                      >
                        Anular inscripción
                      </button>
                    ) : isFull ? (
                      <span style={{
                        padding: '5px 10px',
                        background: 'rgba(206,17,38,0.07)', border: '1px solid rgba(206,17,38,0.2)',
                        borderRadius: 8, fontSize: 10, fontWeight: 700, color: RED,
                      }}>
                        Completo
                      </span>
                    ) : (
                      <button
                        onClick={() => setSelectedEvent(ev)}
                        style={{
                          background: RED, border: 'none',
                          borderRadius: 8, padding: '7px 13px',
                          color: WHITE, fontSize: 11, fontWeight: 700,
                          cursor: 'pointer', minHeight: 'auto', minWidth: 'auto',
                          boxShadow: '0 2px 8px rgba(206,17,38,0.28)',
                        }}
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

      {/* FAB (admin only) */}
      {isAdmin && (
        <button
          onClick={() => setShowForm(true)}
          style={{
            position: 'fixed',
            bottom: 'calc(76px + env(safe-area-inset-bottom))',
            right: '1.25rem',
            width: 56, height: 56,
            background: `linear-gradient(135deg, ${GOLD}, #8a6f1a)`,
            border: 'none', borderRadius: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', minHeight: 'auto',
            boxShadow: '0 8px 28px rgba(212,175,55,0.4)',
            zIndex: 40,
          }}
        >
          <Plus size={26} color="white" strokeWidth={2.5} />
        </button>
      )}

      {selectedEvent && (
        <RegistrationModal
          event={selectedEvent}
          isRegistered={registeredIds.has(selectedEvent.id)}
          onClose={() => setSelectedEvent(null)}
          onSuccess={() => handleRegistered(selectedEvent.id)}
          onCancelled={handleCancelled}
        />
      )}
      {adminEvent && (
        <AdminEventControl event={adminEvent} onClose={() => setAdminEvent(null)} />
      )}
      {showForm && (
        <EventFormModal
          onClose={() => setShowForm(false)}
          onCreated={() => { setShowForm(false); setToast('Evento creado 🔥') }}
        />
      )}
      {editEvent && (
        <EventFormModal
          event={editEvent}
          onClose={() => setEditEvent(null)}
          onCreated={() => { setEditEvent(null); setToast('Evento actualizado ✓') }}
        />
      )}
      {toast && <SuccessToast message={toast} onDismiss={() => setToast(null)} />}
      {cancelTarget && (
        <CancelConfirmModal
          event={cancelTarget}
          onConfirm={handleConfirmCancel}
          onCancel={() => !deleting && setCancelTarget(null)}
          deleting={deleting}
        />
      )}
    </div>
  )
}
