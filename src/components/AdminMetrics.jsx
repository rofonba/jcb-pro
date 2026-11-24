import { useState, useEffect, useCallback } from 'react'
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore'
import { db } from '../firebase'
import { ChevronLeft, RefreshCw, Loader2, TrendingUp, BarChart2, Users, Cake, HeartHandshake, Bell } from 'lucide-react'

const GOLD   = '#D4AF37'
const WHITE  = '#FFFFFF'
const TEXT   = '#111827'
const TEXT2  = '#6B7280'
const MUTED  = '#9CA3AF'
const BORDER = '#F3F4F6'
const BG     = '#F9FAFB'
const INDIGO = '#6366f1'
const GREEN  = '#10b981'

const MEDALS = ['🥇', '🥈', '🥉']

// Ciclo fallero: 1 de abril → 31 de marzo. Reset automático cada 1 de abril.
function getFalleroYearStart(now = new Date()) {
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
  return new Date(year, 3, 1) // April 1 (month index 3)
}

function tsToDate(ts) {
  if (!ts) return null
  if (ts.toDate) return ts.toDate()
  const d = new Date(ts)
  return isNaN(d.getTime()) ? null : d
}

// ─── Edad ─────────────────────────────────────────────────────────────────────
// Misma regla que la tarifa (api/_lib/pricing.js): ≤ 14 años cumplidos → infantil.
const CHILD_MAX_AGE = 14
const YEAR_MS = 365.2425 * 24 * 3600 * 1000

// fechaNacimiento → Date (medianoche UTC) · acepta 'AAAA-MM-DD' (input date), 'DD/MM/AAAA' o Timestamp.
function parseBirth(raw) {
  if (!raw) return null
  if (raw.toDate) return raw.toDate()
  const s = String(raw).trim()
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]))
  return null
}

// Edad a día de hoy (Madrid). null si falta o no es plausible.
//   exact     → años con decimales (para la MEDIA)
//   completed → años cumplidos por calendario (para Mayor/Infantil: no falla el día del cumpleaños)
function ageInfo(raw, todayUtcMs) {
  const b = parseBirth(raw)
  if (!b || isNaN(b.getTime())) return null
  const exact = (todayUtcMs - b.getTime()) / YEAR_MS
  if (!(exact >= 0 && exact < 110)) return null
  const t = new Date(todayUtcMs)
  let completed = t.getUTCFullYear() - b.getUTCFullYear()
  if (t.getUTCMonth() < b.getUTCMonth() || (t.getUTCMonth() === b.getUTCMonth() && t.getUTCDate() < b.getUTCDate())) completed--
  return { exact, completed }
}

const mean = arr => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null)

// ─── Data fetcher ─────────────────────────────────────────────────────────────

async function fetchMetrics() {
  const [insSnap, fallerosSnap, pushSnap] = await Promise.all([
    getDocs(collection(db, 'inscripciones')),
    getDocs(collection(db, 'falleros')),
    // Historial de push (lo escribe /api/sendPush). Si las reglas aún no están desplegadas, no rompe el resto.
    getDocs(query(collection(db, 'push_logs'), orderBy('createdAt', 'desc'), limit(25))).catch(() => null),
  ])
  const pushLogs = pushSnap ? pushSnap.docs.map(d => ({ id: d.id, ...d.data() })) : []

  const inscriptions = insSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  const fallerosList = fallerosSnap.docs.map(d => ({ id: d.id, ...d.data() }))

  // 1. Top 3 falleros — ranking del ciclo fallero en curso (1-abr → 1-abr)
  const yearStart  = getFalleroYearStart()
  const yearStartMs = yearStart.getTime()
  const countByUid = {}
  const nameByUid  = {}
  for (const ins of inscriptions) {
    if (ins.esManual || ins.uid === 'manual') continue
    const created = tsToDate(ins.createdAt)
    if (!created || created.getTime() < yearStartMs) continue
    countByUid[ins.uid] = (countByUid[ins.uid] || 0) + 1
    if (!nameByUid[ins.uid]) nameByUid[ins.uid] = ins.nombre || '—'
  }
  const topFalleros = Object.entries(countByUid)
    .map(([uid, count]) => ({ uid, nombre: nameByUid[uid], count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)

  // 2. Event volume — usa totalPersonas para reflejar el aforo real
  //    (titular + acompañantes censo_app + censo_hijo + manuales validados).
  const volByEvent    = {}
  const titleByEvent  = {}
  const adultsByEvent = {}
  const ninosByEvent  = {}
  for (const ins of inscriptions) {
    const eid = ins.eventId
    if (!eid) continue
    const acompAdultos = Array.isArray(ins.acompañantesAdultos) ? ins.acompañantesAdultos.length : 0
    const acompNinos   = Array.isArray(ins.acompañantesNinos)   ? ins.acompañantesNinos.length   : 0
    // Total real: prefiere totalPersonas si existe, si no lo deriva
    const totalReal = ins.totalPersonas != null
      ? ins.totalPersonas
      : 1 + acompAdultos + acompNinos
    volByEvent[eid]   = (volByEvent[eid]   || 0) + totalReal
    titleByEvent[eid] = ins.eventoTitulo || eid
    adultsByEvent[eid] = (adultsByEvent[eid] || 0) + (ins.esHijo ? 0 : 1) + acompAdultos
    ninosByEvent[eid]  = (ninosByEvent[eid]  || 0) + (ins.esHijo ? 1 : 0) + acompNinos
  }
  const eventVolume = Object.entries(volByEvent)
    .map(([id, total]) => ({
      id,
      titulo:  titleByEvent[id],
      adultos: adultsByEvent[id] || 0,
      ninos:   ninosByEvent[id]  || 0,
      total,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)   // Top 5 eventos más populares

  // 3. Demographics from falleros collection
  const totalAdultos  = fallerosList.length
  const totalNinos    = fallerosList.reduce((sum, f) => sum + (Array.isArray(f.hijos) ? f.hijos.length : 0), 0)
  const totalPersonas = totalAdultos + totalNinos

  // 4. Edad media — falleros ACTIVOS (cuenta en la app) + sus hijos del censo, sólo con fecha válida.
  //    El Excel del censo no trae fecha de nacimiento: la fuente es falleros.fechaNacimiento y
  //    falleros.hijos[].fechaNacimiento (lo que cada fallero introduce en la app).
  const activos = fallerosList.filter(f => f.estaActivo !== false)
  const [ty, tm, td] = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }).split('-').map(Number)
  const todayUtcMs = Date.UTC(ty, tm - 1, td)
  const ages = []
  let personasTotal = 0
  for (const f of activos) {
    personasTotal++
    const a = ageInfo(f.fechaNacimiento, todayUtcMs)
    if (a) ages.push(a)
    for (const h of Array.isArray(f.hijos) ? f.hijos : []) {
      personasTotal++
      const ah = ageInfo(typeof h === 'object' ? h?.fechaNacimiento : null, todayUtcMs)
      if (ah) ages.push(ah)
    }
  }
  const mayores    = ages.filter(a => a.completed >  CHILD_MAX_AGE).map(a => a.exact)
  const infantiles = ages.filter(a => a.completed <= CHILD_MAX_AGE).map(a => a.exact)
  const edad = {
    media:         mean(ages.map(a => a.exact)),
    mediaMayor:    mean(mayores),
    mediaInfantil: mean(infantiles),
    nMayor: mayores.length, nInfantil: infantiles.length,
    conDato: ages.length, total: personasTotal,
  }

  // 5. Falleros con familiares — vínculo OFICIAL de la app: familiaUids, bidireccional (basta con que
  //    uno de los dos añada al otro, igual que useFamilia). Sólo cuentan vínculos entre activos.
  const activoIds = new Set(activos.map(f => f.id))
  const conFamilia = new Set()
  for (const f of activos) {
    for (const uid of Array.isArray(f.familiaUids) ? f.familiaUids : []) {
      if (uid !== f.id && activoIds.has(uid)) { conFamilia.add(f.id); conFamilia.add(uid) }
    }
  }
  const familia = {
    conFamilia: conFamilia.size,
    total:      activos.length,
    pct:        activos.length ? (conFamilia.size / activos.length) * 100 : null,
  }

  return { topFalleros, eventVolume, demographics: { totalAdultos, totalNinos, totalPersonas }, edad, familia, pushLogs, yearStart }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({ icon, title, children }) {
  return (
    <div style={{
      background: WHITE, borderRadius: 20, border: `1.5px solid ${BORDER}`,
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '16px 20px', borderBottom: `1px solid ${BORDER}`,
      }}>
        {icon}
        <span style={{ fontSize: 14, fontWeight: 700, color: TEXT, letterSpacing: '-0.01em' }}>
          {title}
        </span>
      </div>
      <div style={{ padding: '16px 20px' }}>{children}</div>
    </div>
  )
}

function StatPill({ value, color = GOLD }) {
  return (
    <span style={{
      display: 'inline-block', minWidth: 32,
      padding: '3px 10px',
      background: `${color}18`, border: `1px solid ${color}35`,
      borderRadius: 20, fontSize: 13, fontWeight: 800, color,
      textAlign: 'center',
    }}>
      {value}
    </span>
  )
}

function SkeletonLine({ width = '100%', height = 18 }) {
  return (
    <div style={{
      width, height, borderRadius: 8,
      background: '#E5E7EB',
      animation: 'falla-pulse 1.6s ease-in-out infinite',
    }} />
  )
}

// ─── Section: Top Falleros ────────────────────────────────────────────────────

function TopFalleros({ data }) {
  if (!data.length) return (
    <p style={{ fontSize: 13, color: MUTED, margin: 0, textAlign: 'center', padding: '12px 0' }}>
      Sin inscripciones registradas todavía.
    </p>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {data.map((f, i) => (
        <div
          key={f.uid}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 0',
            borderBottom: i < data.length - 1 ? `1px solid ${BORDER}` : 'none',
          }}
        >
          <span style={{ fontSize: i < 3 ? 18 : 13, width: 24, textAlign: 'center', flexShrink: 0, fontWeight: i >= 3 ? 700 : 'inherit', color: MUTED }}>
            {i < 3 ? MEDALS[i] : `${i + 1}`}
          </span>
          <span style={{
            flex: 1, fontSize: 14, fontWeight: i === 0 ? 700 : 500,
            color: i === 0 ? TEXT : TEXT2,
            overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
          }}>
            {f.nombre}
          </span>
          <StatPill value={f.count} color={i === 0 ? GOLD : i === 1 ? TEXT2 : MUTED} />
        </div>
      ))}
    </div>
  )
}

// ─── Section: Event Volume ────────────────────────────────────────────────────

function EventVolume({ data }) {
  if (!data.length) return (
    <p style={{ fontSize: 13, color: MUTED, margin: 0, textAlign: 'center', padding: '12px 0' }}>
      Sin eventos con inscripciones todavía.
    </p>
  )
  const maxTotal = data[0].total

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {data.map((ev, i) => {
        const pct = maxTotal > 0 ? (ev.total / maxTotal) * 100 : 0
        const isTop = i === 0
        return (
          <div key={ev.id}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5, gap: 8 }}>
              <span style={{
                flex: 1, fontSize: 13, fontWeight: isTop ? 700 : 500,
                color: isTop ? TEXT : TEXT2,
                overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
              }}>
                {ev.titulo}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: TEXT2 }}>
                  <span style={{ color: GOLD, fontWeight: 700 }}>{ev.adultos}</span> adultos
                </span>
                {ev.ninos > 0 && (
                  <span style={{ fontSize: 11, color: TEXT2 }}>
                    · <span style={{ color: INDIGO, fontWeight: 700 }}>{ev.ninos}</span> niños
                  </span>
                )}
                <StatPill value={ev.total} color={isTop ? GOLD : TEXT2} />
              </div>
            </div>
            {/* Bar */}
            <div style={{ background: BORDER, borderRadius: 4, height: 5, overflow: 'hidden' }}>
              <div style={{
                width: `${pct}%`, height: '100%', borderRadius: 4,
                background: isTop
                  ? `linear-gradient(90deg, ${GOLD}, #a07d1a)`
                  : `linear-gradient(90deg, ${TEXT2}60, ${MUTED}50)`,
                transition: 'width 0.6s ease',
              }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Section: Demographics ────────────────────────────────────────────────────

function Demographics({ data }) {
  const { totalAdultos, totalNinos, totalPersonas } = data
  const pctAdultos = totalPersonas > 0 ? Math.round((totalAdultos / totalPersonas) * 100) : 0
  const pctNinos   = totalPersonas > 0 ? 100 - pctAdultos : 0

  return (
    <div>
      {/* Big total */}
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 56, fontWeight: 900, color: GOLD, lineHeight: 1, letterSpacing: '-0.03em' }}>
          {totalPersonas}
        </div>
        <div style={{ fontSize: 13, color: TEXT2, marginTop: 6, fontWeight: 500 }}>
          personas en la App
        </div>
      </div>

      {/* Segmented bar */}
      {totalPersonas > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', height: 10 }}>
            <div style={{ width: `${pctAdultos}%`, background: GOLD, transition: 'width 0.6s ease' }} />
            <div style={{ flex: 1, background: INDIGO, opacity: 0.65 }} />
          </div>
        </div>
      )}

      {/* Stat row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {[
          { label: 'Adultos', count: totalAdultos, pct: pctAdultos, color: GOLD },
          { label: 'Niños',   count: totalNinos,   pct: pctNinos,   color: INDIGO },
        ].map(s => (
          <div
            key={s.label}
            style={{
              background: BG, borderRadius: 14, padding: '14px 16px',
              border: `1.5px solid ${BORDER}`, textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color, lineHeight: 1, letterSpacing: '-0.02em' }}>
              {s.count}
            </div>
            <div style={{ fontSize: 12, color: TEXT2, marginTop: 4, fontWeight: 500 }}>{s.label}</div>
            <div style={{
              display: 'inline-block', marginTop: 6,
              padding: '2px 10px',
              background: `${s.color}14`, border: `1px solid ${s.color}30`,
              borderRadius: 20, fontSize: 11, fontWeight: 700, color: s.color,
            }}>
              {s.pct}%
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Section: Edad media ──────────────────────────────────────────────────────

const fmt1 = n => n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

function BigStat({ value, label, note }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 56, fontWeight: 900, color: GOLD, lineHeight: 1, letterSpacing: '-0.03em' }}>
        {value}
      </div>
      <div style={{ fontSize: 13, color: TEXT2, marginTop: 6, fontWeight: 500 }}>{label}</div>
      {note && <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{note}</div>}
    </div>
  )
}

function EdadMedia({ data }) {
  const { media, mediaMayor, mediaInfantil, nMayor, nInfantil, conDato, total } = data
  if (media == null) return (
    <p style={{ fontSize: 13, color: MUTED, margin: 0, textAlign: 'center', padding: '12px 0' }}>
      Ningún fallero tiene todavía fecha de nacimiento registrada.
    </p>
  )
  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <BigStat
          value={fmt1(media)}
          label="años de media"
          note={`Calculado con ${conDato} de ${total} personas · el resto no tiene fecha de nacimiento`}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {[
          { label: 'Mayores',    value: mediaMayor,    n: nMayor,    color: GOLD },
          { label: 'Infantiles', value: mediaInfantil, n: nInfantil, color: INDIGO },
        ].map(s => (
          <div key={s.label} style={{ background: BG, borderRadius: 14, padding: '14px 16px', border: `1.5px solid ${BORDER}`, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color, lineHeight: 1, letterSpacing: '-0.02em' }}>
              {s.value != null ? fmt1(s.value) : '—'}
            </div>
            <div style={{ fontSize: 12, color: TEXT2, marginTop: 4, fontWeight: 500 }}>{s.label} · años</div>
            <div style={{
              display: 'inline-block', marginTop: 6, padding: '2px 10px',
              background: `${s.color}14`, border: `1px solid ${s.color}30`,
              borderRadius: 20, fontSize: 11, fontWeight: 700, color: s.color,
            }}>
              {s.n} {s.n === 1 ? 'persona' : 'personas'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Section: Falleros con familia ────────────────────────────────────────────

function FamiliaStat({ data }) {
  const { conFamilia, total, pct } = data
  if (pct == null) return (
    <p style={{ fontSize: 13, color: MUTED, margin: 0, textAlign: 'center', padding: '12px 0' }}>
      Sin falleros registrados todavía.
    </p>
  )
  const pctRound = Math.round(pct)
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <BigStat value={`${pctRound}%`} label="tienen al menos un familiar vinculado" note={`${conFamilia} de ${total} falleros`} />
      </div>
      <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', height: 10 }}>
        <div style={{ width: `${pct}%`, background: GOLD, transition: 'width 0.6s ease' }} />
        <div style={{ flex: 1, background: BORDER }} />
      </div>
    </div>
  )
}

// ─── Section: Historial de notificaciones push ────────────────────────────────

const fmtDateTime = ts => {
  const d = tsToDate(ts)
  return d
    ? d.toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'Enviando…'
}

function PushLogs({ data }) {
  if (!data.length) return (
    <p style={{ fontSize: 13, color: MUTED, margin: 0, textAlign: 'center', padding: '12px 0' }}>
      Todavía no se ha enviado ninguna notificación.
    </p>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {data.map((log, i) => {
        const ok = (log.sent ?? 0) > 0
        const who = log.adminNombre || log.adminEmail || log.adminUid || '—'
        return (
          <div key={log.id} style={{ padding: '11px 0', borderBottom: i < data.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  {log.title}
                </div>
                {log.body && (
                  <div style={{ fontSize: 12, color: TEXT2, marginTop: 2, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {log.body}
                  </div>
                )}
                <div style={{ fontSize: 11, color: MUTED, marginTop: 5 }}>
                  🕒 {fmtDateTime(log.createdAt)} · 👤 {who}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                <StatPill value={`✓ ${log.sent ?? 0}`} color={ok ? GREEN : MUTED} />
                {(log.failed ?? 0) > 0 && <StatPill value={`✗ ${log.failed}`} color="#DC2626" />}
                {(log.staleRemoved ?? 0) > 0 && (
                  <span style={{ fontSize: 10, color: MUTED }}>{log.staleRemoved} token{log.staleRemoved === 1 ? '' : 's'} caducado{log.staleRemoved === 1 ? '' : 's'}</span>
                )}
                {log.error && <span style={{ fontSize: 10, color: '#DC2626', maxWidth: 140, textAlign: 'right' }}>{log.error}</span>}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Skeleton loaders ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {[120, 280, 180, 200, 150, 220].map((h, i) => (
        <div key={i} style={{
          background: WHITE, borderRadius: 20, border: `1.5px solid ${BORDER}`,
          height: h, animation: 'falla-pulse 1.6s ease-in-out infinite',
          animationDelay: `${i * 0.15}s`,
        }} />
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminMetrics({ onClose }) {
  const [data,       setData]       = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error,      setError]      = useState(null)

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true)
    setError(null)
    try {
      const result = await fetchMetrics()
      setData(result)
    } catch {
      setError('No se pudieron cargar las métricas. Comprueba la conexión.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // Carga inicial (loading ya arranca en true): el estado sólo se toca al resolver la promesa.
  useEffect(() => {
    let alive = true
    fetchMetrics()
      .then(result => { if (alive) setData(result) })
      .catch(() => { if (alive) setError('No se pudieron cargar las métricas. Comprueba la conexión.') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: BG,
      display: 'flex', flexDirection: 'column',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>

      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        // safe-area: sin esto la cabecera queda bajo la barra de estado/notch del iPhone (PWA) y no se puede pulsar «Volver»
        padding: 'calc(14px + env(safe-area-inset-top)) 20px 14px',
        background: 'rgba(249,250,251,0.96)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${BORDER}`,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={onClose}
            aria-label="Volver"
            style={{
              background: 'transparent', border: `1.5px solid ${BORDER}`,
              borderRadius: 10, padding: '0 10px 0 6px', height: 38,
              display: 'flex', alignItems: 'center', gap: 2,
              cursor: 'pointer', minHeight: 'auto', minWidth: 'auto',
              fontSize: 13, fontWeight: 700, color: TEXT2,
            }}
          >
            <ChevronLeft size={18} color={TEXT2} /> Volver
          </button>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: TEXT, letterSpacing: '-0.01em' }}>
              Análisis de Datos
            </div>
            <div style={{ fontSize: 10, color: MUTED, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 1 }}>
              Solo visible para administradores
            </div>
          </div>
        </div>

        <button
          onClick={() => !refreshing && load(true)}
          disabled={refreshing || loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px',
            background: `${GOLD}14`, border: `1.5px solid ${GOLD}40`,
            borderRadius: 10, cursor: refreshing || loading ? 'default' : 'pointer',
            minHeight: 'auto', minWidth: 'auto',
            fontSize: 12, fontWeight: 700, color: GOLD,
            opacity: refreshing ? 0.6 : 1,
            transition: 'opacity 0.2s',
          }}
        >
          {refreshing
            ? <Loader2 size={13} style={{ animation: 'falla-spin 0.8s linear infinite' }} />
            : <RefreshCw size={13} />
          }
          Refrescar
        </button>
      </header>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', padding: '20px 20px 40px' }}>
        {loading ? (
          <LoadingSkeleton />
        ) : error ? (
          <div style={{
            background: 'rgba(239,68,68,0.06)', border: '1.5px solid rgba(239,68,68,0.2)',
            borderRadius: 16, padding: '20px 24px', textAlign: 'center', marginTop: 20,
          }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>⚠️</div>
            <p style={{ fontSize: 14, color: '#DC2626', fontWeight: 600, margin: '0 0 4px' }}>Error al cargar</p>
            <p style={{ fontSize: 13, color: TEXT2, margin: 0 }}>{error}</p>
          </div>
        ) : data && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Section 1: Top Falleros */}
            <SectionCard
              icon={<TrendingUp size={16} color={GOLD} />}
              title="Ranking de Participación"
            >
              <p style={{ fontSize: 11, color: MUTED, margin: '0 0 6px', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
                Ejercicio fallero {data.yearStart ? data.yearStart.getFullYear() : '—'} – {data.yearStart ? (data.yearStart.getFullYear() + 1) : '—'} · desde el 1 de abril
              </p>
              {data.topFalleros.length > 0 && (
                <p style={{ fontSize: 11, color: MUTED, margin: '0 0 12px' }}>
                  Top {data.topFalleros.length} falleros más activos · inscripciones vía App
                </p>
              )}
              <TopFalleros data={data.topFalleros} />
            </SectionCard>

            {/* Section 2: Event Volume */}
            <SectionCard
              icon={<BarChart2 size={16} color={GOLD} />}
              title="Volumen de Asistencia por Evento"
            >
              {data.eventVolume.length > 0 && (
                <p style={{ fontSize: 11, color: MUTED, margin: '0 0 14px', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
                  {data.eventVolume.length} {data.eventVolume.length === 1 ? 'evento' : 'eventos'} con inscripciones · adultos + niños
                </p>
              )}
              <EventVolume data={data.eventVolume} />
            </SectionCard>

            {/* Section 3: Demographics */}
            <SectionCard
              icon={<Users size={16} color={GOLD} />}
              title="Desglose Demográfico"
            >
              <Demographics data={data.demographics} />
            </SectionCard>

            {/* Section 4: Edad media */}
            <SectionCard
              icon={<Cake size={16} color={GOLD} />}
              title="Edad Media"
            >
              <EdadMedia data={data.edad} />
            </SectionCard>

            {/* Section 5: Falleros con familia en la falla */}
            <SectionCard
              icon={<HeartHandshake size={16} color={GOLD} />}
              title="Falleros con Familia en la Falla"
            >
              <FamiliaStat data={data.familia} />
            </SectionCard>

            {/* Section 6: Historial de notificaciones push */}
            <SectionCard
              icon={<Bell size={16} color={GOLD} />}
              title="Historial de Notificaciones Push"
            >
              {data.pushLogs.length > 0 && (
                <p style={{ fontSize: 11, color: MUTED, margin: '0 0 6px', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
                  Últimos {data.pushLogs.length} envíos · dispositivos alcanzados / fallidos
                </p>
              )}
              <PushLogs data={data.pushLogs} />
            </SectionCard>

          </div>
        )}
      </div>
    </div>
  )
}
