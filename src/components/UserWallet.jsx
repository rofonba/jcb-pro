import { useState, useEffect, useMemo } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { ChevronLeft, MapPin } from 'lucide-react'
import { getPersons, getCheckInState } from '../utils/checkIn'

const GOLD   = '#D4AF37'
const BG     = '#F9FAFB'
const WHITE  = '#FFFFFF'
const TEXT   = '#111827'
const TEXT2  = '#6B7280'
const MUTED  = '#9CA3AF'
const BORDER = '#E5E7EB'
const GREEN  = '#10b981'
const BLUE   = '#2563EB'

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

  const [now] = useState(() => Date.now())
  const eventsById = useMemo(() => new Map(events.map(e => [e.id, e])), [events])

  // Sólo entradas pagadas de eventos futuros. Si pagué yo → soy pagador.
  const tickets = useMemo(() => {
    const byId = new Map()
    for (const i of paidForMe) byId.set(i.id, { ins: i, isPayer: false })
    for (const i of paidByMe)  byId.set(i.id, { ins: i, isPayer: true })
    return [...byId.values()]
      .filter(({ ins }) => ins.pagado === true && !ins.esManual)
      .map(t => ({ ...t, event: eventsById.get(t.ins.eventId) }))
      .filter(t => { const d = toDate(t.event?.fecha); return d && d.getTime() > now })
      .sort((a, b) => toDate(a.event.fecha) - toDate(b.event.fecha))
  }, [paidByMe, paidForMe, eventsById, now])

  const loading = loadingA || loadingB

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
