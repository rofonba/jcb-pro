import { useState, useEffect, useMemo } from 'react'
import { collection, getDocs, query, where, onSnapshot, writeBatch, doc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { ChevronLeft, Search, Loader2, DoorOpen, User } from 'lucide-react'
import { getPersons, getCheckInState, markCheckIn } from '../utils/checkIn'
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

const norm = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const toDate = f => (f?.toDate ? f.toDate() : f ? new Date(f) : null)
const fmtDate = d => d ? d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : ''
const fullName = f => `${f.nombre ?? ''} ${f.apellidos ?? ''}`.trim()

// Panel global (centrado en la persona, no en el evento). Sólo admin/directiva.
export default function AdminPanelControl({ events, onClose }) {
  const { fallero: me } = useAuth()
  const isStaff = me?.rol === 'admin' || me?.rol === 'directiva'

  const [falleros,  setFalleros]  = useState([])
  const [loadingF,  setLoadingF]  = useState(true)
  const [search,    setSearch]    = useState('')
  const [selected,  setSelected]  = useState(null)   // { id, nombre }
  const [own,       setOwn]       = useState([])     // inscripciones donde él es el titular
  const [forHim,    setForHim]    = useState([])     // inscripciones pagadas por otro que le incluyen
  const [loadingI,  setLoadingI]  = useState(false)
  const [busyId,    setBusyId]    = useState(null)
  const [error,     setError]     = useState('')
  const [migrating, setMigrating]   = useState(false)
  const [migrateMsg, setMigrateMsg] = useState('')
  const [today]                   = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() })

  useEffect(() => {
    if (!isStaff) return
    getDocs(collection(db, 'falleros'))
      .then(snap => setFalleros(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => setError('No se pudo cargar la lista de falleros.'))
      .finally(() => setLoadingF(false))
  }, [isStaff])

  // Inscripciones del fallero seleccionado, en vivo (el check-in se refleja al instante).
  // Se limpian al seleccionar/volver (en los handlers), no dentro del efecto.
  useEffect(() => {
    if (!selected) return
    const col = collection(db, 'inscripciones')
    const unsubA = onSnapshot(query(col, where('uid', '==', selected.id)),
      s => { setOwn(s.docs.map(d => ({ id: d.id, ...d.data() }))); setLoadingI(false) },
      () => setLoadingI(false))
    const unsubB = onSnapshot(query(col, where('beneficiariosUids', 'array-contains', selected.id)),
      s => setForHim(s.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => {})
    return () => { unsubA(); unsubB() }
  }, [selected])

  // Migración inicial: copia todos los falleros actuales a `directorio` (reducido). Idempotente.
  const migrateDirectorio = async () => {
    if (migrating) return
    if (!window.confirm(`Se copiarán ${falleros.length} falleros al directorio (sólo nombre, apellidos, nº y hijos). ¿Continuar?`)) return
    setMigrating(true); setMigrateMsg(''); setError('')
    try {
      for (let i = 0; i < falleros.length; i += 400) {
        const batch = writeBatch(db)
        for (const f of falleros.slice(i, i + 400)) {
          batch.set(doc(db, 'directorio', f.id), buildDirectorioEntry(f.id, f))
        }
        await batch.commit()
      }
      setMigrateMsg(`✅ Directorio actualizado: ${falleros.length} falleros copiados.`)
    } catch (err) {
      setError(err?.message || 'Error en la migración del directorio.')
    } finally { setMigrating(false) }
  }

  const select = (f) => { setError(''); setOwn([]); setForHim([]); setLoadingI(true); setSelected({ id: f.id, nombre: fullName(f) }) }
  const back   = () => { setSelected(null); setOwn([]); setForHim([]) }

  const results = useMemo(() => {
    const q = norm(search.trim())
    if (!q) return []
    return falleros.filter(f => norm(fullName(f)).includes(q)).slice(0, 25)
  }, [falleros, search])

  const eventsById = useMemo(() => new Map(events.map(e => [e.id, e])), [events])

  // Una fila por evento. Si es titular y también beneficiario, prevalece su propia inscripción.
  const rows = useMemo(() => {
    if (!selected) return []
    const byId = new Map()
    for (const i of forHim) if (!i.esManual) byId.set(i.id, { ins: i, isPayer: false })
    for (const i of own)    if (!i.esManual) byId.set(i.id, { ins: i, isPayer: true })
    return [...byId.values()].map(({ ins, isPayer }) => {
      const event  = eventsById.get(ins.eventId)
      const person = getPersons(ins).find(p => p.id === selected.id || p.appUid === selected.id)
      const date   = toDate(event?.fecha)
      return {
        ins, isPayer, event, person, date,
        paid:    ins.pagado === true,
        pending: isPendingPayment(ins),
        valid:   !!event && !!date && date.getTime() >= today,   // evento existente y no pasado
        state:   person ? getCheckInState(ins, person.id) : { entered: false, at: null },
      }
    }).sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))
  }, [selected, own, forHim, eventsById, today])

  const handleCheckIn = async (row) => {
    setBusyId(row.ins.id); setError('')
    try { await markCheckIn(row.ins.id, row.person) }
    catch (err) { setError(err?.message || 'No se pudo registrar la entrada.') }
    finally { setBusyId(null) }
  }

  if (!isStaff) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 85, background: BG, overflowY: 'auto', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 2, background: 'rgba(249,250,251,0.96)', backdropFilter: 'blur(20px)', borderBottom: `1px solid ${BORDER}`, padding: 'calc(12px + env(safe-area-inset-top)) 20px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={selected ? back : onClose}
          style={{ display: 'flex', alignItems: 'center', gap: 4, background: `${GOLD}14`, border: `1px solid ${GOLD}40`, borderRadius: 10, padding: '8px 12px 8px 8px', color: GOLD, fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 'auto' }}>
          <ChevronLeft size={17} /> {selected ? 'Buscar' : 'Volver'}
        </button>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: TEXT }}>Panel de Control</p>
          <p style={{ margin: 0, fontSize: 11, color: MUTED, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
            {selected ? selected.nombre : 'Gestión por fallero · sólo directiva'}
          </p>
        </div>
      </header>

      <div style={{ padding: '18px 20px 40px' }}>
        {error && (
          <div style={{ padding: '10px 14px', marginBottom: 14, background: 'rgba(206,17,38,0.08)', border: '1px solid rgba(206,17,38,0.25)', borderRadius: 12, color: '#B91C1C', fontSize: 13 }}>{error}</div>
        )}

        {!selected ? (
          <>
            <div style={{ position: 'relative', marginBottom: 14 }}>
              <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: MUTED }} />
              <input
                autoFocus value={search} onChange={e => setSearch(e.target.value)}
                placeholder={loadingF ? 'Cargando falleros…' : 'Buscar fallero por nombre…'}
                style={{ width: '100%', boxSizing: 'border-box', padding: '14px 14px 14px 40px', background: WHITE, border: `1.5px solid ${BORDER}`, borderRadius: 14, fontSize: 15, color: TEXT, outline: 'none', fontFamily: 'inherit' }}
              />
            </div>
            {!loadingF && !search.trim() && (
              <div style={{ margin: '4px 0 14px', padding: '12px 14px', background: WHITE, border: `1.5px dashed ${BORDER}`, borderRadius: 14 }}>
                <p style={{ margin: '0 0 8px', fontSize: 12, color: TEXT2 }}>
                  🔧 Mantenimiento · copia los falleros actuales al directorio público del buscador (sólo nombre, apellidos, nº y hijos).
                </p>
                <button onClick={migrateDirectorio} disabled={migrating || falleros.length === 0}
                  style={{ padding: '9px 14px', background: `${GOLD}14`, border: `1px solid ${GOLD}55`, borderRadius: 10, color: GOLD, fontSize: 12, fontWeight: 700, cursor: migrating ? 'not-allowed' : 'pointer', minHeight: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {migrating ? <Loader2 size={13} style={{ animation: 'falla-spin 0.8s linear infinite' }} /> : null}
                  Migración inicial del directorio
                </button>
                {migrateMsg && <p style={{ margin: '8px 0 0', fontSize: 12, color: GREEN, fontWeight: 600 }}>{migrateMsg}</p>}
              </div>
            )}
            {loadingF ? (
              <p style={{ textAlign: 'center', color: MUTED, padding: '30px 0' }}><Loader2 size={20} style={{ animation: 'falla-spin 0.8s linear infinite' }} /></p>
            ) : !search.trim() ? (
              <p style={{ textAlign: 'center', color: MUTED, fontSize: 13, padding: '30px 0' }}>Escribe un nombre para ver sus eventos y hacerle el check-in.</p>
            ) : results.length === 0 ? (
              <p style={{ textAlign: 'center', color: MUTED, fontSize: 13, padding: '30px 0' }}>Ningún fallero coincide con «{search}»</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {results.map(f => (
                  <button key={f.id} onClick={() => select(f)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: WHITE, border: `1.5px solid ${BORDER}`, borderRadius: 14, cursor: 'pointer', textAlign: 'left', minHeight: 'auto' }}>
                    <div style={{ width: 38, height: 38, borderRadius: 11, background: `${GOLD}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <User size={18} color={GOLD} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{fullName(f)}</div>
                      {f.numeroFallero != null && <div style={{ fontSize: 11, color: MUTED }}>Nº {String(f.numeroFallero).padStart(3, '0')}</div>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : loadingI ? (
          <p style={{ textAlign: 'center', color: MUTED, padding: '40px 0' }}><Loader2 size={20} style={{ animation: 'falla-spin 0.8s linear infinite' }} /></p>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 16px', background: WHITE, border: `1.5px solid ${BORDER}`, borderRadius: 20 }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>📭</div>
            <p style={{ margin: 0, fontSize: 14, color: TEXT2 }}>{selected.nombre} no está apuntado a ningún evento</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {rows.map(({ ins, isPayer, event, person, date, paid, pending, valid, state }) => {
              const busy = busyId === ins.id
              const hora = toDate(state.at)?.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
              return (
                <div key={ins.id} style={{ background: WHITE, border: `1.5px solid ${state.entered ? `${GREEN}55` : BORDER}`, borderRadius: 18, padding: '14px 16px' }}>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: TEXT }}>{event?.titulo ?? ins.eventoTitulo ?? 'Evento eliminado'}</p>
                  <p style={{ margin: '2px 0 8px', fontSize: 12, color: TEXT2, textTransform: 'capitalize' }}>{fmtDate(date)}</p>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 800, background: paid ? `${GREEN}18` : '#FEF3C7', color: paid ? GREEN : AMBER, border: `1px solid ${paid ? `${GREEN}45` : '#FCD34D'}` }}>
                      {paid ? '✅ Pagado' : pending ? '⏳ Pendiente' : '⏳ Pendiente de pago'}
                    </span>
                    {!isPayer && <span style={{ fontSize: 11, color: TEXT2 }}>Pagado por {ins.nombre}</span>}
                  </div>

                  {!paid ? (
                    <p style={{ margin: 0, fontSize: 12, color: MUTED }}>Sin pago confirmado: no puede hacer check-in.</p>
                  ) : !person ? (
                    <p style={{ margin: 0, fontSize: 12, color: MUTED }}>No se encuentra a la persona en esta inscripción.</p>
                  ) : state.entered ? (
                    <div style={{ padding: '12px', textAlign: 'center', background: '#F3F4F6', borderRadius: 12, fontSize: 14, fontWeight: 800, color: TEXT2 }}>
                      🚪 Ya ha entrado{hora ? ` · ${hora}` : ''}
                    </div>
                  ) : !valid ? (
                    <div style={{ padding: '12px', textAlign: 'center', background: '#F3F4F6', borderRadius: 12, fontSize: 13, fontWeight: 700, color: MUTED }}>
                      {event ? 'Evento pasado: check-in no disponible' : 'El evento ya no existe'}
                    </div>
                  ) : (
                    <button onClick={() => handleCheckIn({ ins, person })} disabled={busy}
                      style={{ width: '100%', minHeight: 56, background: busy ? `${GREEN}80` : `linear-gradient(135deg, ${GREEN}, #059669)`, border: 'none', borderRadius: 14, color: WHITE, fontSize: 17, fontWeight: 800, cursor: busy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: busy ? 'none' : '0 6px 18px rgba(16,185,129,0.3)' }}>
                      {busy ? <Loader2 size={20} style={{ animation: 'falla-spin 0.8s linear infinite' }} /> : <><DoorOpen size={20} /> Hacer Check-in</>}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
