import { useState, useEffect } from 'react'
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { X, Download, BarChart2, UserPlus, Check, Loader2 } from 'lucide-react'

const GOLD   = '#D4AF37'
const RED    = '#CE1126'
const GREEN  = '#10b981'
const INDIGO = '#818cf8'
const CARD   = '#141414'

const sharedInput = {
  width: '100%', padding: '0.7rem 0.9rem',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '10px', color: 'white', fontSize: '0.9rem',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
}

export default function AdminEventControl({ event, onClose }) {
  const [inscriptions, setInscriptions] = useState([])
  const [loading, setLoading] = useState(true)

  // Manual inscription form state
  const [showManual, setShowManual]       = useState(false)
  const [manualNombre, setManualNombre]   = useState('')
  const [manualEsHijo, setManualEsHijo]   = useState(false)
  const [savingManual, setSavingManual]   = useState(false)
  const [manualDone, setManualDone]       = useState(false)

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
      ['Nombre', 'Tipo', 'Nº Fallero', 'Alergias', 'Nota', 'Origen'],
      ...inscriptions.map(i => [
        i.nombre,
        i.esHijo ? 'INFANTIL' : 'ADULTO',
        i.numFallero ?? '—',
        i.alergias ?? '',
        i.nota ?? '',
        i.esManual ? 'Manual' : 'App',
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

  const handleManualSubmit = async (e) => {
    e.preventDefault()
    const nombre = manualNombre.trim()
    if (!nombre) return
    setSavingManual(true)
    try {
      await addDoc(collection(db, 'inscripciones'), {
        eventId:      event.id,
        eventoTitulo: event.titulo,
        uid:          'manual',
        nombre,
        numFallero:   '—',
        esHijo:       manualEsHijo,
        esManual:     true,
        nota:         null,
        alergias:     null,
        createdAt:    serverTimestamp(),
      })
      setManualDone(true)
      setTimeout(() => {
        setManualDone(false)
        setManualNombre('')
        setManualEsHijo(false)
        setShowManual(false)
      }, 1400)
    } catch {} finally {
      setSavingManual(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 110, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ width: '100%', maxWidth: '480px', background: CARD, border: '1px solid rgba(212,175,55,0.2)', borderRadius: '24px 24px 0 0', padding: `1.5rem 1.5rem calc(1.5rem + env(safe-area-inset-bottom))`, animation: 'falla-slideUp 0.25s ease-out', maxHeight: '92dvh', display: 'flex', flexDirection: 'column' }}
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
        <div style={{ flex: 1, overflowY: 'auto', marginBottom: '0.75rem' }}>
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
                  <div style={{ fontSize: '0.88rem', fontWeight: '600', color: 'white', marginBottom: (ins.alergias || ins.nota) ? 2 : 0 }}>
                    {ins.nombre}
                  </div>
                  {ins.alergias && (
                    <div style={{ fontSize: '0.7rem', color: '#fbbf24', fontWeight: '600' }}>🌾 {ins.alergias}</div>
                  )}
                  {ins.nota && (
                    <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)' }}>{ins.nota}</div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                  <TypeBadge esHijo={ins.esHijo} />
                  {ins.esManual && <ManualBadge />}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Manual inscription toggle */}
        <div style={{ flexShrink: 0, marginBottom: '0.75rem' }}>
          <button
            onClick={() => { setShowManual(v => !v); setManualDone(false) }}
            style={{
              width: '100%', minHeight: '44px',
              background: showManual ? 'rgba(129,140,248,0.12)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${showManual ? 'rgba(129,140,248,0.35)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 12, color: showManual ? INDIGO : 'rgba(255,255,255,0.5)',
              fontSize: '0.82rem', fontWeight: '700', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem',
              transition: 'all 0.2s',
            }}
          >
            <UserPlus size={15} />
            Inscribir fallero / invitado manualmente
          </button>

          {/* Inline form */}
          {showManual && (
            <form
              onSubmit={handleManualSubmit}
              style={{
                marginTop: '0.75rem', padding: '1rem',
                background: 'rgba(129,140,248,0.06)',
                border: '1px solid rgba(129,140,248,0.2)',
                borderRadius: 14,
                display: 'flex', flexDirection: 'column', gap: '0.75rem',
              }}
            >
              {manualDone ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.5rem 0', color: GREEN, fontSize: '0.88rem', fontWeight: '700' }}>
                  <Check size={16} strokeWidth={2.5} />
                  Inscripción añadida
                </div>
              ) : (
                <>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: '700', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                      Nombre completo *
                    </label>
                    <input
                      required autoFocus
                      value={manualNombre}
                      onChange={e => setManualNombre(e.target.value)}
                      placeholder="Ej: María García López"
                      style={sharedInput}
                      onFocus={e => e.target.style.borderColor = INDIGO}
                      onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: '700', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                      Tipo
                    </label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {[{ val: false, label: '👤 Adulto' }, { val: true, label: '👦 Infantil' }].map(({ val, label }) => (
                        <button
                          key={String(val)}
                          type="button"
                          onClick={() => setManualEsHijo(val)}
                          style={{
                            flex: 1, padding: '0.55rem 0.5rem',
                            background: manualEsHijo === val ? 'rgba(129,140,248,0.15)' : 'rgba(255,255,255,0.04)',
                            border: `1.5px solid ${manualEsHijo === val ? 'rgba(129,140,248,0.5)' : 'rgba(255,255,255,0.1)'}`,
                            borderRadius: 10,
                            color: manualEsHijo === val ? INDIGO : 'rgba(255,255,255,0.4)',
                            fontSize: '0.78rem', fontWeight: '700', cursor: 'pointer', minHeight: 'auto',
                            transition: 'all 0.15s',
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    type="submit" disabled={savingManual || !manualNombre.trim()}
                    style={{
                      minHeight: '44px',
                      background: savingManual || !manualNombre.trim()
                        ? 'rgba(129,140,248,0.2)'
                        : 'rgba(129,140,248,0.25)',
                      border: '1px solid rgba(129,140,248,0.4)',
                      borderRadius: 12, color: INDIGO,
                      fontSize: '0.88rem', fontWeight: '700',
                      cursor: savingManual || !manualNombre.trim() ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                    }}
                  >
                    {savingManual
                      ? <Loader2 size={15} style={{ animation: 'falla-spin 0.8s linear infinite' }} />
                      : <><UserPlus size={15} /> Confirmar inscripción</>}
                  </button>
                </>
              )}
            </form>
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
      padding: '0.18rem 0.55rem',
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

function ManualBadge() {
  return (
    <span style={{
      padding: '0.15rem 0.5rem',
      background: 'rgba(129,140,248,0.12)',
      border: '1px solid rgba(129,140,248,0.28)',
      borderRadius: 20, fontSize: '0.55rem', fontWeight: '800',
      letterSpacing: '0.08em', textTransform: 'uppercase',
      color: INDIGO,
    }}>
      MANUAL
    </span>
  )
}
