import { useState, useEffect } from 'react'
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { ArrowLeft, Download, BarChart2, UserPlus, Check, Loader2, Users } from 'lucide-react'

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

function getInsCounts(ins) {
  if (ins.acompañantesAdultos !== undefined || ins.acompañantesNinos !== undefined) {
    return {
      adultos: 1 + (ins.acompañantesAdultos?.length ?? 0),
      ninos:   ins.acompañantesNinos?.length ?? 0,
    }
  }
  return ins.esHijo
    ? { adultos: 0, ninos: ins.totalPersonas ?? 1 }
    : { adultos: ins.totalPersonas ?? 1, ninos: 0 }
}

export default function AdminEventControl({ event, onClose }) {
  const [inscriptions, setInscriptions] = useState([])
  const [loading, setLoading] = useState(true)

  const [showManual,    setShowManual]    = useState(false)
  const [manualNombre,  setManualNombre]  = useState('')
  const [manualEsHijo,  setManualEsHijo]  = useState(false)
  const [savingManual,  setSavingManual]  = useState(false)
  const [manualDone,    setManualDone]    = useState(false)

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

  // People counts — supports both old (number) and new (named arrays) format
  const totalAsistentes = inscriptions.reduce((s, i) => s + (i.totalPersonas ?? 1), 0)
  const adultosTotal    = inscriptions.reduce((s, i) => s + getInsCounts(i).adultos, 0)
  const ninosTotal      = inscriptions.reduce((s, i) => s + getInsCounts(i).ninos, 0)
  const limit           = event.plazasTotal ?? null
  const pct             = limit ? Math.min(100, (totalAsistentes / limit) * 100) : null
  const pctColor        = pct > 80 ? RED : pct > 50 ? GOLD : GREEN

  const handleDownload = () => {
    const rows = [
      ['Nombre', 'Tipo', 'Nº Fallero', 'Acompañantes', 'Total Personas', 'Alergias', 'Nota', 'Origen'],
      ...inscriptions.map(i => [
        i.nombre,
        i.esHijo ? 'INFANTIL' : 'ADULTO',
        i.numFallero ?? '—',
        i.acompañantes ?? 0,
        i.totalPersonas ?? 1,
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
        eventId: event.id, eventoTitulo: event.titulo,
        uid: 'manual', nombre, numFallero: '—',
        esHijo: manualEsHijo, esManual: true,
        acompañantes: 0, totalPersonas: 1,
        nota: null, alergias: null, createdAt: serverTimestamp(),
      })
      setManualDone(true)
      setTimeout(() => {
        setManualDone(false); setManualNombre(''); setManualEsHijo(false); setShowManual(false)
      }, 1400)
    } catch {} finally { setSavingManual(false) }
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

        {/* Header with prominent back button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexShrink: 0 }}>
          <button
            onClick={onClose}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.25)', borderRadius: 10, padding: '0.45rem 0.75rem', color: GOLD, fontSize: '0.78rem', fontWeight: '700', cursor: 'pointer', minHeight: 'auto', minWidth: 'auto', flexShrink: 0, transition: 'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(212,175,55,0.15)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(212,175,55,0.08)'}
          >
            <ArrowLeft size={14} /> Volver
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <BarChart2 size={14} color={GOLD} />
              <span style={{ fontSize: '0.9rem', fontWeight: '800', color: GOLD }}>Control de Inscritos</span>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: 'rgba(255,255,255,0.38)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
              {event.titulo}
            </p>
          </div>
        </div>

        {/* Summary banner */}
        {!loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.25rem', padding: '0.7rem 1rem', background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.16)', borderRadius: 14, marginBottom: '0.85rem', flexShrink: 0, flexWrap: 'wrap' }}>
            <SummaryItem value={totalAsistentes} label="Total Asistentes" color={GOLD} />
            <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.08)' }} />
            <SummaryItem value={adultosTotal} label="Adultos" color="white" />
            <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.08)' }} />
            <SummaryItem value={ninosTotal} label="Niños" color={GREEN} />
            {limit && (
              <>
                <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.08)' }} />
                <SummaryItem value={`${totalAsistentes}/${limit}`} label="Aforo" color={pctColor} />
              </>
            )}
          </div>
        )}

        {/* Aforo bar */}
        {pct !== null && !loading && (
          <div style={{ marginBottom: '0.85rem', flexShrink: 0 }}>
            <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 4, height: 5 }}>
              <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: pctColor, transition: 'width 0.4s ease' }} />
            </div>
            {pct >= 100 && (
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.68rem', color: RED, fontWeight: '700', textAlign: 'center' }}>
                AFORO COMPLETO
              </p>
            )}
          </div>
        )}

        {/* KPI — Attendance Analysis */}
        {!loading && totalAsistentes > 0 && (
          <div style={{ marginBottom: '0.85rem', flexShrink: 0 }}>
            <p style={{ margin: '0 0 0.55rem', fontSize: '0.62rem', fontWeight: '700', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
              Análisis de Asistencia
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <KPICard icon="👤" label="Adultos"  value={adultosTotal} total={totalAsistentes} color="#3b82f6" />
              <KPICard icon="🧒" label="Niños/as" value={ninosTotal}   total={totalAsistentes} color="#f97316" />
            </div>
          </div>
        )}

        {/* Inscription list */}
        <div style={{ flex: 1, overflowY: 'auto', marginBottom: '0.75rem' }}>
          {loading ? (
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.85rem', textAlign: 'center', padding: '1.5rem 0', margin: 0 }}>
              Cargando…
            </p>
          ) : inscriptions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>👥</div>
              <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.85rem', margin: 0 }}>
                Nadie apuntado todavía
              </p>
            </div>
          ) : (
            inscriptions.map((ins, idx) => {
              const acomp = ins.acompañantes ?? 0
              const total = ins.totalPersonas ?? 1
              return (
                <div
                  key={ins.id}
                  style={{ padding: '0.85rem 0', borderBottom: idx < inscriptions.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                    {/* Avatar */}
                    <div style={{ width: 36, height: 36, flexShrink: 0, background: ins.esHijo ? 'rgba(16,185,129,0.1)' : 'rgba(212,175,55,0.1)', border: `1px solid ${ins.esHijo ? 'rgba(16,185,129,0.25)' : 'rgba(212,175,55,0.25)'}`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', marginTop: 1 }}>
                      {ins.esHijo ? '👦' : '👤'}
                    </div>
                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Name + badges row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginBottom: (acomp > 0 || ins.alergias || ins.nota || ins.telefono) ? 4 : 0 }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: '700', color: 'white' }}>{ins.nombre}</span>
                        <TypeBadge esHijo={ins.esHijo} />
                        {ins.esManual && <ManualBadge />}
                      </div>
                      {ins.telefono && (
                        <div style={{ marginBottom: 3 }}>
                          <a
                            href={`tel:${ins.telefono}`}
                            style={{ fontSize: '0.72rem', fontWeight: '700', color: INDIGO, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          >
                            📞 {ins.telefono}
                          </a>
                        </div>
                      )}
                      {/* Companion breakdown */}
                      {ins.acompañantesAdultos !== undefined || ins.acompañantesNinos !== undefined ? (
                        <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {(ins.acompañantesAdultos ?? []).map((a, idx) => (
                            <div key={`a${idx}`} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)' }}>
                              <span style={{ padding: '1px 6px', background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.28)', borderRadius: 20, fontSize: '0.58rem', fontWeight: '800', color: '#3b82f6', flexShrink: 0, letterSpacing: '0.04em' }}>👤 ADULTO</span>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nombre || `Adulto ${idx + 1}`}</span>
                            </div>
                          ))}
                          {(ins.acompañantesNinos ?? []).map((n, idx) => (
                            <div key={`n${idx}`} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)' }}>
                              <span style={{ padding: '1px 6px', background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.28)', borderRadius: 20, fontSize: '0.58rem', fontWeight: '800', color: '#f97316', flexShrink: 0, letterSpacing: '0.04em' }}>🧒 NIÑO/A</span>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.nombre || `Niño/a ${idx + 1}`}</span>
                            </div>
                          ))}
                          {(ins.acompañantesAdultos?.length > 0 || ins.acompañantesNinos?.length > 0) && (
                            <span style={{ display: 'inline-block', marginTop: 2, padding: '1px 7px', background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.25)', borderRadius: 20, fontSize: '0.63rem', fontWeight: '800', color: GOLD }}>
                              {ins.totalPersonas ?? 1} personas total
                            </span>
                          )}
                        </div>
                      ) : acomp > 0 ? (
                        <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Users size={10} color="rgba(255,255,255,0.3)" />
                          <span>Titular + {acomp} acompañante{acomp > 1 ? 's' : ''}</span>
                          <span style={{ display: 'inline-block', padding: '0px 7px', background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.25)', borderRadius: 20, fontSize: '0.65rem', fontWeight: '800', color: GOLD }}>
                            {total} personas
                          </span>
                        </div>
                      ) : null}
                      {/* Alergias (highlighted) */}
                      {ins.alergias && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.28)', borderRadius: 8, marginBottom: 3 }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#fbbf24' }}>🌾 {ins.alergias}</span>
                        </div>
                      )}
                      {/* Nota */}
                      {ins.nota && (
                        <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.32)', fontStyle: 'italic' }}>
                          📝 {ins.nota}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
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

          {showManual && (
            <form
              onSubmit={handleManualSubmit}
              style={{ marginTop: '0.75rem', padding: '1rem', background: 'rgba(129,140,248,0.06)', border: '1px solid rgba(129,140,248,0.2)', borderRadius: 14, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
            >
              {manualDone ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.5rem 0', color: GREEN, fontSize: '0.88rem', fontWeight: '700' }}>
                  <Check size={16} strokeWidth={2.5} /> Inscripción añadida
                </div>
              ) : (
                <>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: '700', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                      Nombre completo *
                    </label>
                    <input
                      required autoFocus
                      value={manualNombre} onChange={e => setManualNombre(e.target.value)}
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
                        <button key={String(val)} type="button" onClick={() => setManualEsHijo(val)}
                          style={{ flex: 1, padding: '0.55rem 0.5rem', background: manualEsHijo === val ? 'rgba(129,140,248,0.15)' : 'rgba(255,255,255,0.04)', border: `1.5px solid ${manualEsHijo === val ? 'rgba(129,140,248,0.5)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 10, color: manualEsHijo === val ? INDIGO : 'rgba(255,255,255,0.4)', fontSize: '0.78rem', fontWeight: '700', cursor: 'pointer', minHeight: 'auto', transition: 'all 0.15s' }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button type="submit" disabled={savingManual || !manualNombre.trim()}
                    style={{ minHeight: '44px', background: savingManual || !manualNombre.trim() ? 'rgba(129,140,248,0.2)' : 'rgba(129,140,248,0.25)', border: '1px solid rgba(129,140,248,0.4)', borderRadius: 12, color: INDIGO, fontSize: '0.88rem', fontWeight: '700', cursor: savingManual || !manualNombre.trim() ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                    {savingManual ? <Loader2 size={15} style={{ animation: 'falla-spin 0.8s linear infinite' }} /> : <><UserPlus size={15} /> Confirmar inscripción</>}
                  </button>
                </>
              )}
            </form>
          )}
        </div>

        {/* CSV download */}
        {!loading && inscriptions.length > 0 && (
          <button
            onClick={handleDownload}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', width: '100%', minHeight: '50px', background: `linear-gradient(135deg, ${GOLD}, #8a6f1a)`, border: 'none', borderRadius: 14, color: 'white', fontSize: '0.9rem', fontWeight: '700', cursor: 'pointer', boxShadow: `0 4px 18px rgba(212,175,55,0.3)`, flexShrink: 0 }}
          >
            <Download size={17} />
            Descargar CSV ({totalAsistentes} personas)
          </button>
        )}
      </div>
    </div>
  )
}

function KPICard({ icon, label, value, total, color }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div style={{ flex: 1, background: `${color}0d`, border: `1.5px solid ${color}28`, borderRadius: 14, padding: '14px 12px', textAlign: 'center' }}>
      <div style={{ fontSize: 22, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 30, fontWeight: 900, color, lineHeight: 1, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.45)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color, background: `${color}18`, border: `1px solid ${color}2e`, borderRadius: 20, padding: '2px 10px', display: 'inline-block' }}>
        {pct}%
      </div>
    </div>
  )
}

function SummaryItem({ value, label, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '1.4rem', fontWeight: '900', color, lineHeight: 1, letterSpacing: '-0.02em' }}>{value}</div>
      <div style={{ fontSize: '0.58rem', fontWeight: '700', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 3 }}>{label}</div>
    </div>
  )
}

function TypeBadge({ esHijo }) {
  return (
    <span style={{ padding: '0.18rem 0.55rem', background: esHijo ? 'rgba(16,185,129,0.12)' : 'rgba(212,175,55,0.12)', border: `1px solid ${esHijo ? 'rgba(16,185,129,0.28)' : 'rgba(212,175,55,0.28)'}`, borderRadius: 20, fontSize: '0.58rem', fontWeight: '800', letterSpacing: '0.08em', textTransform: 'uppercase', color: esHijo ? GREEN : GOLD }}>
      {esHijo ? 'INFANTIL' : 'ADULTO'}
    </span>
  )
}

function ManualBadge() {
  return (
    <span style={{ padding: '0.15rem 0.5rem', background: 'rgba(129,140,248,0.12)', border: '1px solid rgba(129,140,248,0.28)', borderRadius: 20, fontSize: '0.55rem', fontWeight: '800', letterSpacing: '0.08em', textTransform: 'uppercase', color: INDIGO }}>
      MANUAL
    </span>
  )
}
