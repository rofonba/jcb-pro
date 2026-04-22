import { useState, useEffect } from 'react'
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { X, Download, BarChart2 } from 'lucide-react'

const GOLD  = '#D4AF37'
const RED   = '#CE1126'
const GREEN = '#10b981'

export default function AdminEventControl({ event, onClose }) {
  const [inscriptions, setInscriptions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(
      collection(db, 'inscripciones'),
      where('eventId', '==', event.id),
      orderBy('createdAt', 'asc'),
    )
    return onSnapshot(q, snap => {
      setInscriptions(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }, () => setLoading(false))
  }, [event.id])

  const adultos = inscriptions.filter(i => !i.esHijo)
  const ninos   = inscriptions.filter(i => i.esHijo)
  const total   = inscriptions.length
  const limit   = event.plazasTotal ?? null
  const pct     = limit ? Math.min(100, (total / limit) * 100) : null
  const pctColor = pct > 80 ? RED : pct > 50 ? GOLD : GREEN

  const handleDownload = () => {
    const rows = [
      ['Nombre', 'Tipo', 'Nº Fallero', 'Nota'],
      ...inscriptions.map(i => [
        i.nombre,
        i.esHijo ? 'INFANTIL' : 'ADULTO',
        i.numFallero ?? '—',
        i.nota ?? '',
      ]),
    ]
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `inscritos-${event.titulo.replace(/\s+/g, '-')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 110, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ width: '100%', maxWidth: '480px', background: '#141414', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '24px 24px 0 0', padding: `1.5rem 1.5rem calc(1.5rem + env(safe-area-inset-bottom))`, animation: 'falla-slideUp 0.25s ease-out', maxHeight: '88dvh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div style={{ width: 40, height: 4, background: 'rgba(255,255,255,0.12)', borderRadius: 2, margin: '0 auto 1.25rem', flexShrink: 0 }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem', flexShrink: 0 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              <BarChart2 size={16} color={GOLD} />
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '800', color: GOLD }}>Control de Inscritos</h3>
            </div>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'rgba(255,255,255,0.38)' }}>{event.titulo}</p>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 10, padding: '0.5rem', color: 'rgba(255,255,255,0.4)', display: 'flex', cursor: 'pointer', minHeight: 'auto', minWidth: 'auto', flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.65rem', marginBottom: '1rem', flexShrink: 0 }}>
          <StatBox
            value={loading ? '…' : limit ? `${total}/${limit}` : String(total)}
            label="Total"
            color={GOLD}
            bg="rgba(212,175,55,0.08)"
            border="rgba(212,175,55,0.2)"
          />
          <StatBox
            value={loading ? '…' : String(adultos.length)}
            label="Adultos"
            color="white"
            bg="rgba(255,255,255,0.04)"
            border="rgba(255,255,255,0.1)"
          />
          <StatBox
            value={loading ? '…' : String(ninos.length)}
            label="Niños"
            color={GREEN}
            bg="rgba(16,185,129,0.08)"
            border="rgba(16,185,129,0.2)"
          />
        </div>

        {/* Aforo bar */}
        {pct !== null && !loading && (
          <div style={{ marginBottom: '1rem', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.38)' }}>Ocupación del aforo</span>
              <span style={{ fontSize: '0.68rem', fontWeight: '800', color: pctColor }}>{Math.round(pct)}%</span>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 4, height: 6 }}>
              <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: pctColor, transition: 'width 0.4s ease' }} />
            </div>
            {pct >= 100 && (
              <p style={{ margin: '0.4rem 0 0', fontSize: '0.7rem', color: RED, fontWeight: '700', textAlign: 'center' }}>
                AFORO COMPLETO
              </p>
            )}
          </div>
        )}

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', marginBottom: '1rem' }}>
          {loading ? (
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.85rem', textAlign: 'center', padding: '1.5rem 0', margin: 0 }}>
              Cargando…
            </p>
          ) : inscriptions.length === 0 ? (
            <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem 0', margin: 0 }}>
              Nadie apuntado todavía
            </p>
          ) : (
            inscriptions.map(ins => (
              <div key={ins.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.7rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{
                  width: 34, height: 34, flexShrink: 0,
                  background: ins.esHijo ? 'rgba(16,185,129,0.1)' : 'rgba(212,175,55,0.1)',
                  border: `1px solid ${ins.esHijo ? 'rgba(16,185,129,0.25)' : 'rgba(212,175,55,0.25)'}`,
                  borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem',
                }}>
                  {ins.esHijo ? '👦' : '👤'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: '600', color: 'white', marginBottom: ins.nota ? 2 : 0 }}>
                    {ins.nombre}
                  </div>
                  {ins.nota && (
                    <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)' }}>{ins.nota}</div>
                  )}
                </div>
                <TypeBadge esHijo={ins.esHijo} />
              </div>
            ))
          )}
        </div>

        {/* CSV button */}
        {!loading && inscriptions.length > 0 && (
          <button
            onClick={handleDownload}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', width: '100%', minHeight: '50px', background: `linear-gradient(135deg, ${GOLD}, #8a6f1a)`, border: 'none', borderRadius: 14, color: 'white', fontSize: '0.9rem', fontWeight: '700', cursor: 'pointer', boxShadow: `0 4px 18px rgba(212,175,55,0.3)`, flexShrink: 0 }}
          >
            <Download size={17} />
            Descargar CSV
          </button>
        )}
      </div>
    </div>
  )
}

function StatBox({ value, label, color, bg, border }) {
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: '0.85rem 0.5rem', textAlign: 'center' }}>
      <div style={{ fontSize: '1.6rem', fontWeight: '900', color, lineHeight: 1, letterSpacing: '-0.02em' }}>{value}</div>
      <div style={{ fontSize: '0.6rem', fontWeight: '700', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '0.3rem' }}>{label}</div>
    </div>
  )
}

function TypeBadge({ esHijo }) {
  return (
    <span style={{
      flexShrink: 0, padding: '0.18rem 0.55rem',
      background: esHijo ? 'rgba(16,185,129,0.12)' : 'rgba(212,175,55,0.12)',
      border: `1px solid ${esHijo ? 'rgba(16,185,129,0.28)' : 'rgba(212,175,55,0.28)'}`,
      borderRadius: 20, fontSize: '0.58rem', fontWeight: '800',
      letterSpacing: '0.08em', textTransform: 'uppercase',
      color: esHijo ? GREEN : GOLD,
    }}>
      {esHijo ? 'INFANTIL' : 'ADULTO'}
    </span>
  )
}
