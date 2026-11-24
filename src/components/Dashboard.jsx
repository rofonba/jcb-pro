import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  collection, query, orderBy, onSnapshot,
  getDocs, where, deleteDoc, addDoc, updateDoc, serverTimestamp, doc,
} from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../firebase'
import { isPendingPayment, isStalePending } from '../utils/inscripciones'
import { getDirectImageUrl } from '../utils/imageUtils'
import { enviarNotificacionFCM } from '../services/fcmService'
import { useAuth } from '../contexts/AuthContext'
import CalendarView from './CalendarView'
import Profile from './Profile'
import Navigation from './Navigation'
import Votaciones from './Votaciones'
import AdminMetrics from './AdminMetrics'
import DetalleEvento from './DetalleEvento'
import Delegaciones from './Delegaciones'
import UserWallet from './UserWallet'
import AdminPanelControl from './AdminPanelControl'
import { RegistrationModal, SuccessToast, CancelConfirmModal, PaidNotice } from './EventList'
import { Bell, Flame, Shield, Clock, ChevronLeft, ChevronRight, X, Loader2, Trash2, Pencil } from 'lucide-react'
import logoFalla from '../assets/logo-falla.png'
import { usePushNotifications } from '../hooks/usePushNotifications'
import { useAnuncios } from '../hooks/useAnuncios'
import { useMisInscripciones } from '../hooks/useMisInscripciones'

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
  festivo: { emoji: '🚩', label: 'Festivo', color: '#2563EB' },
}

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

const HOLIDAYS_ES = new Set([
  '2025-0-1',  '2025-0-6',  '2025-2-19', '2025-3-18',
  '2025-4-1',  '2025-5-24', '2025-7-15', '2025-9-9',
  '2025-9-12', '2025-10-1', '2025-11-6', '2025-11-8', '2025-11-25',
  '2026-0-1',  '2026-0-6',  '2026-2-19', '2026-3-3',
  '2026-4-1',  '2026-5-24', '2026-7-15', '2026-9-9',
  '2026-9-12', '2026-10-1', '2026-11-6', '2026-11-8', '2026-11-25',
  '2027-0-1',  '2027-0-6',  '2027-2-19', '2027-2-26',
  '2027-4-1',  '2027-5-24', '2027-7-15', '2027-9-9',
  '2027-9-12', '2027-10-1', '2027-11-6', '2027-11-8', '2027-11-25',
])

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
          const dow            = date.getDay()
          const isWeekend      = isCurrentMonth && (dow === 0 || dow === 6)
          const isHoliday      = isCurrentMonth && HOLIDAYS_ES.has(key)

          const cellBg = isToday   ? `${GOLD}18`
            : isHoliday ? '#EFF6FF'
            : isWeekend ? '#F3F4F6'
            : 'transparent'
          const cellBorder = isToday ? `1.5px solid ${GOLD}45` : '1.5px solid transparent'
          const cellColor  = isToday ? GOLD : isHoliday ? '#2563EB' : TEXT
          const cellWeight = isToday ? 800 : isHoliday || isWeekend ? 600 : isCurrentMonth ? 500 : 400

          return (
            <button
              key={i}
              onClick={() => hasEvents && isCurrentMonth && onNavigate('calendario')}
              style={{
                background: cellBg,
                border: cellBorder,
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
                fontWeight: cellWeight,
                color: cellColor,
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

/* global __BUILD_ID__ */
function MisCitas({ events, inscripciones, myUid, loading = false, counts = {}, onCancelPress, onDetailPress }) {
  const [showPast, setShowPast] = useState(false)
  const eventsById = useMemo(() => new Map(events.map(e => [e.id, e])), [events])
  const [startOfToday] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() })

  // Una fila por EVENTO, agregando todas mis inscripciones en él (propias, pagadas por otro, pagadas para otros)
  const rows = useMemo(() => {
    const byEvent = new Map()
    for (const ins of inscripciones) {
      if (!ins.eventId || ins.esManual) continue
      const r = byEvent.get(ins.eventId) ?? { eventId: ins.eventId, titulo: ins.eventoTitulo ?? null, mine: null, pendiente: false, pagado: false, pagadoPor: null, paraOtros: [], v2: false, insMine: null }
      const isV2 = ins.modelo === 2
      const soyPersona = isV2 ? ins.asistenteUid === myUid : (ins.uid === myUid || (Array.isArray(ins.beneficiariosUids) && ins.beneficiariosUids.includes(myUid)))
      const soyPagador = isV2 ? ins.pagadorUid === myUid : ins.uid === myUid
      const pend = isPendingPayment(ins)
      if (soyPersona) {
        r.mine = true; r.insMine = r.insMine ?? ins; r.v2 = r.v2 || isV2
        if (pend) r.pendiente = true
        if (ins.pagado === true) r.pagado = true
        if (!soyPagador && ins.pagado === true) r.pagadoPor = ins.pagadorNombre ?? ins.nombre ?? null
      } else if (soyPagador && isV2 && !pend) {
        r.paraOtros.push(ins.asistenteNombre ?? 'invitado/a')   // plaza que pagué para otra persona
      } else if (soyPagador && !isV2) {
        r.mine = true; r.insMine = r.insMine ?? ins; if (pend) r.pendiente = true; if (ins.pagado === true) r.pagado = true
      }
      byEvent.set(ins.eventId, r)
    }
    const list = [...byEvent.values()].filter(r => r.mine || r.paraOtros.length).map(r => {
      const ev = eventsById.get(r.eventId)
      const d = ev?.fecha?.toDate ? ev.fecha.toDate() : ev?.fecha ? new Date(ev.fecha) : null
      return { ...r, ev, titulo: ev?.titulo ?? r.titulo ?? 'Evento', fechaMs: d && !isNaN(d) ? d.getTime() : null }
    })
    return list.sort((a, b) => (a.fechaMs ?? Infinity) - (b.fechaMs ?? Infinity))
  }, [inscripciones, eventsById, myUid])

  const upcoming = rows.filter(r => r.fechaMs == null || r.fechaMs >= startOfToday)
  const past     = rows.filter(r => r.fechaMs != null && r.fechaMs < startOfToday).reverse()

  const estado = (r) => {
    if (r.pendiente && !r.pagado) return { txt: '⏳ Pendiente de pago', color: '#92400E', bg: '#FFFBEB', border: '#FCD34D' }
    if (r.pagado) return { txt: r.pagadoPor ? `✓ Pagado por ${r.pagadoPor.split(' ')[0]}` : '✓ Pagado', color: GREEN, bg: 'rgba(16,185,129,0.05)', border: 'rgba(16,185,129,0.25)' }
    if (!r.mine) return { txt: `✓ Pagaste ${r.paraOtros.length} ${r.paraOtros.length === 1 ? 'plaza' : 'plazas'}`, color: GREEN, bg: 'rgba(16,185,129,0.05)', border: 'rgba(16,185,129,0.25)' }
    return { txt: '✓ Inscrito', color: GREEN, bg: 'rgba(16,185,129,0.05)', border: 'rgba(16,185,129,0.25)' }
  }

  const renderRow = (r, dim = false) => {
    const t = EVENT_TYPES[r.ev?.tipo] ?? EVENT_TYPES.acto
    const st = estado(r)
    const canCancel = r.ev && r.mine && !r.pagado && !r.v2 && !dim   // clásico sin pagar: «Anular»
    return (
      <div key={r.eventId} onClick={() => r.ev && onDetailPress?.(r.eventId)}
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: st.bg, border: `1px solid ${st.border}`, borderRadius: 14, cursor: r.ev ? 'pointer' : 'default', opacity: dim ? 0.75 : 1 }}>
        <div style={{ width: 36, height: 36, flexShrink: 0, background: `${t.color}14`, border: `1px solid ${t.color}25`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>
          {t.emoji}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: TEXT, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{r.titulo}</p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: TEXT2 }}>
            {r.ev ? <>{fmtDate(r.ev.fecha)}{fmtTime(r.ev.fecha) && ` · ${fmtTime(r.ev.fecha)}`}</> : 'Fecha por confirmar'}
            {r.mine && r.paraOtros.length > 0 && ` · +${r.paraOtros.length} ${r.paraOtros.length === 1 ? 'plaza pagada' : 'plazas pagadas'} para ${r.paraOtros.join(', ')}`}
            {!r.mine && r.paraOtros.length > 0 && ` · para ${r.paraOtros.join(', ')}`}
          </p>
        </div>
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: st.color, whiteSpace: 'nowrap' }}>{st.txt}</span>
          {canCancel && (
            <button onClick={e => { e.stopPropagation(); onCancelPress(r.ev) }}
              style={{ padding: '4px 9px', background: 'transparent', border: '1px solid rgba(206,17,38,0.28)', borderRadius: 8, fontSize: 10, fontWeight: 700, color: 'rgba(206,17,38,0.75)', cursor: 'pointer', minHeight: 'auto' }}>
              Anular
            </button>
          )}
        </div>
      </div>
    )
  }

  if (loading && rows.length === 0) {
    return <div style={{ textAlign: 'center', padding: '20px', color: MUTED, fontSize: 13 }}>Cargando tus inscripciones…</div>
  }
  if (rows.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '28px 16px', background: WHITE, border: `1.5px solid ${BORDER}`, borderRadius: 20 }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>📭</div>
        <p style={{ margin: 0, fontSize: 14, color: MUTED }}>Aún no te has apuntado a ningún evento</p>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: MUTED, opacity: 0.7 }}>Pulsa «Apuntarme» para empezar</p>
        {/* Diagnóstico: versión que corre y documentos por consulta (uid · asistente · pagador · beneficiario) */}
        <p style={{ margin: '10px 0 0', fontSize: 9, color: MUTED, opacity: 0.55, fontFamily: 'monospace' }}>
          build {typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : '?'} · uid {counts.uid ?? '…'} · asist {counts.asistente ?? '…'} · pag {counts.pagador ?? '…'} · benef {counts.benef ?? '…'}
        </p>
      </div>
    )
  }

  const nPend = upcoming.filter(r => r.pendiente && !r.pagado).length
  return (
    <div style={{ background: WHITE, border: `1.5px solid ${BORDER}`, borderRadius: 20, padding: '16px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
      <div style={{ marginBottom: 12 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: TEXT }}>Mis inscripciones</p>
        <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 600, color: GREEN }}>
          ✅ {upcoming.length - nPend} {upcoming.length - nPend === 1 ? 'evento próximo' : 'eventos próximos'}{nPend ? ` · ⏳ ${nPend} pendiente${nPend === 1 ? '' : 's'} de pago` : ''}
        </p>
      </div>
      {upcoming.length === 0 && <p style={{ margin: '0 0 8px', fontSize: 12, color: MUTED }}>Sin eventos próximos.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{upcoming.map(r => renderRow(r))}</div>
      {past.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button onClick={() => setShowPast(v => !v)}
            style={{ width: '100%', padding: '9px 12px', background: 'transparent', border: `1.5px dashed ${BORDER}`, borderRadius: 12, color: MUTED, fontSize: 12, fontWeight: 700, cursor: 'pointer', minHeight: 'auto' }}>
            {showPast ? '▾' : '▸'} Eventos anteriores · {past.length}
          </button>
          {showPast && <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>{past.map(r => renderRow(r, true))}</div>}
        </div>
      )}
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

function ProximosEventos({ events, registeredIds, paidIds, inscCountMap = {}, onPress, onCancelPress, onDetailPress }) {
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
          const ocu    = inscCountMap[ev.id] ?? ev.plazasOcupadas ?? 0
          const isFull = ev.plazasTotal && ocu >= ev.plazasTotal && !isReg
          return (
            <div key={ev.id} onClick={() => onDetailPress?.(ev.id)} style={{ background: isReg ? 'rgba(16,185,129,0.03)' : WHITE, border: `1.5px solid ${isReg ? 'rgba(16,185,129,0.3)' : BORDER}`, borderRadius: 16, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
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
                {isReg && paidIds?.has(ev.id) ? (
                  <PaidNotice compact />
                ) : isReg ? (
                  <button onClick={e => { e.stopPropagation(); onCancelPress(ev) }} style={{ padding: '6px 10px', background: 'transparent', border: '1.5px solid rgba(206,17,38,0.35)', borderRadius: 8, fontSize: 11, fontWeight: 700, color: 'rgba(206,17,38,0.75)', cursor: 'pointer', minHeight: 'auto' }}>
                    Anular
                  </button>
                ) : isFull ? (
                  <span style={{ fontSize: 10, fontWeight: 700, color: RED, padding: '6px 8px', background: 'rgba(206,17,38,0.07)', border: '1px solid rgba(206,17,38,0.2)', borderRadius: 8, display: 'inline-block' }}>
                    Completo
                  </span>
                ) : (
                  <button onClick={e => { e.stopPropagation(); onPress(ev) }} style={{ padding: '7px 13px', background: RED, border: 'none', borderRadius: 8, fontSize: 11, fontWeight: 700, color: WHITE, cursor: 'pointer', minHeight: 'auto', boxShadow: '0 2px 8px rgba(206,17,38,0.25)' }}>
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

function renderTextWithLinks(text) {
  if (!text) return null
  const parts = text.split(/(https?:\/\/[^\s]+)/g)
  return parts.map((part, i) =>
    /^https?:\/\//.test(part)
      ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: '#2563EB', textDecoration: 'underline', wordBreak: 'break-all' }}>{part}</a>
      : part
  )
}

const DELEGACION_COLORS = {
  Baile: '#E91E63', Deportes: '#2196F3', Falla: GOLD, 'Falla (Monumento)': '#A16207',
  Festejos: '#FF9800', Infantiles: '#4CAF50', Juveniles: '#F97316', Lotería: '#059669',
  Perchero: '#9C27B0', Protocolo: '#607D8B', Redes: '#7C3AED', General: TEXT2,
}

function AnnCard({ ann, isAdmin = false, onDelete, onEdit }) {
  const [imgError, setImgError] = useState(false)
  const isUrgent = ann.esUrgente || ann.importante
  const date = ann.createdAt?.toDate?.()
    ? ann.createdAt.toDate().toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
    : null
  const delColor = DELEGACION_COLORS[ann.delegacion] ?? TEXT2
  const imgUrl = getDirectImageUrl(ann.imageUrl)
  return (
    <div
      className={isUrgent ? 'jcb-urgent-pulse' : ''}
      style={{ background: WHITE, borderRadius: 20, border: `1.5px solid ${isUrgent ? 'rgba(206,17,38,0.45)' : BORDER}`, boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden' }}
    >
      {imgUrl && !imgError && (
        <img
          src={imgUrl} alt=""
          onError={() => setImgError(true)}
          style={{ width: '100%', height: 170, objectFit: 'cover', display: 'block' }}
        />
      )}
      <div style={{ padding: '14px 18px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: TEXT, margin: 0, flex: 1, lineHeight: 1.35 }}>{ann.titulo}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            {ann.pineado === true && <span title="Aviso fijado" style={{ background: `${GOLD}1f`, color: GOLD, border: `1px solid ${GOLD}55`, fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 20, letterSpacing: '0.05em' }}>📌 FIJADO</span>}
            {isUrgent && <span style={{ background: RED, color: WHITE, fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 20, letterSpacing: '0.05em' }}>URGENTE</span>}
            {isAdmin && (
              <>
                <button
                  onClick={() => onEdit(ann)}
                  style={{ background: 'transparent', border: `1px solid ${GOLD}40`, borderRadius: 8, padding: '4px 6px', color: `${GOLD}99`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'auto', minWidth: 'auto', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = `${GOLD}14`; e.currentTarget.style.color = GOLD }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = `${GOLD}99` }}
                  title="Editar aviso"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => onDelete(ann.id)}
                  style={{ background: 'transparent', border: `1px solid rgba(206,17,38,0.22)`, borderRadius: 8, padding: '4px 6px', color: 'rgba(206,17,38,0.55)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'auto', minWidth: 'auto', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(206,17,38,0.07)'; e.currentTarget.style.color = RED }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(206,17,38,0.55)' }}
                  title="Eliminar aviso"
                >
                  <Trash2 size={13} />
                </button>
              </>
            )}
          </div>
        </div>
        {ann.cuerpo && (
          <p style={{ fontSize: 13, color: TEXT2, margin: '0 0 8px', lineHeight: 1.55 }}>
            {renderTextWithLinks(ann.cuerpo)}
          </p>
        )}
        {ann.enlace && (
          <a
            href={ann.enlace} target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 8, padding: '5px 13px', background: '#EFF6FF', border: '1px solid rgba(37,99,235,0.22)', borderRadius: 20, fontSize: 12, fontWeight: 600, color: '#2563EB', textDecoration: 'none' }}
          >
            🔗 Ver enlace
          </a>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
          {date && <p style={{ fontSize: 11, color: MUTED, margin: 0 }}>{date}</p>}
          {ann.delegacion && (
            <span style={{ fontSize: 10, fontWeight: 600, color: delColor, background: `${delColor}12`, border: `1px solid ${delColor}28`, borderRadius: 20, padding: '2px 9px', fontStyle: 'italic' }}>
              {ann.delegacion}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Admin shortcuts ──────────────────────────────────────────────────────────

function AdminShortcuts({ onNavigate, onMetrics, onCreateAviso }) {
  const shortcuts = [
    { icon: '➕', label: 'Crear Evento', action: () => onNavigate('calendario') },
    { icon: '📢', label: 'Crear Aviso',  action: onCreateAviso                  },
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {shortcuts.map(({ icon, label, action }) => (
          <button key={label} onClick={action} style={{ background: WHITE, border: `1.5px solid ${GOLD}30`, borderRadius: 14, padding: '12px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer', minHeight: 'auto', transition: 'border-color 0.15s' }}
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

// ─── Push notification opt-in modal ──────────────────────────────────────────

const PUSH_DISMISS_KEY = 'jcb_push_modal_dismissed'

function PushModal({ permission, tokenSaved, loading, onEnable }) {
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(PUSH_DISMISS_KEY) === '1',
  )

  const shouldShow = (
    !dismissed &&
    !tokenSaved &&
    permission !== 'unsupported' &&
    permission !== 'denied' &&
    permission !== 'granted'
  )

  const handleDismiss = () => {
    sessionStorage.setItem(PUSH_DISMISS_KEY, '1')
    setDismissed(true)
  }

  const handleEnable = async () => {
    await onEnable()
    sessionStorage.setItem(PUSH_DISMISS_KEY, '1')
    setDismissed(true)
  }

  if (!shouldShow) return null

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}
      onClick={handleDismiss}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 360,
          background: 'linear-gradient(145deg, #1a1a1a 0%, #0f0f0f 100%)',
          border: `1.5px solid rgba(212,175,55,0.35)`,
          borderRadius: 24, padding: '28px 24px',
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
          animation: 'falla-slideUp 0.3s ease-out',
          position: 'relative', textAlign: 'center',
        }}
      >
        {/* Dismiss X */}
        <button
          onClick={handleDismiss}
          style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(255,255,255,0.07)', border: 'none', borderRadius: 8, padding: 6, cursor: 'pointer', display: 'flex', minHeight: 'auto', minWidth: 'auto' }}
        >
          <X size={16} color="rgba(255,255,255,0.45)" />
        </button>

        {/* Icon */}
        <div style={{ fontSize: 52, marginBottom: 8, display: 'inline-block', animation: 'falla-bell 1.8s ease-in-out infinite', transformOrigin: 'top center' }}>🔔</div>

        {/* Headline */}
        <h3 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 900, color: 'white', lineHeight: 1.2, letterSpacing: '-0.02em' }}>
          ¡No te pierdas nada!
        </h3>
        <p style={{ margin: '0 0 22px', fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.55 }}>
          Activa las notificaciones y entérate al instante de avisos urgentes, comidas y eventos de la Falla.
        </p>

        {/* Highlight pills */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 22, flexWrap: 'wrap' }}>
          {['⚡ Avisos urgentes', '🍴 Comidas', '🎭 Eventos'].map(t => (
            <span key={t} style={{ background: `rgba(212,175,55,0.12)`, border: `1px solid rgba(212,175,55,0.3)`, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700, color: GOLD }}>
              {t}
            </span>
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={handleEnable}
          disabled={loading}
          style={{
            width: '100%', minHeight: 54,
            background: loading ? `rgba(212,175,55,0.4)` : `linear-gradient(135deg, ${GOLD}, #8a6f1a)`,
            border: 'none', borderRadius: 16,
            color: 'white', fontSize: 15, fontWeight: 900,
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: `0 6px 24px rgba(212,175,55,0.4)`,
            letterSpacing: '-0.01em',
          }}
        >
          {loading
            ? <Loader2 size={18} style={{ animation: 'falla-spin 0.8s linear infinite' }} />
            : '¡Quiero enterarme de todo! 🔔'}
        </button>

        <button
          onClick={handleDismiss}
          style={{ marginTop: 12, background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: 12, cursor: 'pointer', minHeight: 'auto' }}
        >
          Ahora no
        </button>
      </div>
    </div>
  )
}

// ─── Home Tab ─────────────────────────────────────────────────────────────────

const ROLE_BADGE = {
  admin:     '👑 ADMIN',
  directiva: '⭐ DIRECTIVA',
  fallero:   '🔥 FALLERO',
}

function HomeTab({
  nombre, rol, numeroCenso, isAdmin,
  announcements, loadingAnns,
  events, registeredIds, paidIds, inscCountMap,
  misInscripciones, loadingMisIns, myUid, misInsCounts,
  onNavigate, onMetrics, onCreateAviso, onOpenWallet, onOpenPanel,
  onEventPress, onCancelPress, onDetailPress,
  unreadCount,
  pushPermission, pushTokenSaved, pushLoading, onEnablePush,
}) {
  const firstName       = nombre.split(' ')[0]
  const [showMyCitas, setShowMyCitas] = useState(false)
  const [showEvents,  setShowEvents]  = useState(false)

  const homeAnns = useMemo(() => {
    const cutoff = Date.now() - 48 * 3600 * 1000
    const pool = announcements.filter(a => {
      if (!a.createdAt) return true
      const d = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt)
      return d.getTime() >= cutoff
    })
    const base = pool.length >= 2 ? pool : announcements.slice(0, 5)
    return [...base]
      .sort((a, b) => {
        const ap = a.pineado === true ? 1 : 0, bp = b.pineado === true ? 1 : 0
        if (ap !== bp) return bp - ap
        const au = (a.esUrgente || a.importante) ? 1 : 0
        const bu = (b.esUrgente || b.importante) ? 1 : 0
        if (au !== bu) return bu - au
        const da = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt ?? 0)
        const db2 = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt ?? 0)
        return db2 - da
      })
      .slice(0, 5)
  }, [announcements])

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
        {/* Rol + nº de censo oficial (3 dígitos). Sin numeroCenso todavía → sólo el rol. */}
        <span style={{ display: 'inline-block', marginTop: 7, background: `${GOLD}14`, border: `1.5px solid ${GOLD}40`, borderRadius: 20, padding: '3px 12px', fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: '0.08em' }}>
          {ROLE_BADGE[rol] ?? ROLE_BADGE.fallero}
          {Number.isInteger(numeroCenso) && ` · Nº ${String(numeroCenso).padStart(3, '0')}`}
        </span>
      </div>

      {/* ── Check-in / Wallet de entradas ───────────────────────── */}
      <div style={{ padding: '20px 20px 0' }}>
        <button
          onClick={onOpenWallet}
          style={{
            width: '100%', minHeight: 'auto', padding: '20px 18px',
            background: `linear-gradient(135deg, ${GOLD}, #8a6f1a)`,
            border: 'none', borderRadius: 22, cursor: 'pointer',
            boxShadow: '0 8px 26px rgba(212,175,55,0.38)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14,
          }}
        >
          <span style={{ fontSize: 34 }}>🎟️</span>
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
            <span style={{ fontSize: 26, fontWeight: 900, color: WHITE, letterSpacing: '-0.02em', lineHeight: 1 }}>Check-in</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>¿Qué he pagado?</span>
          </span>
        </button>
      </div>

      {/* ── Panel Control (sólo admin/directiva) ─────────────────── */}
      {isAdmin && (
        <div style={{ padding: '12px 20px 0' }}>
          <button
            onClick={onOpenPanel}
            style={{ width: '100%', minHeight: 'auto', padding: '20px 18px', background: WHITE, border: `1.5px solid ${GOLD}55`, borderRadius: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}
          >
            <span style={{ fontSize: 34 }}>📊</span>
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
              <span style={{ fontSize: 22, fontWeight: 900, color: GOLD, letterSpacing: '-0.02em', lineHeight: 1 }}>Control de Accesos</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: TEXT2 }}>Comprobar quién ha pagado</span>
            </span>
          </button>
        </div>
      )}

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
            icon="📢" label="Avisos"
            onClick={() => onNavigate('avisos')}
            badge={unreadCount}
          />
        </div>
      </div>

      {/* ── Collapsible: Mis inscripciones ───────────────────────── */}
      {showMyCitas && (
        <div style={{ padding: '16px 20px 0' }}>
          <MisCitas events={events} inscripciones={misInscripciones} myUid={myUid} loading={loadingMisIns} counts={misInsCounts} onCancelPress={onCancelPress} onDetailPress={onDetailPress} />
        </div>
      )}

      {/* ── Collapsible: Apuntarme (event list) ──────────────────── */}
      {showEvents && (
        <div style={{ padding: '16px 20px 0' }}>
          <ProximosEventos events={events} registeredIds={registeredIds} paidIds={paidIds} inscCountMap={inscCountMap} onPress={onEventPress} onCancelPress={onCancelPress} onDetailPress={onDetailPress} />
        </div>
      )}

      {/* ── Rest of sections ─────────────────────────────────────── */}
      <div style={{ padding: '20px 20px 36px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Countdown */}
        {nextRegistered && <NextEventCountdown event={nextRegistered} />}

        {/* Announcements carousel */}
        {loadingAnns
          ? <SkeletonCard height={88} />
          : homeAnns.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingLeft: 2 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: GOLD, letterSpacing: '0.14em', textTransform: 'uppercase', margin: 0 }}>
                  📢 Avisos recientes
                </p>
                {homeAnns.length > 1 && (
                  <p style={{ fontSize: 10, color: MUTED, margin: 0 }}>
                    {homeAnns.length} avisos · desliza →
                  </p>
                )}
              </div>
              {homeAnns.length === 1
                ? <AnnCard ann={homeAnns[0]} isAdmin={false} />
                : (
                  <div
                    style={{
                      display: 'flex', gap: 12,
                      overflowX: 'auto',
                      scrollSnapType: 'x mandatory',
                      WebkitOverflowScrolling: 'touch',
                      scrollbarWidth: 'none',
                      margin: '0 -20px',
                      paddingLeft: 20, paddingRight: 20, paddingBottom: 6,
                    }}
                  >
                    {homeAnns.map(a => (
                      <div
                        key={a.id}
                        style={{ flexShrink: 0, width: 'min(82vw, 310px)', scrollSnapAlign: 'start' }}
                      >
                        <AnnCard ann={a} isAdmin={false} />
                      </div>
                    ))}
                    {/* Trailing spacer so last card snaps with right padding */}
                    <div style={{ flexShrink: 0, width: 4 }} />
                  </div>
                )
              }
            </div>
          )
        }

        {/* Admin shortcuts */}
        {isAdmin && <AdminShortcuts onNavigate={onNavigate} onMetrics={onMetrics} onCreateAviso={onCreateAviso} />}

        {/* Fallas countdown */}
        <FallasCountdown />
      </div>
    </div>
  )
}

// ─── Avisos Tab ───────────────────────────────────────────────────────────────

const DELEGACION_OPTS = ['General','Baile','Deportes','Falla','Falla (Monumento)','Festejos','Infantiles','Juveniles','Lotería','Perchero','Protocolo','Redes']

function AvisosTab({ announcements, loading, isAdmin, initialShowForm = false }) {
  const [showForm,      setShowForm]      = useState(initialShowForm)
  const [editTarget,    setEditTarget]    = useState(null)
  const [titulo,        setTitulo]        = useState('')
  const [cuerpo,        setCuerpo]        = useState('')
  const [esUrgente,     setEsUrgente]     = useState(false)
  const [pineado,       setPineado]       = useState(false)
  const [delegacion,    setDelegacion]    = useState('General')
  const [enlace,        setEnlace]        = useState('')
  const [imageFile,     setImageFile]     = useState(null)
  const [imagePreview,  setImagePreview]  = useState(null)
  const [saving,        setSaving]        = useState(false)
  const [formError,     setFormError]     = useState('')

  const resetForm = () => {
    setTitulo(''); setCuerpo(''); setEsUrgente(false); setPineado(false); setDelegacion('General')
    setEnlace(''); setImageFile(null); setImagePreview(null); setEditTarget(null); setFormError('')
  }

  const openEdit = (ann) => {
    setEditTarget(ann)
    setTitulo(ann.titulo ?? '')
    setCuerpo(ann.cuerpo ?? '')
    setEsUrgente(ann.esUrgente ?? false)
    setPineado(ann.pineado === true)
    setDelegacion(ann.delegacion ?? 'General')
    setEnlace(ann.enlace ?? '')
    setImageFile(null)
    setImagePreview(ann.imageUrl ?? null)
    setFormError('')
    setShowForm(true)
  }

  const handleCancel = () => { resetForm(); setShowForm(false) }

  const handleImageChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!titulo.trim()) return
    setSaving(true); setFormError('')
    try {
      let imageUrl = editTarget?.imageUrl ?? null
      if (imageFile) {
        const snap = await uploadBytes(storageRef(storage, `avisos/${Date.now()}_${imageFile.name}`), imageFile)
        imageUrl = await getDownloadURL(snap.ref)
      }
      const payload = {
        titulo: titulo.trim(), cuerpo: cuerpo.trim() || null,
        esUrgente, pineado, delegacion, enlace: enlace.trim() || null, imageUrl,
      }
      if (editTarget) {
        await updateDoc(doc(db, 'anuncios', editTarget.id), payload)
      } else {
        await addDoc(collection(db, 'anuncios'), { ...payload, createdAt: serverTimestamp() })
        if (esUrgente) {
          enviarNotificacionFCM(`⚡ ${titulo.trim()}`, cuerpo.trim() || 'Nuevo aviso urgente de la Falla.')
            .catch(err => console.warn('[push] el aviso se guardó pero la notificación no se envió:', err?.message))
        }
      }
      resetForm(); setShowForm(false)
    } catch (err) {
      setFormError(err?.message || 'Error al guardar el aviso.')
    } finally { setSaving(false) }
  }

  const handleDeleteAnnouncement = async (annId) => {
    if (!window.confirm('¿Quieres eliminar este aviso definitivamente?')) return
    try {
      await deleteDoc(doc(db, 'anuncios', annId))
    } catch (err) {
      window.alert(err?.message || 'Error al eliminar el aviso.')
    }
  }

  const inputStyle = { width: '100%', padding: '10px 12px', border: `1.5px solid ${BORDER}`, borderRadius: 12, fontSize: 14, fontFamily: 'inherit', color: TEXT, background: BG, boxSizing: 'border-box', outline: 'none' }

  return (
    <div style={{ padding: '24px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
        <h2 style={{ fontSize: 26, fontWeight: 700, color: TEXT, margin: 0, letterSpacing: '-0.02em' }}>Avisos</h2>
        {isAdmin && (
          <button
            onClick={() => showForm ? handleCancel() : (resetForm(), setShowForm(true))}
            style={{ background: showForm ? `${GOLD}14` : BG, border: `1.5px solid ${showForm ? GOLD : BORDER}`, borderRadius: 10, padding: '7px 13px', fontSize: 12, fontWeight: 700, color: showForm ? GOLD : TEXT2, cursor: 'pointer', minHeight: 'auto', display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s' }}
          >
            {showForm ? '✕ Cancelar' : '✏️ Nuevo aviso'}
          </button>
        )}
      </div>
      <p style={{ fontSize: 13, color: TEXT2, margin: '0 0 20px' }}>Comunicaciones de la Falla</p>

      {isAdmin && showForm && (
        <form onSubmit={handleSave} style={{ background: WHITE, border: `1.5px solid ${GOLD}30`, borderRadius: 20, padding: '18px 18px 16px', marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 14px' }}>
            {editTarget ? '✏️ Editar aviso' : '✏️ Nuevo aviso'}
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
            style={{ ...inputStyle, resize: 'vertical', marginBottom: 10 }}
            onFocus={e => e.target.style.borderColor = GOLD}
            onBlur={e => e.target.style.borderColor = BORDER}
          />
          {/* Image picker */}
          <div style={{ marginBottom: 10 }}>
            <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 600, color: TEXT2 }}>Imagen (opcional)</p>
            {imagePreview && (
              <div style={{ position: 'relative', marginBottom: 8 }}>
                <img src={imagePreview} alt="" style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 12, display: 'block' }} />
                <button
                  type="button"
                  onClick={() => { setImageFile(null); setImagePreview(editTarget?.imageUrl ?? null) }}
                  style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: 8, padding: '4px 6px', cursor: 'pointer', minHeight: 'auto', minWidth: 'auto', display: 'flex', alignItems: 'center' }}
                >
                  <X size={14} color="white" />
                </button>
              </div>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: BG, border: `1.5px dashed ${BORDER}`, borderRadius: 12, cursor: 'pointer', fontSize: 13, color: TEXT2 }}>
              📷 {imageFile ? imageFile.name : (imagePreview ? 'Cambiar imagen' : 'Seleccionar imagen')}
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageChange} />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div>
              <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 600, color: TEXT2 }}>Delegación</p>
              <select
                value={delegacion} onChange={e => setDelegacion(e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}
                onFocus={e => e.target.style.borderColor = GOLD}
                onBlur={e => e.target.style.borderColor = BORDER}
              >
                {DELEGACION_OPTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 600, color: TEXT2 }}>Enlace (opcional)</p>
              <input
                type="url" value={enlace} onChange={e => setEnlace(e.target.value)}
                placeholder="https://…"
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = GOLD}
                onBlur={e => e.target.style.borderColor = BORDER}
              />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: pineado ? `${GOLD}0d` : BG, border: `1.5px solid ${pineado ? `${GOLD}66` : BORDER}`, borderRadius: 12, marginBottom: 10, transition: 'all 0.2s' }}>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: TEXT }}>📌 Fijar arriba</p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: TEXT2 }}>Siempre visible y el primero, aunque pasen más de 30 días</p>
            </div>
            <button
              type="button" onClick={() => setPineado(v => !v)}
              style={{ width: 46, height: 26, background: pineado ? GOLD : 'rgba(0,0,0,0.12)', border: 'none', borderRadius: 13, position: 'relative', cursor: 'pointer', transition: 'background 0.22s', minHeight: 'auto', minWidth: 'auto', flexShrink: 0 }}
              aria-checked={pineado} role="switch"
            >
              <div style={{ position: 'absolute', top: 3, left: pineado ? 23 : 3, width: 20, height: 20, background: WHITE, borderRadius: '50%', transition: 'left 0.22s', boxShadow: '0 1px 3px rgba(0,0,0,0.22)' }} />
            </button>
          </div>
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
            {saving ? <Loader2 size={16} style={{ animation: 'falla-spin 0.8s linear infinite' }} /> : (editTarget ? '💾 Guardar cambios' : '📢 Publicar aviso')}
          </button>
        </form>
      )}

      {loading
        ? <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{[1,2,3].map(i => <SkeletonCard key={i} />)}</div>
        : announcements.length === 0
          ? <div style={{ textAlign: 'center', padding: '52px 24px' }}><div style={{ fontSize: 40, marginBottom: 12 }}>📭</div><p style={{ color: MUTED, fontSize: 14, margin: 0 }}>Sin avisos recientes</p></div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{announcements.map(a => <AnnCard key={a.id} ann={a} isAdmin={isAdmin} onEdit={openEdit} onDelete={handleDeleteAnnouncement} />)}</div>
      }
    </div>
  )
}

// ─── Dashboard (root) ─────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user, fallero } = useAuth()
  // Avisos: últimos 30 días + fijados (siempre), fijados arriba. Ver hooks/useAnuncios.js
  // «¿A qué me he apuntado?»: todas mis inscripciones (clásicas y de grupo), ver hooks/useMisInscripciones.js
  const { inscripciones: misInscripciones, loading: loadingMisIns, counts: misInsCounts } = useMisInscripciones(user?.uid)
  const { anuncios: announcements, loading: loadingAnns } = useAnuncios()
  const [activeTab, setActiveTab]         = useState('home')
  const [lastReadTs, setLastReadTs]       = useState(getLastRead)
  const [showMetrics, setShowMetrics]     = useState(false)

  const [events, setEvents]               = useState([])
  const [registeredIds, setRegisteredIds] = useState(new Set())
  const [pendingIds, setPendingIds]       = useState(new Set())
  const [paidIds, setPaidIds]             = useState(new Set())
  const [inscCountMap, setInscCountMap]   = useState({})
  const [selectedEvent, setSelectedEvent]     = useState(null)
  const [cancelTarget, setCancelTarget]       = useState(null)
  const [deleting, setDeleting]               = useState(false)
  const [toast, setToast]                     = useState(null)
  const [detailEventId, setDetailEventId]     = useState(null)
  const [openAvisosForm, setOpenAvisosForm]   = useState(false)
  const [showWallet, setShowWallet]           = useState(false)
  const [showPanel, setShowPanel]             = useState(false)

  useEffect(() => {
    const q = query(collection(db, 'eventos'), orderBy('fecha', 'asc'))
    return onSnapshot(q, snap => setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [])

  useEffect(() => {
    if (!user?.uid) return
    // En vivo: confirmadas → registeredIds; pagos sin confirmar → pendingIds (con botón Anular)
    // Dos fuentes: inscripciones clásicas (uid = yo) y del modelo de grupo (asistenteUid = yo, aunque pague otro)
    let v1 = null, v2 = null
    const collect = snap => {
      const confirmed = new Set(), pending = new Set(), paid = new Set()
      for (const d of snap.docs) {
        const x = d.data()
        if (x.esManual || !x.eventId) continue
        ;(isPendingPayment(x) ? pending : confirmed).add(x.eventId)
        if (x.pagado === true) paid.add(x.eventId)
      }
      return { confirmed, pending, paid }
    }
    const publish = () => {
      const u = k => new Set([...(v1?.[k] ?? []), ...(v2?.[k] ?? [])])
      setPaidIds(u('paid')); setRegisteredIds(u('confirmed')); setPendingIds(u('pending'))
    }
    const col = collection(db, 'inscripciones')
    const u1 = onSnapshot(query(col, where('uid', '==', user.uid)),          s => { v1 = collect(s); publish() }, () => {})
    const u2 = onSnapshot(query(col, where('asistenteUid', '==', user.uid)), s => { v2 = collect(s); publish() }, () => {})
    return () => { u1(); u2() }
  }, [user?.uid])

  // Reservas de pago ABANDONADAS (app cerrada a mitad del cobro de Stripe): pasados 15 min ya no
  // ocupan plaza y se borran solas al volver a entrar, para que el usuario no arrastre "pendientes"
  // eternos ni quede bloqueado. Cubre el modelo clásico (uid) y el checkout de grupo (pagadorUid).
  useEffect(() => {
    if (!user?.uid) return
    const col = collection(db, 'inscripciones')
    const qs = [
      query(col, where('uid',        '==', user.uid), where('estadoPago', '==', 'pendiente')),
      query(col, where('pagadorUid', '==', user.uid), where('estadoPago', '==', 'pendiente')),
    ]
    let cancelled = false
    ;(async () => {
      for (const q of qs) {
        const snap = await getDocs(q).catch(() => null)
        if (!snap || cancelled) continue
        for (const d of snap.docs) if (isStalePending(d.data())) await deleteDoc(d.ref).catch(() => {})
      }
    })()
    return () => { cancelled = true }
  }, [user?.uid])

  // Real-time inscription counts for all events (capacity / isFull logic)
  useEffect(() => {
    return onSnapshot(collection(db, 'inscripciones'), snap => {
      const map = {}
      for (const d of snap.docs) {
        if (isPendingPayment(d.data())) continue   // pendientes de pago no cuentan como confirmados
        const { eventId, totalPersonas } = d.data()
        if (eventId) map[eventId] = (map[eventId] ?? 0) + (totalPersonas ?? 1)
      }
      setInscCountMap(map)
    })
  }, [])

  const handleTabChange = (tab) => {
    if (tab === 'avisos') { markAvisosRead(); setLastReadTs(Date.now()); setOpenAvisosForm(false) }
    setActiveTab(tab)
  }

  const handleCreateAviso = () => {
    markAvisosRead(); setLastReadTs(Date.now())
    setOpenAvisosForm(true)
    setActiveTab('avisos')
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
  const isAdmin    = fallero?.rol === 'admin' || fallero?.rol === 'directiva'

  const {
    permission: pushPermission,
    tokenSaved: pushTokenSaved,
    loading:    pushLoading,
    enableNotifications: enablePush,
  } = usePushNotifications(user?.uid)

  const unreadCount = useMemo(
    () => announcements.filter(a => (a.createdAt?.toMillis?.() ?? 0) > lastReadTs).length,
    [announcements, lastReadTs],
  )

  return (
    <div style={{ minHeight: '100dvh', background: BG, color: TEXT, display: 'flex', flexDirection: 'column', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* Header */}
      <header style={{ padding: '12px 20px', background: 'rgba(249,250,251,0.96)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img
            src={logoFalla}
            alt="Falla Joaquín Costa"
            style={{ width: 40, height: 40, objectFit: 'contain', flexShrink: 0 }}
          />
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
      <UrgentNotification events={events} onView={(ev) => setDetailEventId(ev.id)} />

      {/* Content */}
      {/* Sin overflow/overscroll propios: el scroll vertical lo hace el body (nativo, un dedo) */}
      <main style={{ flex: 1 }}>
        {activeTab === 'home' && (
          <HomeTab
            nombre={nombre} rol={fallero?.rol ?? 'fallero'} numeroCenso={fallero?.numeroCenso ?? null} isAdmin={isAdmin}
            announcements={announcements} loadingAnns={loadingAnns}
            events={events} registeredIds={registeredIds} pendingIds={pendingIds} paidIds={paidIds} inscCountMap={inscCountMap}
            misInscripciones={misInscripciones} loadingMisIns={loadingMisIns} myUid={user?.uid} misInsCounts={misInsCounts}
            onNavigate={handleTabChange}
            onMetrics={() => setShowMetrics(true)}
            onCreateAviso={handleCreateAviso}
            onOpenWallet={() => setShowWallet(true)}
            onOpenPanel={() => setShowPanel(true)}
            onEventPress={setSelectedEvent}
            onCancelPress={setCancelTarget}
            onDetailPress={setDetailEventId}
            unreadCount={unreadCount}
            pushPermission={pushPermission}
            pushTokenSaved={pushTokenSaved}
            pushLoading={pushLoading}
            onEnablePush={enablePush}
          />
        )}
        {activeTab === 'calendario'   && <CalendarView onDetailPress={setDetailEventId} />}
        {activeTab === 'avisos'       && <AvisosTab announcements={announcements} loading={loadingAnns} isAdmin={isAdmin} initialShowForm={openAvisosForm} />}
        {activeTab === 'delegaciones' && <Delegaciones isAdmin={isAdmin} />}
        {activeTab === 'votaciones'   && <Votaciones userId={user?.uid} isAdmin={isAdmin} />}
        {activeTab === 'perfil'       && <Profile />}
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
      {showWallet && <UserWallet events={events} onClose={() => setShowWallet(false)} />}
      {showPanel && isAdmin && <AdminPanelControl events={events} onClose={() => setShowPanel(false)} />}
      {showMetrics && isAdmin && <AdminMetrics onClose={() => setShowMetrics(false)} />}

      {detailEventId && (
        <DetalleEvento
          eventId={detailEventId}
          onClose={() => setDetailEventId(null)}
          onRegistered={(evId) => setRegisteredIds(prev => new Set([...prev, evId]))}
          onCancelled={(evId) => setRegisteredIds(prev => { const next = new Set(prev); next.delete(evId); return next })}
        />
      )}

      <PushModal
        permission={pushPermission}
        tokenSaved={pushTokenSaved}
        loading={pushLoading}
        onEnable={enablePush}
      />
    </div>
  )
}
