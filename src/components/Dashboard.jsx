import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  collection, query, orderBy, limit, onSnapshot,
  getDocs, where, deleteDoc, addDoc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import CalendarView from './CalendarView'
import Profile from './Profile'
import Navigation from './Navigation'
import AdminMetrics from './AdminMetrics'
import { RegistrationModal, SuccessToast, CancelConfirmModal } from './EventList'
import { Bell, Flame, Shield, Clock, ChevronLeft, ChevronRight, X, Loader2 } from 'lucide-react'

const LAST_READ_KEY  = 'jcb_last_read_avisos'
const getLastRead    = () => parseInt(localStorage.getItem(LAST_READ_KEY) || '0', 10)
const markAvisosRead = () => localStorage.setItem(LAST_READ_KEY, Date.now().toString())

const GOLD   = '#D4AF37'
const BG     = '#F9FAFB'
const WHITE  = '#FFFFFF'
const TEXT   = '#111827'
const TEXT2  = '#6B7280'
const MUTED  = '#9CA3AF'
const BORDER = '#F3F4F6'
const GREEN  = '#10b981'
const RED    = '#CE1126'

const EVENT_TYPES = {
  comida:  { emoji: '🍽️', label: 'Comida',  color: GOLD },
  cena:    { emoji: '🌙', label: 'Cena',    color: '#6366f1' },
  acto:    { emoji: '🎭', label: 'Acto',    color: RED },
  reunion: { emoji: '📋', label: 'Reunión', color: TEXT2 },
}

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

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
function toKey(d) { return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` }

function buildCalendarDays(year, month) {
  const firstDay    = new Date(year, month, 1)
  const startDow    = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const days = []
  for (let i = startDow - 1; i >= 0; i--) days.push(new Date(year, month, -i))
  for (let d = 1; d <= daysInMonth; d++) days.push(new Date(year, month, d))
  const tail = (7 - (days.length % 7)) % 7
  for (let d = 1; d <= tail; d++) days.push(new Date(year, month + 1, d))
  return days
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function Card({ children, style = {} }) {
  return (
    <div style={{ background: WHITE, borderRadius: 20, padding: '18px 20px', border: `1.5px solid ${BORDER}`, boxShadow: '0 1px 4px rgba(0,0,0,0.05)', ...style }}>
      {children}
    </div>
  )
}

function SkeletonCard({ height = 90 }) {
  return <div style={{ background: '#E5E7EB', borderRadius: 20, height, animation: 'falla-pulse 1.6s ease-in-out infinite' }} />
}

// ─── Hero calendar (full-bleed, half the page) ───────────────────────────────

function HeroCalendar({ events, registeredIds, onNavigate }) {
  const [viewDate, setViewDate] = useState(() => {
    const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1)
  })
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

  const regDays = useMemo(() => {
    const s = new Set()
    for (const ev of events) {
      if (!registeredIds.has(ev.id) || !ev.fecha) continue
      const d = ev.fecha?.toDate ? ev.fecha.toDate() : new Date(ev.fecha)
      s.add(toKey(d))
    }
    return s
  }, [events, registeredIds])

  const monthLabel   = viewDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  const capitalMonth = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)

  return (
    <div style={{ background: WHITE, borderBottom: `1px solid ${BORDER}`, padding: '18px 20px 20px' }}>
      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <button
          onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
          style={{ background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', minHeight: 'auto', minWidth: 'auto' }}
        >
          <ChevronLeft size={16} color={TEXT2} />
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: TEXT, letterSpacing: '-0.01em' }}>{capitalMonth}</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: GOLD }} />
              <span style={{ fontSize: 10, color: MUTED, fontWeight: 500 }}>Evento</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: GREEN }} />
              <span style={{ fontSize: 10, color: MUTED, fontWeight: 500 }}>Apuntado</span>
            </div>
          </div>
        </div>
        <button
          onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
          style={{ background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', minHeight: 'auto', minWidth: 'auto' }}
        >
          <ChevronRight size={16} color={TEXT2} />
        </button>
      </div>

      {/* Weekday headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 6 }}>
        {WEEKDAYS.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: '0.07em', paddingBottom: 6 }}>
            {d}
          </div>
        ))}
      </div>

      {/* Grid — rows are tall so calendar ~fills half the screen */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
        {calDays.map((date, i) => {
          const key            = toKey(date)
          const isCurrentMonth = date.getMonth() === month
          const isToday        = key === todayKey
          const hasEvents      = (eventsByDay[key]?.length ?? 0) > 0
          const isReg          = regDays.has(key)
          const isSelected     = isToday

          return (
            <button
              key={i}
              onClick={() => hasEvents && isCurrentMonth && onNavigate('calendario')}
              style={{
                background: isToday ? `${GOLD}18` : 'transparent',
                border: isToday ? `1.5px solid ${GOLD}45` : '1.5px solid transparent',
                borderRadius: 12,
                padding: '10px 2px 8px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                cursor: isCurrentMonth && hasEvents ? 'pointer' : 'default',
                minHeight: 'auto', minWidth: 'auto',
                opacity: isCurrentMonth ? 1 : 0.2,
                transition: 'background 0.12s',
              }}
            >
              <span style={{
                fontSize: 14, lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                fontWeight: isToday ? 800 : isCurrentMonth ? 500 : 400,
                color: isToday ? GOLD : TEXT,
              }}>
                {date.getDate()}
              </span>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: isReg ? GREEN : hasEvents ? GOLD : 'transparent', flexShrink: 0 }} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── 4 Action buttons ─────────────────────────────────────────────────────────

function ActionButton({ icon, label, onClick, active = false, badge = 0 }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? `${GOLD}0f` : WHITE,
        border: `1.5px solid ${active ? `${GOLD}55` : BORDER}`,
        borderRadius: 22,
        padding: '22px 14px 20px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        cursor: 'pointer', minHeight: 'auto',
        boxShadow: active ? `0 0 0 3px ${GOLD}20` : '0 1px 3px rgba(0,0,0,0.05)',
        transition: 'all 0.15s',
        position: 'relative',
      }}
      onTouchStart={e => { e.currentTarget.style.transform = 'scale(0.95)'; e.currentTarget.style.boxShadow = `0 0 0 3px ${GOLD}40` }}
      onTouchEnd={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = active ? `0 0 0 3px ${GOLD}20` : '0 1px 3px rgba(0,0,0,0.05)' }}
    >
      {badge > 0 && (
        <span style={{ position: 'absolute', top: 10, right: 10, background: GOLD, color: WHITE, fontSize: 9, fontWeight: 800, minWidth: 16, height: 16, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
          {badge > 9 ? '9+' : badge}
        </span>
      )}
      <span style={{ fontSize: 30 }}>{icon}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: active ? GOLD : TEXT, textAlign: 'center', lineHeight: 1.35 }}>
        {label}
      </span>
    </button>
  )
}

// ─── Mis citas (collapsible reveal) ──────────────────────────────────────────

function MisCitas({ events, registeredIds, onCancelPress }) {
  const mine = useMemo(() => {
    const now = Date.now()
    return events
      .filter(ev => {
        if (!registeredIds.has(ev.id) || !ev.fecha) return false
        const d = ev.fecha?.toDate ? ev.fecha.toDate() : new Date(ev.fecha)
        return d.getTime() > now
      })
      .sort((a, b) => {
        const da = a.fecha?.toDate ? a.fecha.toDate() : new Date(a.fecha)
        const db = b.fecha?.toDate ? b.fecha.toDate() : new Date(b.fecha)
        return da - db
      })
  }, [events, registeredIds])

  if (mine.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '28px 16px', background: WHITE, border: `1.5px solid ${BORDER}`, borderRadius: 20 }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>📭</div>
        <p style={{ margin: 0, fontSize: 14, color: MUTED }}>Aún no te has apuntado a ningún evento</p>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: MUTED, opacity: 0.7 }}>Pulsa «Apuntarme» para empezar</p>
      </div>
    )
  }

  return (
    <div style={{ background: WHITE, border: `1.5px solid ${BORDER}`, borderRadius: 20, padding: '16px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
      <div style={{ marginBottom: 12 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: TEXT }}>Mis inscripciones</p>
        <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 600, color: GREEN }}>
          ✅ {mine.length} {mine.length === 1 ? 'evento confirmado' : 'eventos confirmados'}
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {mine.map(ev => {
          const t = EVENT_TYPES[ev.tipo] ?? EVENT_TYPES.acto
          return (
            <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.18)', borderRadius: 14 }}>
              <div style={{ width: 36, height: 36, flexShrink: 0, background: `${t.color}14`, border: `1px solid ${t.color}25`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>
                {t.emoji}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: TEXT, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  {ev.titulo}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: TEXT2 }}>
                  {fmtDate(ev.fecha)}{fmtTime(ev.fecha) && ` · ${fmtTime(ev.fecha)}`}
                </p>
              </div>
              <button
                onClick={() => onCancelPress(ev)}
                style={{ padding: '5px 9px', background: 'transparent', border: '1px solid rgba(206,17,38,0.28)', borderRadius: 8, fontSize: 10, fontWeight: 700, color: 'rgba(206,17,38,0.75)', cursor: 'pointer', minHeight: 'auto', flexShrink: 0 }}
              >
                Anular
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Countdown to next registered event ──────────────────────────────────────

function getCountdown(target) {
  const diff = Math.max(0, target - Date.now())
  return {
    diff,
    days:  Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    mins:  Math.floor((diff % 3600000)  / 60000),
    secs:  Math.floor((diff % 60000)    / 1000),
  }
}

function NextEventCountdown({ event }) {
  const target = useMemo(() => {
    const d = event.fecha?.toDate ? event.fecha.toDate() : new Date(event.fecha)
    return d.getTime()
  }, [event.fecha])

  const [cd, setCd] = useState(() => getCountdown(target))
  useEffect(() => {
    const id = setInterval(() => setCd(getCountdown(target)), 1000)
    return () => clearInterval(id)
  }, [target])

  if (cd.diff === 0) return null
  const t = EVENT_TYPES[event.tipo] ?? EVENT_TYPES.acto

  return (
    <div style={{ background: 'linear-gradient(135deg, #0d0d0d 0%, #1c1608 100%)', border: '1.5px solid rgba(212,175,55,0.32)', borderRadius: 20, padding: '20px', boxShadow: '0 8px 32px rgba(212,175,55,0.12)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Clock size={11} color={GOLD} />
        <span style={{ fontSize: 10, fontWeight: 700, color: GOLD, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
          Tu próximo evento
        </span>
      </div>
      <p style={{ margin: '0 0 18px', fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.88)', lineHeight: 1.3 }}>
        {t.emoji} {event.titulo}
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        {[
          { val: cd.days,  label: 'días'  },
          { val: cd.hours, label: 'horas' },
          { val: cd.mins,  label: 'min'   },
          { val: cd.secs,  label: 'seg'   },
        ].map(({ val, label }) => (
          <div key={label} style={{ flex: 1, textAlign: 'center', background: 'rgba(212,175,55,0.07)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: 14, padding: '12px 4px' }}>
            <div style={{ fontSize: 26, fontWeight: 900, color: GOLD, lineHeight: 1, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>
              {String(val).padStart(2, '0')}
            </div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginTop: 5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {label}
            </div>
          </div>
        ))}
      </div>
      <p style={{ margin: '14px 0 0', textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.28)' }}>
        {fmtDate(event.fecha)}{fmtTime(event.fecha) && ` · ${fmtTime(event.fecha)}`}
        {event.lugar && ` · ${event.lugar}`}
      </p>
    </div>
  )
}

// ─── Próximos eventos (general list) ─────────────────────────────────────────

function ProximosEventos({ events, registeredIds, onPress, onCancelPress }) {
  const upcoming = useMemo(() => {
    const now = Date.now() - 3600000
    return events
      .filter(ev => {
        if (!ev.fecha) return true
        const d = ev.fecha?.toDate ? ev.fecha.toDate() : new Date(ev.fecha)
        return d.getTime() >= now
      })
      .slice(0, 10)
  }, [events])

  if (upcoming.length === 0) return null

  return (
    <div>
      <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: TEXT2, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        Próximos actos
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {upcoming.map(ev => {
          const t      = EVENT_TYPES[ev.tipo] ?? EVENT_TYPES.acto
          const isReg  = registeredIds.has(ev.id)
          const ocu    = ev.plazasOcupadas ?? 0
          const isFull = ev.plazasTotal && ocu >= ev.plazasTotal && !isReg
          return (
            <div key={ev.id} style={{ background: isReg ? 'rgba(16,185,129,0.03)' : WHITE, border: `1.5px solid ${isReg ? 'rgba(16,185,129,0.3)' : BORDER}`, borderRadius: 16, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: 12 }}>
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
                  <button onClick={() => onCancelPress(ev)} style={{ padding: '6px 10px', background: 'transparent', border: '1.5px solid rgba(206,17,38,0.35)', borderRadius: 8, fontSize: 11, fontWeight: 700, color: 'rgba(206,17,38,0.75)', cursor: 'pointer', minHeight: 'auto' }}>
                    Anular
                  </button>
                ) : isFull ? (
                  <span style={{ fontSize: 10, fontWeight: 700, color: RED, padding: '6px 8px', background: 'rgba(206,17,38,0.07)', border: '1px solid rgba(206,17,38,0.2)', borderRadius: 8, display: 'inline-block' }}>
                    Completo
                  </span>
                ) : (
                  <button onClick={() => onPress(ev)} style={{ padding: '7px 13px', background: RED, border: 'none', borderRadius: 8, fontSize: 11, fontWeight: 700, color: WHITE, cursor: 'pointer', minHeight: 'auto', boxShadow: '0 2px 8px rgba(206,17,38,0.25)' }}>
                    Apuntarse
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Announcement card ────────────────────────────────────────────────────────

function AnnCard({ ann }) {
  const isUrgent = ann.esUrgente || ann.importante
  const date = ann.createdAt?.toDate?.()
    ? ann.createdAt.toDate().toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
    : null
  return (
    <div
      className={isUrgent ? 'jcb-urgent-pulse' : ''}
      style={{ background: WHITE, borderRadius: 20, padding: '16px 18px', border: `1.5px solid ${isUrgent ? 'rgba(206,17,38,0.45)' : BORDER}`, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: TEXT, margin: 0, flex: 1, lineHeight: 1.35 }}>{ann.titulo}</h3>
        {isUrgent && <span style={{ background: RED, color: WHITE, fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 20, flexShrink: 0, letterSpacing: '0.05em' }}>URGENTE</span>}
      </div>
      {ann.cuerpo && <p style={{ fontSize: 13, color: TEXT2, margin: '0 0 8px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{ann.cuerpo}</p>}
      {date && <p style={{ fontSize: 11, color: MUTED, margin: 0 }}>{date}</p>}
    </div>
  )
}

// ─── Admin shortcuts ──────────────────────────────────────────────────────────

function AdminShortcuts({ onNavigate, onMetrics }) {
  const shortcuts = [
    { icon: '➕', label: 'Crear Evento', action: () => onNavigate('calendario') },
    { icon: '📋', label: 'Inscritos',    action: () => onNavigate('perfil')     },
    { icon: '📊', label: 'Métricas',     action: onMetrics                      },
  ]
  return (
    <div style={{ background: `${GOLD}0c`, border: `1.5px solid ${GOLD}30`, borderRadius: 20, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Shield size={14} color={GOLD} />
        <span style={{ fontSize: 12, fontWeight: 700, color: GOLD, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Herramientas Admin
        </span>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        {shortcuts.map(({ icon, label, action }) => (
          <button key={label} onClick={action} style={{ flex: 1, background: WHITE, border: `1.5px solid ${GOLD}30`, borderRadius: 14, padding: '12px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer', minHeight: 'auto', transition: 'border-color 0.15s' }}
            onTouchStart={e => e.currentTarget.style.borderColor = GOLD}
            onTouchEnd={e => e.currentTarget.style.borderColor = `${GOLD}30`}
          >
            <span style={{ fontSize: 22 }}>{icon}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: TEXT }}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Fallas countdown ─────────────────────────────────────────────────────────

const PLANTA = new Date('2027-03-14T20:00:00')
function getDaysLeft() { return Math.max(0, Math.floor((PLANTA - new Date()) / 86400000)) }

function FallasCountdown() {
  const [days, setDays] = useState(getDaysLeft)
  useEffect(() => {
    const id = setInterval(() => setDays(getDaysLeft()), 60000)
    return () => clearInterval(id)
  }, [])
  return (
    <div style={{ background: WHITE, border: `1.5px solid ${BORDER}`, borderRadius: 20, padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', textAlign: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 10 }}>
        <Flame size={12} color={GOLD} fill={GOLD} />
        <span style={{ fontSize: 10, fontWeight: 700, color: GOLD, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Fallas 2027 · Burriana</span>
        <Flame size={12} color={GOLD} fill={GOLD} />
      </div>
      <div style={{ fontSize: 64, fontWeight: 900, lineHeight: 1, letterSpacing: '-0.04em', color: GOLD }}>{days}</div>
      <div style={{ fontSize: 14, color: TEXT2, marginTop: 8, fontWeight: 500 }}>
        {days === 1 ? 'día restante' : 'días restantes para Fallas'}
      </div>
      <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>La Plantà · 14 de marzo · 20:00 h</div>
    </div>
  )
}

// ─── Urgent notification banner ──────────────────────────────────────────────

const NOTIF_DISMISSED_KEY = 'jcb_notif_dismissed'

function getDismissedSet() {
  try { return new Set(JSON.parse(localStorage.getItem(NOTIF_DISMISSED_KEY) || '[]')) }
  catch { return new Set() }
}

function UrgentNotification({ events, onView }) {
  const [dismissed, setDismissed] = useState(() => getDismissedSet())

  const urgentEvent = useMemo(() => {
    const now = Date.now()
    return events
      .filter(ev => {
        if (!ev.notificar || !ev.fecha) return false
        const d = ev.fecha?.toDate ? ev.fecha.toDate() : new Date(ev.fecha)
        return d.getTime() > now && !dismissed.has(ev.id)
      })
      .sort((a, b) => {
        const ta = a.timestampNotificacion?.toMillis?.() ?? 0
        const tb = b.timestampNotificacion?.toMillis?.() ?? 0
        return tb - ta
      })[0] ?? null
  }, [events, dismissed])

  if (!urgentEvent) return null

  const handleDismiss = () => {
    const next = getDismissedSet()
    next.add(urgentEvent.id)
    localStorage.setItem(NOTIF_DISMISSED_KEY, JSON.stringify([...next]))
    setDismissed(new Set(next))
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, #6B0010 0%, #CE1126 55%, #9a7209 100%)',
      padding: '13px 18px',
      display: 'flex', alignItems: 'center', gap: 12,
      borderBottom: '1.5px solid rgba(212,175,55,0.3)',
      animation: 'falla-bannerIn 0.4s ease-out',
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 22, display: 'inline-block', animation: 'falla-bell 1.8s ease-in-out infinite', flexShrink: 0, transformOrigin: 'top center' }}>
        🔔
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.72)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          ¡Nuevo evento importante!
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 700, color: 'white', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
          {urgentEvent.titulo}
        </p>
      </div>
      <button
        onClick={() => onView(urgentEvent)}
        style={{ flexShrink: 0, padding: '6px 13px', background: 'rgba(255,255,255,0.18)', border: '1.5px solid rgba(255,255,255,0.32)', borderRadius: 8, color: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer', minHeight: 'auto', minWidth: 'auto', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', transition: 'background 0.15s' }}
        onTouchStart={e => e.currentTarget.style.background = 'rgba(255,255,255,0.28)'}
        onTouchEnd={e => e.currentTarget.style.background = 'rgba(255,255,255,0.18)'}
      >
        Ver detalles
      </button>
      <button
        onClick={handleDismiss}
        style={{ flexShrink: 0, background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '5px', color: 'rgba(255,255,255,0.75)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'auto', minWidth: 'auto' }}
      >
        <X size={14} />
      </button>
    </div>
  )
}

// ─── Home Tab ─────────────────────────────────────────────────────────────────

function HomeTab({
  nombre, numFallero, isAdmin,
  announcements, loadingAnns,
  events, registeredIds,
  onNavigate, onMetrics,
  onEventPress, onCancelPress,
  unreadCount,
}) {
  const firstName       = nombre.split(' ')[0]
  const [showMyCitas, setShowMyCitas] = useState(false)
  const [showEvents,  setShowEvents]  = useState(false)

  const featuredAnn = useMemo(
    () => announcements.find(a => a.esUrgente || a.importante) || announcements[0] || null,
    [announcements],
  )

  const nextRegistered = useMemo(() => {
    const now = Date.now()
    return events
      .filter(ev => {
        if (!registeredIds.has(ev.id) || !ev.fecha) return false
        const d = ev.fecha?.toDate ? ev.fecha.toDate() : new Date(ev.fecha)
        return d.getTime() > now
      })
      .sort((a, b) => {
        const da = a.fecha?.toDate ? a.fecha.toDate() : new Date(a.fecha)
        const db = b.fecha?.toDate ? b.fecha.toDate() : new Date(b.fecha)
        return da - db
      })[0] ?? null
  }, [events, registeredIds])

  const myCount = useMemo(() => {
    const now = Date.now()
    return events.filter(ev => {
      if (!registeredIds.has(ev.id) || !ev.fecha) return false
      const d = ev.fecha?.toDate ? ev.fecha.toDate() : new Date(ev.fecha)
      return d.getTime() > now
    }).length
  }, [events, registeredIds])

  return (
    <div>
      {/* ── Greeting ─────────────────────────────────────────────── */}
      <div style={{ padding: '22px 20px 16px' }}>
        <p style={{ fontSize: 13, color: TEXT2, margin: '0 0 3px', textTransform: 'capitalize' }}>
          {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: TEXT, margin: 0, lineHeight: 1.15 }}>
          ¡Hola, {firstName}! 👋
        </h1>
        {isAdmin && (
          <span style={{ display: 'inline-block', marginTop: 7, background: `${GOLD}14`, border: `1.5px solid ${GOLD}40`, borderRadius: 20, padding: '3px 12px', fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: '0.08em' }}>
            👑 ADMIN · Nº {String(numFallero).padStart(3, '0')}
          </span>
        )}
      </div>

      {/* ── Hero Calendar (full-bleed, ~half page) ───────────────── */}
      <HeroCalendar events={events} registeredIds={registeredIds} onNavigate={onNavigate} />

      {/* ── 4 Action Buttons ─────────────────────────────────────── */}
      <div style={{ padding: '20px 20px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <ActionButton
            icon="✍️" label="Apuntarme"
            onClick={() => { setShowEvents(v => !v); setShowMyCitas(false) }}
            active={showEvents}
          />
          <ActionButton
            icon="✅" label={'¿A qué me\nhe apuntado?'}
            onClick={() => { setShowMyCitas(v => !v); setShowEvents(false) }}
            active={showMyCitas}
            badge={myCount}
          />
          <ActionButton
            icon="📅" label="Próximos eventos"
            onClick={() => onNavigate('calendario')}
          />
          <ActionButton
            icon="📢" label="Noticias"
            onClick={() => onNavigate('avisos')}
            badge={unreadCount}
          />
        </div>
      </div>

      {/* ── Collapsible: Mis inscripciones ───────────────────────── */}
      {showMyCitas && (
        <div style={{ padding: '16px 20px 0' }}>
          <MisCitas events={events} registeredIds={registeredIds} onCancelPress={onCancelPress} />
        </div>
      )}

      {/* ── Collapsible: Apuntarme (event list) ──────────────────── */}
      {showEvents && (
        <div style={{ padding: '16px 20px 0' }}>
          <ProximosEventos events={events} registeredIds={registeredIds} onPress={onEventPress} onCancelPress={onCancelPress} />
        </div>
      )}

      {/* ── Rest of sections ─────────────────────────────────────── */}
      <div style={{ padding: '20px 20px 36px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Countdown */}
        {nextRegistered && <NextEventCountdown event={nextRegistered} />}

        {/* Featured announcement */}
        {loadingAnns
          ? <SkeletonCard height={88} />
          : featuredAnn && (
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: GOLD, letterSpacing: '0.14em', textTransform: 'uppercase', margin: '0 0 8px', paddingLeft: 2 }}>
                {(featuredAnn.esUrgente || featuredAnn.importante) ? '⚡ Aviso urgente' : '📌 Aviso del día'}
              </p>
              <AnnCard ann={featuredAnn} />
            </div>
          )
        }

        {/* Admin shortcuts */}
        {isAdmin && <AdminShortcuts onNavigate={onNavigate} onMetrics={onMetrics} />}

        {/* Fallas countdown */}
        <FallasCountdown />
      </div>
    </div>
  )
}

// ─── Avisos Tab ───────────────────────────────────────────────────────────────

function AvisosTab({ announcements, loading, isAdmin }) {
  const [showForm,   setShowForm]   = useState(false)
  const [titulo,     setTitulo]     = useState('')
  const [cuerpo,     setCuerpo]     = useState('')
  const [esUrgente,  setEsUrgente]  = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [formError,  setFormError]  = useState('')

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!titulo.trim()) return
    setSaving(true); setFormError('')
    try {
      await addDoc(collection(db, 'anuncios'), {
        titulo:    titulo.trim(),
        cuerpo:    cuerpo.trim() || null,
        esUrgente,
        createdAt: serverTimestamp(),
      })
      setTitulo(''); setCuerpo(''); setEsUrgente(false); setShowForm(false)
    } catch (err) {
      setFormError(err?.message || 'Error al publicar el aviso.')
    } finally { setSaving(false) }
  }

  const inputStyle = { width: '100%', padding: '10px 12px', border: `1.5px solid ${BORDER}`, borderRadius: 12, fontSize: 14, fontFamily: 'inherit', color: TEXT, background: BG, boxSizing: 'border-box', outline: 'none' }

  return (
    <div style={{ padding: '24px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
        <h2 style={{ fontSize: 26, fontWeight: 700, color: TEXT, margin: 0, letterSpacing: '-0.02em' }}>Avisos</h2>
        {isAdmin && (
          <button
            onClick={() => { setShowForm(v => !v); setFormError('') }}
            style={{ background: showForm ? `${GOLD}14` : BG, border: `1.5px solid ${showForm ? GOLD : BORDER}`, borderRadius: 10, padding: '7px 13px', fontSize: 12, fontWeight: 700, color: showForm ? GOLD : TEXT2, cursor: 'pointer', minHeight: 'auto', display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s' }}
          >
            {showForm ? '✕ Cancelar' : '✏️ Nuevo aviso'}
          </button>
        )}
      </div>
      <p style={{ fontSize: 13, color: TEXT2, margin: '0 0 20px' }}>Comunicaciones de la Falla</p>

      {/* Admin creation form */}
      {isAdmin && showForm && (
        <form onSubmit={handleCreate} style={{ background: WHITE, border: `1.5px solid ${GOLD}30`, borderRadius: 20, padding: '18px 18px 16px', marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 5 }}>
            ✏️ Nuevo aviso
          </p>
          <input
            required value={titulo} onChange={e => setTitulo(e.target.value)}
            placeholder="Título del aviso *"
            style={{ ...inputStyle, marginBottom: 10 }}
            onFocus={e => e.target.style.borderColor = GOLD}
            onBlur={e => e.target.style.borderColor = BORDER}
          />
          <textarea
            value={cuerpo} onChange={e => setCuerpo(e.target.value)}
            placeholder="Mensaje (opcional)"
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', marginBottom: 14 }}
            onFocus={e => e.target.style.borderColor = GOLD}
            onBlur={e => e.target.style.borderColor = BORDER}
          />
          {/* Urgency toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: esUrgente ? 'rgba(206,17,38,0.04)' : BG, border: `1.5px solid ${esUrgente ? 'rgba(206,17,38,0.32)' : BORDER}`, borderRadius: 12, marginBottom: 16, transition: 'all 0.2s' }}>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: TEXT }}>⚡ Marcar como urgente</p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: TEXT2 }}>Activa el borde rojo pulsante</p>
            </div>
            <button
              type="button" onClick={() => setEsUrgente(v => !v)}
              style={{ width: 46, height: 26, background: esUrgente ? RED : 'rgba(0,0,0,0.12)', border: 'none', borderRadius: 13, position: 'relative', cursor: 'pointer', transition: 'background 0.22s', minHeight: 'auto', minWidth: 'auto', flexShrink: 0 }}
              aria-checked={esUrgente} role="switch"
            >
              <div style={{ position: 'absolute', top: 3, left: esUrgente ? 23 : 3, width: 20, height: 20, background: WHITE, borderRadius: '50%', transition: 'left 0.22s', boxShadow: '0 1px 3px rgba(0,0,0,0.22)' }} />
            </button>
          </div>
          {formError && <p style={{ margin: '0 0 10px', fontSize: 12, color: RED }}>{formError}</p>}
          <button
            type="submit" disabled={saving}
            style={{ width: '100%', minHeight: 46, background: saving ? `${GOLD}50` : `linear-gradient(135deg, ${GOLD}, #8a6f1a)`, border: 'none', borderRadius: 12, color: WHITE, fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: saving ? 'none' : `0 4px 14px rgba(212,175,55,0.3)` }}
          >
            {saving ? <Loader2 size={16} style={{ animation: 'falla-spin 0.8s linear infinite' }} /> : '📢 Publicar aviso'}
          </button>
        </form>
      )}

      {loading
        ? <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{[1,2,3].map(i => <SkeletonCard key={i} />)}</div>
        : announcements.length === 0
          ? <div style={{ textAlign: 'center', padding: '52px 24px' }}><div style={{ fontSize: 40, marginBottom: 12 }}>📭</div><p style={{ color: MUTED, fontSize: 14, margin: 0 }}>Sin avisos recientes</p></div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{announcements.map(a => <AnnCard key={a.id} ann={a} />)}</div>
      }
    </div>
  )
}

// ─── Dashboard (root) ─────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user, fallero } = useAuth()
  const [announcements, setAnnouncements] = useState([])
  const [loadingAnns, setLoadingAnns]     = useState(true)
  const [activeTab, setActiveTab]         = useState('home')
  const [lastReadTs, setLastReadTs]       = useState(getLastRead)
  const [showMetrics, setShowMetrics]     = useState(false)

  const [events, setEvents]               = useState([])
  const [registeredIds, setRegisteredIds] = useState(new Set())
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [cancelTarget, setCancelTarget]   = useState(null)
  const [deleting, setDeleting]           = useState(false)
  const [toast, setToast]                 = useState(null)

  useEffect(() => {
    const q = query(collection(db, 'anuncios'), orderBy('createdAt', 'desc'), limit(10))
    return onSnapshot(q,
      snap => { setAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoadingAnns(false) },
      () => setLoadingAnns(false),
    )
  }, [])

  useEffect(() => {
    const q = query(collection(db, 'eventos'), orderBy('fecha', 'asc'))
    return onSnapshot(q, snap => setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [])

  useEffect(() => {
    if (!user?.uid) return
    getDocs(query(collection(db, 'inscripciones'), where('uid', '==', user.uid)))
      .then(snap => setRegisteredIds(new Set(snap.docs.map(d => d.data().eventId))))
      .catch(() => {})
  }, [user?.uid])

  const handleTabChange = (tab) => {
    if (tab === 'avisos') { markAvisosRead(); setLastReadTs(Date.now()) }
    setActiveTab(tab)
  }

  const handleRegistered = useCallback((eventId) => {
    setSelectedEvent(null)
    setRegisteredIds(prev => new Set([...prev, eventId]))
    setToast('¡Inscripción confirmada! 🎉')
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
    } catch (err) {
      setCancelTarget(null)
      setToast(err?.message || 'Error al anular. Inténtalo de nuevo.')
    } finally { setDeleting(false) }
  }, [cancelTarget, deleting, user?.uid])

  const nombre     = fallero ? `${fallero.nombre}${fallero.apellidos ? ' ' + fallero.apellidos : ''}` : user?.displayName || user?.email?.split('@')[0] || 'Fallero'
  const numFallero = fallero?.numero ?? '—'
  const isAdmin    = fallero?.rol === 'admin' || fallero?.rol === 'directiva'

  const unreadCount = useMemo(
    () => announcements.filter(a => (a.createdAt?.toMillis?.() ?? 0) > lastReadTs).length,
    [announcements, lastReadTs],
  )

  return (
    <div style={{ minHeight: '100dvh', background: BG, color: TEXT, display: 'flex', flexDirection: 'column', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* Header */}
      <header style={{ padding: '12px 20px', background: 'rgba(249,250,251,0.96)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, background: GOLD, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Flame size={18} color="white" strokeWidth={2.2} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: TEXT, lineHeight: 1, letterSpacing: '-0.01em' }}>Falla Joaquín Costa</div>
            <div style={{ fontSize: 10, color: MUTED, letterSpacing: '0.18em', textTransform: 'uppercase', marginTop: 2 }}>Burriana</div>
          </div>
        </div>
        <button
          onClick={() => handleTabChange('avisos')}
          style={{ background: activeTab === 'avisos' ? `${GOLD}14` : 'transparent', border: `1.5px solid ${activeTab === 'avisos' ? `${GOLD}55` : BORDER}`, borderRadius: 10, padding: '8px', color: activeTab === 'avisos' ? GOLD : MUTED, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'auto', minWidth: 'auto', position: 'relative', transition: 'all 0.2s', cursor: 'pointer' }}
        >
          <Bell size={17} />
          {unreadCount > 0 && activeTab !== 'avisos' && (
            <span style={{ position: 'absolute', top: -4, right: -4, background: GOLD, borderRadius: '100%', minWidth: 16, height: 16, padding: '0 3px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${BG}`, fontSize: 9, fontWeight: 800, color: 'white' }}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </header>

      {/* Urgent event banner */}
      <UrgentNotification events={events} onView={(ev) => setSelectedEvent(ev)} />

      {/* Content */}
      <main style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain' }}>
        {activeTab === 'home' && (
          <HomeTab
            nombre={nombre} numFallero={numFallero} isAdmin={isAdmin}
            announcements={announcements} loadingAnns={loadingAnns}
            events={events} registeredIds={registeredIds}
            onNavigate={handleTabChange}
            onMetrics={() => setShowMetrics(true)}
            onEventPress={setSelectedEvent}
            onCancelPress={setCancelTarget}
            unreadCount={unreadCount}
          />
        )}
        {activeTab === 'calendario' && <CalendarView />}
        {activeTab === 'avisos'     && <AvisosTab announcements={announcements} loading={loadingAnns} isAdmin={isAdmin} />}
        {activeTab === 'perfil'     && <Profile />}
      </main>

      <Navigation active={activeTab} onChange={handleTabChange} unreadAvisos={unreadCount} />

      {selectedEvent && (
        <RegistrationModal
          event={selectedEvent}
          isRegistered={registeredIds.has(selectedEvent.id)}
          onClose={() => setSelectedEvent(null)}
          onSuccess={() => handleRegistered(selectedEvent.id)}
          onCancelled={(eventId) => {
            setSelectedEvent(null)
            setRegisteredIds(prev => { const next = new Set(prev); next.delete(eventId); return next })
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
      {showMetrics && isAdmin && <AdminMetrics onClose={() => setShowMetrics(false)} />}
    </div>
  )
}
