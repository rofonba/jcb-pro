import { useState, useEffect, useCallback } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import { X, RefreshCw, Loader2, TrendingUp, BarChart2, Users } from 'lucide-react'

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

// ─── Data fetcher ─────────────────────────────────────────────────────────────

async function fetchMetrics() {
  const [insSnap, fallerosSnap] = await Promise.all([
    getDocs(collection(db, 'inscripciones')),
    getDocs(collection(db, 'falleros')),
  ])

  const inscriptions = insSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  const fallerosList = fallerosSnap.docs.map(d => d.data())

  // 1. Top 10 falleros — non-manual only, group by uid
  const countByUid = {}
  const nameByUid  = {}
  for (const ins of inscriptions) {
    if (ins.esManual || ins.uid === 'manual') continue
    countByUid[ins.uid] = (countByUid[ins.uid] || 0) + 1
    if (!nameByUid[ins.uid]) nameByUid[ins.uid] = ins.nombre || '—'
  }
  const topFalleros = Object.entries(countByUid)
    .map(([uid, count]) => ({ uid, nombre: nameByUid[uid], count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  // 2. Event volume — all inscriptions including manual
  const volByEvent    = {}
  const titleByEvent  = {}
  const adultsByEvent = {}
  const ninosByEvent  = {}
  for (const ins of inscriptions) {
    const eid = ins.eventId
    if (!eid) continue
    volByEvent[eid]    = (volByEvent[eid] || 0) + 1
    titleByEvent[eid]  = ins.eventoTitulo || eid
    if (ins.esHijo) ninosByEvent[eid]  = (ninosByEvent[eid]  || 0) + 1
    else            adultsByEvent[eid] = (adultsByEvent[eid] || 0) + 1
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

  // 3. Demographics from falleros collection
  const totalAdultos  = fallerosList.length
  const totalNinos    = fallerosList.reduce((sum, f) => sum + (Array.isArray(f.hijos) ? f.hijos.length : 0), 0)
  const totalPersonas = totalAdultos + totalNinos

  return { topFalleros, eventVolume, demographics: { totalAdultos, totalNinos, totalPersonas } }
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

// ─── Skeleton loaders ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {[120, 280, 180].map((h, i) => (
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

  useEffect(() => { load() }, [load])

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
        padding: '14px 20px',
        background: 'rgba(249,250,251,0.96)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${BORDER}`,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: `1.5px solid ${BORDER}`,
              borderRadius: 10, width: 34, height: 34,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', minHeight: 'auto', minWidth: 'auto',
            }}
          >
            <X size={16} color={TEXT2} />
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
              {data.topFalleros.length > 0 && (
                <p style={{ fontSize: 11, color: MUTED, margin: '0 0 12px', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
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

          </div>
        )}
      </div>
    </div>
  )
}
