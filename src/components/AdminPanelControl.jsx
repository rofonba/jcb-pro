import { useState, useEffect, useMemo } from 'react'
import { collection, getDocs, onSnapshot, writeBatch, doc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { ChevronLeft, Search, Loader2, DoorOpen, CalendarDays, ChevronRight } from 'lucide-react'
import { getPersons, getCheckInState, markCheckIn, undoCheckIn, isExternalPerson } from '../utils/checkIn'
import { isPendingPayment } from '../utils/inscripciones'
import { buildDirectorioEntry } from '../utils/directorio'

const GOLD   = '#D4AF37'
const BG     = '#F9FAFB'
const WHITE  = '#FFFFFF'
const TEXT   = '#111827'
const TEXT2  = '#6B7280'
const MUTED  = '#9CA3AF'
const BORDER = '#E5E7EB'
const GREEN  = '#10b981'
const AMBER  = '#B45309'
const BLUE   = '#2563EB'
const ORANGE = '#EA580C'

const norm = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const toDate = f => (f?.toDate ? f.toDate() : f ? new Date(f) : null)
const fmtDate = d => d ? d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : ''
const fmtHour = d => d ? d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : ''

// ¿Cuenta como inscrita? Nunca las pendientes de pago. En eventos con cobro online, sólo las PAGADAS
// (confirmadas por el webhook de Stripe); en gratuitos o con pago en el casal, todas las demás.
const isEligible = (ins, event) => !isPendingPayment(ins) && (event?.pagoApp !== true || ins.pagado === true)

// Personas (titular + acompañantes) de las inscripciones elegibles de un evento
function peopleOf(inscriptions, event) {
  return inscriptions
    .filter(ins => isEligible(ins, event))
    .flatMap(ins => getPersons(ins).map(person => ({
      key: `${ins.id}:${person.id}`, ins, person,
      external: isExternalPerson(person, ins),
      ...getCheckInState(ins, person.id),
    })))
}

function Metric({ label, value, color }) {
  return (
    <div style={{ flex: 1, textAlign: 'center', padding: '14px 6px', background: WHITE, border: `1.5px solid ${color}40`, borderRadius: 16 }}>
      <div style={{ fontSize: 32, fontWeight: 900, color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ marginTop: 5, fontSize: 10, fontWeight: 800, color: TEXT2, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</div>
    </div>
  )
}

// ─── Detalle de un evento: métricas en vivo + lista de asistentes ──────────────────────────
function EventDetail({ event, inscriptions }) {
  const [search, setSearch] = useState('')
  const [busyKey, setBusyKey] = useState(null)
  const [error, setError] = useState('')

  const people = useMemo(() => peopleOf(inscriptions, event), [inscriptions, event])
  const total     = people.length
  const entered   = people.filter(p => p.entered).length
  const pendiente = total - entered

  const rows = useMemo(() => {
    const q = norm(search.trim())
    const list = q
      ? people.filter(p => norm(p.person.nombre).includes(q) || norm(p.ins.nombre).includes(q))
      : people
    return [...list].sort((a, b) => a.person.nombre.localeCompare(b.person.nombre, 'es'))
  }, [people, search])
  const internos = rows.filter(r => !r.external)
  const externos = rows.filter(r => r.external)

  const act = async (row, fn) => {
    setBusyKey(row.key); setError('')
    try { await fn() } catch (err) { setError(err?.message || 'No se pudo completar la acción.') }
    finally { setBusyKey(null) }
  }

  const renderRow = (row) => {
    const { key, ins, person, external, entered: isIn, at } = row
    const busy = busyKey === key
    const accent = external ? ORANGE : BLUE
    const hora = fmtHour(toDate(at))
    const sub = ins.esManual
      ? 'Inscripción manual (directiva)'
      : person.isPayer
        ? `Titular${ins.pagado && ins.totalConComision != null ? ` · pagó ${Number(ins.totalConComision).toFixed(2)} €` : ''}`
        : external ? `Invitado de ${ins.nombre}` : `Incluido por ${ins.nombre}`
    return (
      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 12px 12px 14px', background: isIn ? '#F3F4F6' : WHITE, border: `1.5px solid ${isIn ? `${GREEN}55` : BORDER}`, borderLeft: `6px solid ${accent}`, borderRadius: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: TEXT, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{person.nombre}</span>
            <span style={{ flexShrink: 0, padding: '2px 8px', borderRadius: 20, fontSize: 9, fontWeight: 900, letterSpacing: '0.08em', color: accent, background: `${accent}18`, border: `1px solid ${accent}45` }}>
              {external ? '🎟️ EXTERNO' : '🏠 INTERNO'}
            </span>
          </div>
          <div style={{ fontSize: 11, color: TEXT2, marginTop: 2 }}>{sub}</div>
        </div>
        {isIn ? (
          <div style={{ flexShrink: 0, textAlign: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: GREEN }}>🚪 Dentro{hora ? ` · ${hora}` : ''}</div>
            <button onClick={() => { if (window.confirm(`¿Anular la entrada de ${person.nombre}?`)) act(row, () => undoCheckIn(ins.id, person)) }}
              disabled={busy}
              style={{ background: 'none', border: 'none', color: MUTED, fontSize: 10, textDecoration: 'underline', cursor: 'pointer', padding: 0, minHeight: 'auto', minWidth: 'auto' }}>
              ↩ Deshacer
            </button>
          </div>
        ) : (
          <button onClick={() => act(row, () => markCheckIn(ins.id, person))} disabled={busy}
            style={{ flexShrink: 0, minHeight: 46, padding: '0 14px', background: busy ? `${GREEN}80` : `linear-gradient(135deg, ${GREEN}, #059669)`, border: 'none', borderRadius: 12, color: WHITE, fontSize: 13, fontWeight: 800, cursor: busy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            {busy ? <Loader2 size={15} style={{ animation: 'falla-spin 0.8s linear infinite' }} /> : <><DoorOpen size={16} /> Check-in</>}
          </button>
        )}
      </div>
    )
  }

  const section = (title, color, list) => (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 8px', padding: '6px 12px', background: `${color}12`, borderRadius: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 900, color, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{title}</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 800, color }}>
          {list.filter(r => r.entered).length}/{list.length}
        </span>
      </div>
      {list.length === 0
        ? <p style={{ margin: '0 0 4px', fontSize: 12, color: MUTED, paddingLeft: 4 }}>Ninguno</p>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{list.map(renderRow)}</div>}
    </div>
  )

  return (
    <div style={{ padding: '16px 20px 40px' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <Metric label="Inscritos" value={total} color={BLUE} />
        <Metric label="Check-in" value={entered} color={GREEN} />
        <Metric label="Pendientes" value={pendiente} color={AMBER} />
      </div>

      <div style={{ position: 'relative', marginBottom: 14 }}>
        <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: MUTED }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar asistente…"
          style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px 12px 40px', background: WHITE, border: `1.5px solid ${BORDER}`, borderRadius: 14, fontSize: 15, color: TEXT, outline: 'none', fontFamily: 'inherit' }} />
      </div>

      {error && <div style={{ padding: '10px 14px', marginBottom: 14, background: 'rgba(206,17,38,0.08)', border: '1px solid rgba(206,17,38,0.25)', borderRadius: 12, color: '#B91C1C', fontSize: 13 }}>{error}</div>}

      {total === 0 ? (
        <div style={{ textAlign: 'center', padding: '36px 16px', background: WHITE, border: `1.5px solid ${BORDER}`, borderRadius: 20 }}>
          <div style={{ fontSize: 34, marginBottom: 8 }}>📭</div>
          <p style={{ margin: 0, fontSize: 14, color: TEXT2 }}>
            {event.pagoApp === true ? 'Nadie ha pagado este evento todavía' : 'Nadie inscrito todavía'}
          </p>
        </div>
      ) : (
        <>
          {section('Internos · falleros e hijos', BLUE, internos)}
          {section('Externos · invitados', ORANGE, externos)}
        </>
      )}
    </div>
  )
}

// ─── Control de Accesos (sólo admin/directiva) ──────────────────────────────────────────
export default function AdminPanelControl({ events, onClose }) {
  const { fallero: me } = useAuth()
  const isStaff = me?.rol === 'admin' || me?.rol === 'directiva'

  const [all,       setAll]       = useState([])      // todas las inscripciones, en vivo
  const [loading,   setLoading]   = useState(true)
  const [eventId,   setEventId]   = useState(null)
  const [migrating, setMigrating] = useState(false)
  const [migrateMsg, setMigrateMsg] = useState('')
  const [error,     setError]     = useState('')
  const [startOfToday] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() })

  useEffect(() => {
    if (!isStaff) return
    return onSnapshot(collection(db, 'inscripciones'),
      s => { setAll(s.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false) },
      () => { setError('No se pudieron cargar las inscripciones.'); setLoading(false) })
  }, [isStaff])

  // Eventos activos/próximos (hoy en adelante), sin festivos
  const upcoming = useMemo(() => events
    .filter(ev => ev.tipo !== 'festivo' && toDate(ev.fecha)?.getTime() >= startOfToday)
    .sort((a, b) => toDate(a.fecha) - toDate(b.fecha)), [events, startOfToday])

  const insByEvent = useMemo(() => {
    const m = new Map()
    for (const i of all) { if (i.eventId) (m.get(i.eventId) ?? m.set(i.eventId, []).get(i.eventId)).push(i) }
    return m
  }, [all])

  const selected = eventId ? events.find(e => e.id === eventId) : null

  // Migración inicial del directorio (idempotente). Lee los falleros sólo al pulsar.
  const migrateDirectorio = async () => {
    if (migrating) return
    if (!window.confirm('Se copiarán todos los falleros al directorio del buscador (nombre, apellidos, nº, fecha de nacimiento e hijos). ¿Continuar?')) return
    setMigrating(true); setMigrateMsg(''); setError('')
    try {
      const snap = await getDocs(collection(db, 'falleros'))
      const falleros = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      for (let i = 0; i < falleros.length; i += 400) {
        const batch = writeBatch(db)
        for (const f of falleros.slice(i, i + 400)) batch.set(doc(db, 'directorio', f.id), buildDirectorioEntry(f.id, f))
        await batch.commit()
      }
      setMigrateMsg(`✅ Directorio actualizado: ${falleros.length} falleros copiados.`)
    } catch (err) {
      setError(err?.message || 'Error en la migración del directorio.')
    } finally { setMigrating(false) }
  }

  if (!isStaff) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 85, background: BG, overflowY: 'auto', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 2, background: 'rgba(249,250,251,0.96)', backdropFilter: 'blur(20px)', borderBottom: `1px solid ${BORDER}`, padding: 'calc(12px + env(safe-area-inset-top)) 20px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={selected ? () => setEventId(null) : onClose}
          style={{ display: 'flex', alignItems: 'center', gap: 4, background: `${GOLD}14`, border: `1px solid ${GOLD}40`, borderRadius: 10, padding: '8px 12px 8px 8px', color: GOLD, fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 'auto' }}>
          <ChevronLeft size={17} /> {selected ? 'Eventos' : 'Volver'}
        </button>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: TEXT, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
            {selected ? selected.titulo : 'Control de Accesos'}
          </p>
          <p style={{ margin: 0, fontSize: 11, color: MUTED, textTransform: selected ? 'capitalize' : 'none' }}>
            {selected ? fmtDate(toDate(selected.fecha)) : 'Elige un evento · sólo directiva'}
          </p>
        </div>
      </header>

      {selected ? (
        <EventDetail event={selected} inscriptions={insByEvent.get(selected.id) ?? []} />
      ) : (
        <div style={{ padding: '18px 20px 40px' }}>
          {error && <div style={{ padding: '10px 14px', marginBottom: 14, background: 'rgba(206,17,38,0.08)', border: '1px solid rgba(206,17,38,0.25)', borderRadius: 12, color: '#B91C1C', fontSize: 13 }}>{error}</div>}

          {loading ? (
            <p style={{ textAlign: 'center', color: MUTED, padding: '40px 0' }}><Loader2 size={20} style={{ animation: 'falla-spin 0.8s linear infinite' }} /></p>
          ) : upcoming.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 16px', background: WHITE, border: `1.5px solid ${BORDER}`, borderRadius: 20 }}>
              <div style={{ fontSize: 34, marginBottom: 8 }}>📅</div>
              <p style={{ margin: 0, fontSize: 14, color: TEXT2 }}>No hay eventos próximos</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {upcoming.map(ev => {
                const people = peopleOf(insByEvent.get(ev.id) ?? [], ev)
                const inCount = people.filter(p => p.entered).length
                const d = toDate(ev.fecha)
                const isToday = d.getTime() < startOfToday + 86400000
                return (
                  <button key={ev.id} onClick={() => setEventId(ev.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 14px', background: WHITE, border: `1.5px solid ${isToday ? `${GOLD}88` : BORDER}`, borderRadius: 18, cursor: 'pointer', textAlign: 'left', minHeight: 'auto' }}>
                    <div style={{ width: 44, height: 44, borderRadius: 13, background: `${GOLD}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <CalendarDays size={20} color={GOLD} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 15, fontWeight: 800, color: TEXT, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{ev.titulo}</span>
                        {isToday && <span style={{ flexShrink: 0, padding: '1px 7px', borderRadius: 20, fontSize: 9, fontWeight: 900, color: WHITE, background: GOLD }}>HOY</span>}
                      </div>
                      <div style={{ fontSize: 12, color: TEXT2, textTransform: 'capitalize' }}>{fmtDate(d)}{fmtHour(d) !== '00:00' ? ` · ${fmtHour(d)}` : ''}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 900, color: inCount === people.length && people.length > 0 ? GREEN : TEXT, fontVariantNumeric: 'tabular-nums' }}>{inCount}/{people.length}</div>
                      <div style={{ fontSize: 9, color: MUTED, fontWeight: 700, textTransform: 'uppercase' }}>dentro</div>
                    </div>
                    <ChevronRight size={16} color={MUTED} />
                  </button>
                )
              })}
            </div>
          )}

          <div style={{ margin: '26px 0 0', padding: '12px 14px', background: WHITE, border: `1.5px dashed ${BORDER}`, borderRadius: 14 }}>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: TEXT2 }}>
              🔧 Mantenimiento · copia los falleros actuales al directorio del buscador de acompañantes.
            </p>
            <button onClick={migrateDirectorio} disabled={migrating}
              style={{ padding: '9px 14px', background: `${GOLD}14`, border: `1px solid ${GOLD}55`, borderRadius: 10, color: GOLD, fontSize: 12, fontWeight: 700, cursor: migrating ? 'not-allowed' : 'pointer', minHeight: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {migrating && <Loader2 size={13} style={{ animation: 'falla-spin 0.8s linear infinite' }} />}
              Migración inicial del directorio
            </button>
            {migrateMsg && <p style={{ margin: '8px 0 0', fontSize: 12, color: GREEN, fontWeight: 600 }}>{migrateMsg}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
