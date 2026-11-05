import { useState, useEffect, useMemo, useRef } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { ChevronLeft, MapPin } from 'lucide-react'
import { getPersons, getCheckInState, markCheckInGroup, getDelegatedPersons } from '../utils/checkIn'

const GOLD   = '#D4AF37'
const BG     = '#F9FAFB'
const WHITE  = '#FFFFFF'
const TEXT   = '#111827'
const TEXT2  = '#6B7280'
const MUTED  = '#9CA3AF'
const BORDER = '#E5E7EB'
const GREEN  = '#10b981'
const BLUE   = '#2563EB'
const SUCCESS_GREEN = '#22c55e'   // green-500

const toDate = f => (f?.toDate ? f.toDate() : f ? new Date(f) : null)

const fmtLong = d => d
  ? d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
  : ''
const fmtHour = d => d
  ? d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  : ''

// Nombres de las personas incluidas en el pago (excluye al pagador).
// Usa `beneficiarios`; para inscripciones antiguas cae a los arrays de acompañantes.
function includedNames(ins) {
  if (Array.isArray(ins.beneficiarios) && ins.beneficiarios.length) {
    return ins.beneficiarios.map(b => b.nombre).filter(Boolean)
  }
  return [...(ins.acompañantesAdultos ?? []), ...(ins.acompañantesNinos ?? [])]
    .map(c => c.nombre).filter(Boolean)
}

// Reloj en vivo: demuestra que el ticket no es una captura de pantalla.
function LiveClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
      {now.toLocaleTimeString('es-ES')}
    </span>
  )
}

function Ticket({ ins, event, isPayer, holderName, myUid }) {
  const date    = toDate(event?.fecha)
  // Estado de check-in de QUIEN MIRA la pantalla (su uid), no del grupo.
  const mine    = getCheckInState(ins, myUid)
  const entered = mine.entered
  const persons = getPersons(ins)
  const names   = includedNames(ins)
  const total   = ins.totalConComision != null ? Number(ins.totalConComision).toFixed(2).replace('.', ',') : null
  const accent  = entered ? MUTED : isPayer ? GOLD : BLUE

  return (
    <div style={{ background: WHITE, borderRadius: 22, overflow: 'hidden', border: `1.5px solid ${BORDER}`, boxShadow: '0 6px 24px rgba(0,0,0,0.07)', opacity: entered ? 0.92 : 1 }}>
      {/* Banda superior */}
      <div style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)`, padding: '14px 18px', color: WHITE }}>
        <p style={{ margin: 0, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.85 }}>
          Entrada · Falla Joaquín Costa
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 800, lineHeight: 1.2 }}>{event?.titulo ?? ins.eventoTitulo}</p>
        <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.9, textTransform: 'capitalize' }}>
          {fmtLong(date)}{fmtHour(date) !== '00:00' && date ? ` · ${fmtHour(date)}` : ''}
        </p>
      </div>

      {/* Cuerpo */}
      <div style={{ padding: '16px 18px' }}>
        {event?.lugar && (
          <p style={{ margin: '0 0 12px', fontSize: 12, color: TEXT2, display: 'flex', alignItems: 'center', gap: 5 }}>
            <MapPin size={13} /> {event.lugar}
          </p>
        )}

        <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Titular</p>
        <p style={{ margin: '2px 0 12px', fontSize: 22, fontWeight: 800, color: TEXT, letterSpacing: '-0.01em' }}>{holderName}</p>

        {isPayer ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '10px 12px', background: `${GREEN}12`, border: `1px solid ${GREEN}40`, borderRadius: 12, marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: GREEN }}>✅ Pagado</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: GREEN }}>{total ? `${total} €` : '—'}</span>
            </div>
            {names.length > 0 && (
              <p style={{ margin: '0 0 8px', fontSize: 13, color: TEXT, lineHeight: 1.5 }}>
                <strong>Incluye entrada para:</strong> {names.join(', ')}
              </p>
            )}
            {/* Desglose individual de acceso */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
              {persons.map(p => {
                const st = getCheckInState(ins, p.id)
                return (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 10px', background: st.entered ? '#F3F4F6' : `${GREEN}0d`, borderRadius: 8 }}>
                    <span style={{ color: TEXT, fontWeight: 600 }}>{p.id === myUid ? 'Tú' : p.nombre}</span>
                    <span style={{ fontWeight: 700, color: st.entered ? TEXT2 : '#B45309' }}>
                      {st.entered ? 'Dentro ✅' : 'Pendiente ⏳'}
                    </span>
                  </div>
                )
              })}
            </div>
            <p style={{ margin: 0, fontSize: 12, color: TEXT2 }}>
              {ins.totalPersonas ?? 1} {(ins.totalPersonas ?? 1) === 1 ? 'persona' : 'personas'} en total
            </p>
          </>
        ) : (
          <div style={{ padding: '12px 14px', background: `${BLUE}10`, border: `1.5px solid ${BLUE}45`, borderRadius: 12 }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: BLUE, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Entrada ya pagada</p>
            <p style={{ margin: '3px 0 0', fontSize: 17, fontWeight: 800, color: TEXT }}>Pagado por: {ins.nombre}</p>
          </div>
        )}
      </div>

      {/* Pie: estado de acceso */}
      <div style={{ borderTop: `2px dashed ${BORDER}`, padding: '12px 18px', background: entered ? '#F3F4F6' : `${GREEN}0d`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        {entered ? (
          <span style={{ fontSize: 13, fontWeight: 800, color: TEXT2 }}>
            🚪 YA HA ENTRADO{toDate(mine.at) ? ` · ${fmtHour(toDate(mine.at))}` : ''}
          </span>
        ) : (
          <span style={{ fontSize: 13, fontWeight: 800, color: GREEN }}>🟢 VÁLIDA PARA ENTRAR</span>
        )}
        <span style={{ fontSize: 12, color: TEXT2 }}><LiveClock /></span>
      </div>
    </div>
  )
}


// ─── Deslizable «Slide to check-in» (input range estilizado, sin librerías) ────────────────
const SLIDER_CSS = `
.ft-slider { -webkit-appearance: none; appearance: none; width: 100%; height: 68px; margin: 0;
  border-radius: 34px; outline: none; touch-action: pan-y; cursor: grab; }
.ft-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 60px; height: 60px;
  border-radius: 50%; background: #fff; border: 3px solid ${SUCCESS_GREEN};
  box-shadow: 0 3px 10px rgba(0,0,0,0.25); cursor: grab; }
.ft-slider::-moz-range-thumb { width: 54px; height: 54px; border-radius: 50%; background: #fff;
  border: 3px solid ${SUCCESS_GREEN}; box-shadow: 0 3px 10px rgba(0,0,0,0.25); cursor: grab; }
.ft-slider::-moz-range-track { background: transparent; }
.ft-slider:disabled { opacity: 0.6; cursor: wait; }
`

function SlideToCheckIn({ onComplete, busy, disabled = false, label = 'Desliza para entregar ticket' }) {
  const [value, setValue] = useState(0)
  const done = useRef(false)

  const release = () => {
    if (done.current) return
    if (value >= 96) {
      done.current = true
      setValue(100)
      Promise.resolve(onComplete()).finally(() => { done.current = false; setValue(0) })
    } else {
      setValue(0)   // vuelve al inicio si no se completa
    }
  }

  return (
    <div style={{ position: 'relative', borderRadius: 34, background: '#E5E7EB', overflow: 'hidden' }}>
      <style>{SLIDER_CSS}</style>
      {/* relleno verde que sigue al dedo */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `calc(${value}% * 0.9 + 34px)`, background: `${SUCCESS_GREEN}55`, borderRadius: 34, transition: value === 0 ? 'width 0.25s' : 'none', pointerEvents: 'none' }} />
      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingLeft: 56, fontSize: 17, fontWeight: 800, color: TEXT2, opacity: Math.max(0, 1 - value / 50), pointerEvents: 'none', textAlign: 'center' }}>
        {busy ? 'Entregando…' : `${label}  ➜`}
      </span>
      <input
        className="ft-slider" type="range" min="0" max="100" step="1"
        value={value} disabled={busy || disabled}
        aria-label={label}
        onChange={e => setValue(Number(e.target.value))}
        onPointerUp={release} onTouchEnd={release} onMouseUp={release}
        onKeyUp={e => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') release() }}
        style={{ position: 'relative', background: 'transparent' }}
      />
    </div>
  )
}

// ─── Fast Track: evento de hoy + deslizable ──────────────────────────────────────────────
function FastTrack({ event, ins, busy, error, onSlide, onShowAll, others, onPick, group, selectedIds, onToggle, myName }) {
  const date = toDate(event?.fecha)
  return (
    <div style={{ padding: '28px 22px 40px', display: 'flex', flexDirection: 'column', gap: 22, minHeight: 'calc(100dvh - 90px)', justifyContent: 'center' }}>
      {others.length > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          {others.map(o => (
            <button key={o.ins.id} onClick={() => onPick(o.ins.id)}
              style={{ padding: '6px 12px', borderRadius: 20, minHeight: 'auto', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                background: o.ins.id === ins.id ? `${GOLD}18` : WHITE, border: `1.5px solid ${o.ins.id === ins.id ? GOLD : BORDER}`, color: o.ins.id === ins.id ? GOLD : TEXT2 }}>
              {o.event?.titulo}
            </button>
          ))}
        </div>
      )}

      <div style={{ textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: GOLD }}>Hoy · Entrada pagada ✅</p>
        <h2 style={{ margin: '10px 0 6px', fontSize: 30, fontWeight: 900, lineHeight: 1.15, color: TEXT, letterSpacing: '-0.02em' }}>{event?.titulo ?? ins.eventoTitulo}</h2>
        <p style={{ margin: 0, fontSize: 15, color: TEXT2, textTransform: 'capitalize' }}>
          {fmtLong(date)}{date && fmtHour(date) !== '00:00' ? ` · ${fmtHour(date)}` : ''}
        </p>
      </div>

      {/* Mi grupo: yo + invitados sin app. Marca quién entra AHORA (los que llegan después, luego). */}
      {group.length > 1 && (
        <div style={{ background: WHITE, border: `1.5px solid ${BORDER}`, borderRadius: 18, padding: '12px 14px' }}>
          <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 800, color: TEXT2, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            ¿Quién entra ahora?
          </p>
          {group.map(({ person, entered, isMe }) => (
            <label key={person.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px', borderTop: `1px solid ${BORDER}`, cursor: entered ? 'default' : 'pointer', opacity: entered ? 0.6 : 1 }}>
              <input
                type="checkbox" disabled={entered || busy}
                checked={entered || selectedIds.has(person.id)}
                onChange={() => onToggle(person.id)}
                style={{ width: 24, height: 24, accentColor: SUCCESS_GREEN, flexShrink: 0 }}
              />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 16, fontWeight: 700, color: TEXT, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  {isMe ? `Tú (${myName})` : person.nombre}
                </span>
                {!isMe && <span style={{ fontSize: 11, fontWeight: 700, color: '#EA580C' }}>{person.tipo === 'manual' ? 'INVITADO EXTERNO' : 'HIJO/A'}</span>}
              </span>
              <span style={{ fontSize: 12, fontWeight: 800, color: entered ? TEXT2 : '#B45309' }}>{entered ? 'Dentro ✅' : 'Pendiente ⏳'}</span>
            </label>
          ))}
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <SlideToCheckIn
          onComplete={onSlide} busy={busy}
          disabled={selectedIds.size === 0}
          label={selectedIds.size > 1 ? `Desliza para entregar ${selectedIds.size} tickets` : 'Desliza para entregar ticket'}
        />
        {error && <p style={{ margin: '12px 0 0', textAlign: 'center', fontSize: 13, fontWeight: 600, color: '#B91C1C' }}>{error}</p>}
      </div>

      <button onClick={onShowAll}
        style={{ alignSelf: 'center', background: 'none', border: 'none', color: TEXT2, fontSize: 13, textDecoration: 'underline', cursor: 'pointer', minHeight: 'auto', padding: 8 }}>
        Ver todas mis entradas
      </button>
    </div>
  )
}

// ─── Modo Puerta: pantalla verde legible a 2 metros ──────────────────────────────────────
function DoorSuccess({ name, eventTitle, at, onClose, guestsIn = [], pendingGuests = 0, onManageGuests }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 90, background: SUCCESS_GREEN, color: WHITE, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 'calc(24px + env(safe-area-inset-top)) 20px calc(24px + env(safe-area-inset-bottom))', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <button onClick={onClose}
        style={{ position: 'absolute', top: 'calc(14px + env(safe-area-inset-top))', left: 14, display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(0,0,0,0.18)', border: 'none', borderRadius: 12, padding: '10px 14px 10px 8px', color: WHITE, fontSize: 14, fontWeight: 700, cursor: 'pointer', minHeight: 'auto' }}>
        <ChevronLeft size={18} /> Volver
      </button>

      <div style={{ fontSize: 'clamp(120px, 38vw, 220px)', lineHeight: 1 }} role="img" aria-label="Entrada validada">✅</div>
      <p style={{ margin: 'clamp(12px, 3vh, 28px) 0 0', fontSize: 'clamp(2.4rem, 12vw, 4.2rem)', fontWeight: 900, lineHeight: 1.05, letterSpacing: '-0.02em', wordBreak: 'break-word' }}>
        {name}
      </p>
      <p style={{ margin: 'clamp(10px, 2.5vh, 22px) 0 0', fontSize: 'clamp(1.6rem, 8vw, 2.6rem)', fontWeight: 800, lineHeight: 1.15, opacity: 0.95, wordBreak: 'break-word' }}>
        {eventTitle}
      </p>
      {guestsIn.length > 0 && (
        <p style={{ margin: 'clamp(10px, 2.5vh, 22px) 0 0', fontSize: 'clamp(1.1rem, 5.5vw, 1.8rem)', fontWeight: 700, opacity: 0.95 }}>
          Con: {guestsIn.join(', ')}
        </p>
      )}
      {pendingGuests > 0 && (
        <button onClick={onManageGuests}
          style={{ marginTop: 'clamp(16px, 4vh, 36px)', background: WHITE, color: '#15803d', border: 'none', borderRadius: 16, padding: '16px 22px', fontSize: 18, fontWeight: 800, cursor: 'pointer', minHeight: 'auto', boxShadow: '0 6px 18px rgba(0,0,0,0.2)' }}>
          Entregar tickets de mis invitados ({pendingGuests})
        </button>
      )}
      <p style={{ position: 'absolute', bottom: 'calc(18px + env(safe-area-inset-bottom))', margin: 0, fontSize: 14, fontWeight: 700, opacity: 0.85 }}>
        {at ? `Entrada registrada a las ${at} · ` : ''}<LiveClock />
      </p>
    </div>
  )
}

export default function UserWallet({ events, onClose }) {
  const { user, fallero } = useAuth()
  const myName = fallero
    ? `${fallero.nombre} ${fallero.apellidos ?? ''}`.trim()
    : (user?.email?.split('@')[0] ?? 'Fallero')

  const [paidByMe,      setPaidByMe]      = useState([])
  const [paidForMe,     setPaidForMe]     = useState([])
  const [loadingA,      setLoadingA]      = useState(true)
  const [loadingB,      setLoadingB]      = useState(true)

  useEffect(() => {
    if (!user?.uid) return
    const col = collection(db, 'inscripciones')
    const unsubA = onSnapshot(query(col, where('uid', '==', user.uid)),
      s => { setPaidByMe(s.docs.map(d => ({ id: d.id, ...d.data() }))); setLoadingA(false) },
      () => setLoadingA(false))
    const unsubB = onSnapshot(query(col, where('beneficiariosUids', 'array-contains', user.uid)),
      s => { setPaidForMe(s.docs.map(d => ({ id: d.id, ...d.data() }))); setLoadingB(false) },
      () => setLoadingB(false))
    return () => { unsubA(); unsubB() }
  }, [user?.uid])

  const [startOfToday] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() })
  const [showAll,   setShowAll]   = useState(false)    // forzar la lista normal aunque haya evento hoy
  const [pickedId,  setPickedId]  = useState(null)     // varios eventos hoy: cuál se muestra
  const [slideBusy, setSlideBusy] = useState(false)
  const [slideErr,  setSlideErr]  = useState('')
  const [skipIds,   setSkipIds]   = useState(() => new Set())   // desmarcados en el checklist
  const [manageGuests, setManageGuests] = useState(false)       // yo ya entré: entregar tickets de invitados
  const eventsById = useMemo(() => new Map(events.map(e => [e.id, e])), [events])

  // Sólo entradas pagadas de eventos de hoy en adelante. Si pagué yo → soy pagador.
  const tickets = useMemo(() => {
    const byId = new Map()
    for (const i of paidForMe) byId.set(i.id, { ins: i, isPayer: false })
    for (const i of paidByMe)  byId.set(i.id, { ins: i, isPayer: true })
    return [...byId.values()]
      .filter(({ ins }) => ins.pagado === true && !ins.esManual)
      .map(t => ({ ...t, event: eventsById.get(t.ins.eventId) }))
      .filter(t => { const d = toDate(t.event?.fecha); return d && d.getTime() >= startOfToday })
      .sort((a, b) => toDate(a.event.fecha) - toDate(b.event.fecha))
  }, [paidByMe, paidForMe, eventsById, startOfToday])

  // Fast Track: eventos pagados cuya fecha es HOY
  const todays = useMemo(() => tickets.filter(t => {
    const d = toDate(t.event.fecha)
    return d.getTime() >= startOfToday && d.getTime() < startOfToday + 86400000
  }), [tickets, startOfToday])

  const stateOf = (t) => getCheckInState(t.ins, user.uid)
  // Por defecto: el elegido; si no, el primero de hoy que aún no ha entrado; si todos entraron, el primero.
  const current = todays.find(t => t.ins.id === pickedId)
    ?? todays.find(t => !stateOf(t).entered)
    ?? todays[0] ?? null

  const loading = loadingA || loadingB

  // Grupo del Fast Track: yo + (si soy el titular) mis invitados sin app, con su estado de entrada.
  const myPerson = current ? getPersons(current.ins).find(p => p.id === user.uid || p.appUid === user.uid) : null
  const group = useMemo(() => {
    if (!current) return []
    const rows = []
    if (myPerson) rows.push({ person: myPerson, isMe: true, entered: getCheckInState(current.ins, myPerson.id).entered })
    if (current.isPayer) {
      for (const p of getDelegatedPersons(current.ins)) {
        rows.push({ person: p, isMe: false, entered: getCheckInState(current.ins, p.id).entered })
      }
    }
    return rows
  }, [current, myPerson])
  const pendingGroup = group.filter(r => !r.entered)
  const selectedIds  = new Set(pendingGroup.filter(r => !skipIds.has(r.person.id)).map(r => r.person.id))
  const toggleSelected = (id) => setSkipIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  // Entrega del ticket: marca mi entrada y/o la de mis invitados seleccionados (una transacción).
  const handleSlide = async () => {
    if (!current || slideBusy) return
    const persons = pendingGroup.filter(r => selectedIds.has(r.person.id)).map(r => r.person)
    if (!persons.length) { setSlideErr(myPerson ? 'Selecciona a quién entregas el ticket.' : 'No apareces en esta inscripción. Habla con la directiva.'); return }
    setSlideBusy(true); setSlideErr('')
    try {
      await markCheckInGroup(current.ins.id, persons)
      setSkipIds(new Set())
    } catch (err) {
      const msg = err?.message ?? ''
      setSlideErr(/permission|PERMISSION/.test(msg) || err?.code === 'permission-denied'
        ? 'No se pudo entregar el ticket. Acércate a la directiva en la puerta.'
        : (msg || 'No se pudo entregar el ticket. Inténtalo de nuevo.'))
    } finally { setSlideBusy(false) }
  }

  // Modo Puerta: yo ya he entrado hoy → pantalla verde gigante (salvo que esté entregando tickets de invitados)
  const myEntered     = !!current && !!myPerson && getCheckInState(current.ins, myPerson.id).entered
  const pendingGuests = group.filter(r => !r.isMe && !r.entered).length
  if (!loading && !showAll && current && myEntered && (pendingGuests === 0 || !manageGuests)) {
    const at = toDate(getCheckInState(current.ins, myPerson.id).at)
    return (
      <DoorSuccess
        name={myName}
        eventTitle={current.event?.titulo ?? current.ins.eventoTitulo}
        at={at ? fmtHour(at) : null}
        onClose={onClose}
        guestsIn={group.filter(r => !r.isMe && r.entered).map(r => r.person.nombre)}
        pendingGuests={pendingGuests}
        onManageGuests={() => { setManageGuests(true); setSkipIds(new Set()) }}
      />
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: BG, overflowY: 'auto', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 2, background: 'rgba(249,250,251,0.96)', backdropFilter: 'blur(20px)', borderBottom: `1px solid ${BORDER}`, padding: 'calc(12px + env(safe-area-inset-top)) 20px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onClose}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: `${GOLD}14`, border: `1px solid ${GOLD}40`, borderRadius: 10, padding: '8px 12px', color: GOLD, fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 'auto' }}>
          <ChevronLeft size={17} /> Volver
        </button>
        <div>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: TEXT }}>Mis entradas</p>
          <p style={{ margin: 0, fontSize: 11, color: MUTED }}>Enseña esta pantalla en la puerta</p>
        </div>
      </header>

      <div style={{ padding: '20px 20px 40px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {loading ? (
          <p style={{ textAlign: 'center', color: MUTED, fontSize: 14, padding: '40px 0' }}>Cargando…</p>
        ) : !showAll && current ? (
          <FastTrack
            event={current.event} ins={current.ins}
            busy={slideBusy} error={slideErr}
            onSlide={handleSlide} onShowAll={() => setShowAll(true)}
            others={todays} onPick={id => { setPickedId(id); setSlideErr(''); setSkipIds(new Set()); setManageGuests(false) }}
            group={group} selectedIds={selectedIds} onToggle={toggleSelected} myName={myName}
          />
        ) : tickets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 16px', background: WHITE, border: `1.5px solid ${BORDER}`, borderRadius: 20 }}>
            <div style={{ fontSize: 38, marginBottom: 10 }}>🎟️</div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: TEXT }}>No tienes entradas pagadas para próximos eventos</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: MUTED }}>Aquí aparecerán los eventos que hayas pagado tú o que te haya pagado un familiar.</p>
          </div>
        ) : tickets.map(({ ins, event, isPayer }) => (
          <Ticket key={ins.id} ins={ins} event={event} isPayer={isPayer} holderName={myName} myUid={user.uid} />
        ))}
      </div>
    </div>
  )
}
