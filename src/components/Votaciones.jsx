import { useState, useEffect } from 'react'
import {
  collection, query, orderBy, onSnapshot,
  doc, addDoc, updateDoc, setDoc, getDoc, deleteDoc,
  serverTimestamp, increment,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { Plus, X, Check, Loader2, BarChart2, Lock, Trash2, Eye, EyeOff } from 'lucide-react'

const GOLD   = '#D4AF37'
const RED    = '#CE1126'
const GREEN  = '#10b981'
const TEXT   = '#111827'
const TEXT2  = '#6B7280'
const MUTED  = '#9CA3AF'
const BORDER = '#F3F4F6'
const BG     = '#F9FAFB'
const WHITE  = '#FFFFFF'

function Card({ children, style = {} }) {
  return (
    <div style={{
      background: WHITE, borderRadius: 20, padding: '18px 20px',
      border: `1.5px solid ${BORDER}`, boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
      ...style,
    }}>
      {children}
    </div>
  )
}

// ─── Single poll card ─────────────────────────────────────────────────────────
function PollCard({ poll, userId, isAdmin, falleroNombre }) {
  const [myVote,         setMyVote]         = useState(null)
  const [loading,        setLoading]        = useState(true)
  const [voting,         setVoting]         = useState(false)
  const [selected,       setSelected]       = useState(null)
  const [closing,        setClosing]        = useState(false)
  const [deleting,       setDeleting]       = useState(false)
  const [votersByOption, setVotersByOption] = useState({})

  const resultados  = poll.resultados  ?? {}
  const totalVotos  = poll.totalVotos  ?? 0
  const opciones    = poll.opciones    ?? []
  // Default true: polls created before this field existed are treated as anonymous
  const isAnonymous = poll.isAnonymous !== false

  // Check if current user already voted
  useEffect(() => {
    if (!userId) return
    getDoc(doc(db, 'votaciones', poll.id, 'votos', userId))
      .then(snap => { if (snap.exists()) setMyVote(snap.data().opcionId) })
      .finally(() => setLoading(false))
  }, [poll.id, userId])

  // Real-time voter list — only for admin viewing a nominal poll
  useEffect(() => {
    if (!isAdmin || isAnonymous) return
    return onSnapshot(
      collection(db, 'votaciones', poll.id, 'votos'),
      snap => {
        const grouped = {}
        snap.docs.forEach(d => {
          const { opcionId, voterName } = d.data()
          if (!grouped[opcionId]) grouped[opcionId] = []
          grouped[opcionId].push({ uid: d.id, name: voterName ?? '—' })
        })
        setVotersByOption(grouped)
      },
      () => {},
    )
  }, [poll.id, isAdmin, isAnonymous])

  const handleVote = async () => {
    if (!selected || voting || myVote) return
    setVoting(true)
    try {
      // Vote doc uses UID as ID → enforces one vote per user
      await setDoc(doc(db, 'votaciones', poll.id, 'votos', userId), {
        opcionId: selected,
        votadoAt: serverTimestamp(),
        ...(!isAnonymous && falleroNombre ? { voterName: falleroNombre } : {}),
      })
      // Increment counters in poll doc — allowed by Firestore rule for authenticated users
      await updateDoc(doc(db, 'votaciones', poll.id), {
        [`resultados.${selected}`]: increment(1),
        totalVotos: increment(1),
      })
      setMyVote(selected)
    } catch (err) {
      console.error('[vote]', err)
    } finally {
      setVoting(false)
    }
  }

  const handleClose = async () => {
    setClosing(true)
    try {
      await updateDoc(doc(db, 'votaciones', poll.id), { activa: false })
    } finally { setClosing(false) }
  }

  const handleDelete = async () => {
    if (!window.confirm('¿Eliminar esta votación? Esta acción no se puede deshacer.')) return
    setDeleting(true)
    try {
      await deleteDoc(doc(db, 'votaciones', poll.id))
    } catch (err) {
      console.error('[delete poll]', err)
      setDeleting(false)
    }
  }

  const hasVoted = Boolean(myVote)
  const maxVotes = opciones.length > 0
    ? Math.max(...opciones.map(o => resultados[o.id] ?? 0))
    : 0

  return (
    <Card>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5, flexWrap: 'wrap' }}>
            <BarChart2 size={14} color={GOLD} />
            <span style={{ fontSize: 10, fontWeight: 700, color: GOLD, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              {poll.activa ? 'Votación activa' : 'Cerrada'}
            </span>
            {!poll.activa && <Lock size={11} color={MUTED} />}
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 600, color: isAnonymous ? MUTED : TEXT2 }}>
              {isAnonymous ? <><EyeOff size={10} /> Anónima</> : <><Eye size={10} /> Nominal</>}
            </span>
          </div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: TEXT, lineHeight: 1.3 }}>
            {poll.pregunta}
          </h3>
        </div>

        {isAdmin && (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {poll.activa && (
              <button
                onClick={handleClose} disabled={closing}
                style={{ background: 'rgba(206,17,38,0.07)', border: `1.5px solid rgba(206,17,38,0.2)`, borderRadius: 10, padding: '5px 10px', fontSize: 11, fontWeight: 700, color: RED, cursor: closing ? 'not-allowed' : 'pointer', minHeight: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                {closing
                  ? <Loader2 size={11} style={{ animation: 'falla-spin 0.8s linear infinite' }} />
                  : <Lock size={11} />}
                Cerrar
              </button>
            )}
            <button
              onClick={handleDelete} disabled={deleting}
              style={{ background: 'rgba(206,17,38,0.07)', border: `1.5px solid rgba(206,17,38,0.2)`, borderRadius: 10, padding: '5px 8px', cursor: deleting ? 'not-allowed' : 'pointer', minHeight: 'auto', minWidth: 'auto', display: 'flex', alignItems: 'center' }}
            >
              {deleting
                ? <Loader2 size={13} color={RED} style={{ animation: 'falla-spin 0.8s linear infinite' }} />
                : <Trash2 size={13} color={RED} />}
            </button>
          </div>
        )}
      </div>

      {/* ── Body ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '1rem 0' }}>
          <Loader2 size={18} color={GOLD} style={{ animation: 'falla-spin 0.8s linear infinite', display: 'inline-block' }} />
        </div>

      ) : hasVoted || !poll.activa ? (
        /* Results view */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {opciones.map(op => {
            const votes  = resultados[op.id] ?? 0
            const pct    = totalVotos > 0 ? Math.round((votes / totalVotos) * 100) : 0
            const isWin  = votes === maxVotes && votes > 0
            const isMine = myVote === op.id
            const voters = votersByOption[op.id] ?? []
            return (
              <div key={op.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: isMine ? 700 : 500, color: isMine ? GOLD : TEXT, display: 'flex', alignItems: 'center', gap: 5 }}>
                    {isMine && <Check size={12} color={GOLD} strokeWidth={2.5} />}
                    {op.texto}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: isWin ? GREEN : TEXT2 }}>
                    {pct}%{' '}
                    <span style={{ fontWeight: 400, color: MUTED }}>({votes})</span>
                  </span>
                </div>
                <div style={{ height: 8, background: BORDER, borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 4, width: `${pct}%`,
                    background: isMine
                      ? `linear-gradient(90deg, ${GOLD}, #8a6f1a)`
                      : isWin
                        ? `linear-gradient(90deg, ${GREEN}, #059669)`
                        : '#D1D5DB',
                    transition: 'width 0.6s ease',
                  }} />
                </div>
                {/* Voter name badges — admin + nominal only */}
                {isAdmin && !isAnonymous && voters.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                    {voters.map(v => (
                      <span key={v.uid} style={{
                        fontSize: 10, fontWeight: 600, color: TEXT2,
                        background: BG, border: `1px solid ${BORDER}`,
                        borderRadius: 20, padding: '2px 8px',
                      }}>
                        {v.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          <p style={{ margin: '4px 0 0', fontSize: 11, color: MUTED, textAlign: 'right' }}>
            {totalVotos} {totalVotos === 1 ? 'voto' : 'votos'} totales
            {hasVoted && ' · Tu voto está registrado ✓'}
          </p>
        </div>

      ) : (
        /* Voting view */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {opciones.map(op => (
            <button
              key={op.id}
              onClick={() => setSelected(op.id)}
              style={{
                width: '100%', textAlign: 'left', minHeight: 44,
                background: selected === op.id ? `${GOLD}12` : BG,
                border: `1.5px solid ${selected === op.id ? GOLD : BORDER}`,
                borderRadius: 12, padding: '10px 14px',
                fontSize: 13, fontWeight: selected === op.id ? 700 : 500,
                color: selected === op.id ? TEXT : TEXT2,
                cursor: 'pointer', transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: 10,
              }}
            >
              <div style={{
                width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                border: `2px solid ${selected === op.id ? GOLD : BORDER}`,
                background: selected === op.id ? GOLD : WHITE,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}>
                {selected === op.id && <Check size={10} color="white" strokeWidth={3} />}
              </div>
              {op.texto}
            </button>
          ))}
          <button
            onClick={handleVote}
            disabled={!selected || voting}
            style={{
              marginTop: 4, minHeight: 46,
              background: selected ? `linear-gradient(135deg, ${GOLD}, #8a6f1a)` : BORDER,
              border: 'none', borderRadius: 12,
              color: selected ? 'white' : MUTED,
              fontSize: 13, fontWeight: 800,
              cursor: selected ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              boxShadow: selected ? `0 4px 14px rgba(212,175,55,0.3)` : 'none',
              transition: 'all 0.2s',
            }}
          >
            {voting
              ? <Loader2 size={15} style={{ animation: 'falla-spin 0.8s linear infinite' }} />
              : '🗳️ Votar'}
          </button>
        </div>
      )}
    </Card>
  )
}

// ─── Admin create poll form ────────────────────────────────────────────────────
function CreatePollForm({ onCreated }) {
  const [open,        setOpen]        = useState(false)
  const [pregunta,    setPregunta]    = useState('')
  const [opciones,    setOpciones]    = useState(['', ''])
  const [isAnonymous, setIsAnonymous] = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')

  const addOpcion    = () => setOpciones(o => [...o, ''])
  const removeOpcion = (i) => setOpciones(o => o.filter((_, j) => j !== i))
  const setOpcion    = (i, v) => setOpciones(o => o.map((x, j) => j === i ? v : x))

  const handleCreate = async (e) => {
    e.preventDefault()
    const filled = opciones.map(s => s.trim()).filter(Boolean)
    if (!pregunta.trim()) { setError('Escribe la pregunta.'); return }
    if (filled.length < 2) { setError('Necesitas al menos 2 opciones.'); return }
    setSaving(true); setError('')
    try {
      await addDoc(collection(db, 'votaciones'), {
        pregunta:    pregunta.trim(),
        opciones:    filled.map((texto, i) => ({ id: `op_${i}`, texto })),
        resultados:  Object.fromEntries(filled.map((_, i) => [`op_${i}`, 0])),
        totalVotos:  0,
        isAnonymous,
        activa:      true,
        createdAt:   serverTimestamp(),
      })
      setPregunta(''); setOpciones(['', '']); setIsAnonymous(true); setOpen(false)
      onCreated?.()
    } catch (err) {
      setError(err?.message || 'Error al crear la votación.')
    } finally { setSaving(false) }
  }

  const inputStyle = {
    width: '100%', padding: '10px 14px',
    border: `1.5px solid ${BORDER}`, borderRadius: 12,
    fontSize: 14, fontFamily: 'inherit', color: TEXT,
    background: BG, boxSizing: 'border-box', outline: 'none',
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          width: '100%', minHeight: 48,
          background: `${GOLD}12`, border: `1.5px dashed ${GOLD}60`,
          borderRadius: 16, color: GOLD, fontSize: 13, fontWeight: 700,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        }}
      >
        <Plus size={16} /> Nueva votación
      </button>
    )
  }

  return (
    <Card style={{ border: `1.5px solid ${GOLD}40` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>Nueva votación</span>
        <button
          onClick={() => setOpen(false)}
          style={{ background: BORDER, border: 'none', borderRadius: 8, padding: 6, cursor: 'pointer', display: 'flex', minHeight: 'auto', minWidth: 'auto' }}
        >
          <X size={15} color={MUTED} />
        </button>
      </div>

      <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Pregunta */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: TEXT2, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
            Pregunta *
          </label>
          <input
            required value={pregunta} onChange={e => setPregunta(e.target.value)}
            placeholder="¿Cuál es tu opinión sobre...?"
            style={inputStyle}
            onFocus={e => e.target.style.borderColor = GOLD}
            onBlur={e => e.target.style.borderColor = BORDER}
          />
        </div>

        {/* Opciones */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: TEXT2, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
            Opciones *
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {opciones.map((op, i) => (
              <div key={i} style={{ display: 'flex', gap: 8 }}>
                <input
                  value={op} onChange={e => setOpcion(i, e.target.value)}
                  placeholder={`Opción ${i + 1}`}
                  style={{ flex: 1, padding: '9px 12px', border: `1.5px solid ${BORDER}`, borderRadius: 10, fontSize: 13, fontFamily: 'inherit', color: TEXT, background: BG, outline: 'none' }}
                  onFocus={e => e.target.style.borderColor = GOLD}
                  onBlur={e => e.target.style.borderColor = BORDER}
                />
                {opciones.length > 2 && (
                  <button
                    type="button" onClick={() => removeOpcion(i)}
                    style={{ background: 'rgba(239,68,68,0.08)', border: '1.5px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '0 10px', cursor: 'pointer', minHeight: 'auto', minWidth: 'auto', color: '#EF4444', display: 'flex', alignItems: 'center' }}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            ))}
            {opciones.length < 6 && (
              <button
                type="button" onClick={addOpcion}
                style={{ background: BG, border: `1.5px dashed ${BORDER}`, borderRadius: 10, padding: '8px', fontSize: 12, color: TEXT2, cursor: 'pointer', minHeight: 'auto', fontWeight: 600 }}
              >
                + Añadir opción
              </button>
            )}
          </div>
        </div>

        {/* Anonymous toggle */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 12px',
          background: isAnonymous ? `${GOLD}08` : 'rgba(107,114,128,0.05)',
          border: `1.5px solid ${isAnonymous ? `${GOLD}35` : BORDER}`,
          borderRadius: 12, transition: 'all 0.2s',
        }}>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: TEXT }}>
              {isAnonymous ? '🔒 Votación anónima' : '👁 Votación nominal'}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: TEXT2 }}>
              {isAnonymous
                ? 'Nadie verá quién ha votado qué'
                : 'Los admins verán el nombre de cada votante'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsAnonymous(v => !v)}
            style={{
              width: 46, height: 26, flexShrink: 0,
              background: isAnonymous ? GOLD : 'rgba(0,0,0,0.12)',
              border: 'none', borderRadius: 13,
              position: 'relative', cursor: 'pointer',
              transition: 'background 0.22s', minHeight: 'auto', minWidth: 'auto',
            }}
            role="switch" aria-checked={isAnonymous}
          >
            <div style={{
              position: 'absolute', top: 3,
              left: isAnonymous ? 23 : 3,
              width: 20, height: 20,
              background: WHITE, borderRadius: '50%',
              transition: 'left 0.22s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.22)',
            }} />
          </button>
        </div>

        {error && <p style={{ margin: 0, fontSize: 12, color: RED, fontWeight: 600 }}>{error}</p>}

        <button
          type="submit" disabled={saving}
          style={{
            minHeight: 46,
            background: saving ? `${GOLD}50` : `linear-gradient(135deg, ${GOLD}, #8a6f1a)`,
            border: 'none', borderRadius: 12,
            color: 'white', fontSize: 13, fontWeight: 800,
            cursor: saving ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            boxShadow: `0 4px 14px rgba(212,175,55,0.3)`,
          }}
        >
          {saving
            ? <Loader2 size={15} style={{ animation: 'falla-spin 0.8s linear infinite' }} />
            : '✅ Publicar votación'}
        </button>
      </form>
    </Card>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function Votaciones({ userId, isAdmin }) {
  const { fallero } = useAuth()
  const falleroNombre = fallero
    ? `${fallero.nombre}${fallero.apellidos ? ' ' + fallero.apellidos : ''}`.trim()
    : ''

  const [polls,   setPolls]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(collection(db, 'votaciones'), orderBy('createdAt', 'desc'))
    return onSnapshot(q,
      snap => { setPolls(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false) },
      () => setLoading(false),
    )
  }, [])

  const activePolls = polls.filter(p => p.activa)
  const closedPolls = polls.filter(p => !p.activa)

  return (
    <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 26, fontWeight: 700, color: TEXT, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Votaciones</h2>
        <p style={{ fontSize: 13, color: TEXT2, margin: 0 }}>Opina en tiempo real con la comisión</p>
      </div>

      {isAdmin && <CreatePollForm />}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem 0' }}>
          <Loader2 size={24} color={GOLD} style={{ animation: 'falla-spin 0.8s linear infinite', display: 'inline-block' }} />
        </div>
      ) : polls.length === 0 ? (
        <Card>
          <div style={{ textAlign: 'center', padding: '2rem 0', color: MUTED }}>
            <BarChart2 size={36} color={BORDER} style={{ marginBottom: 12, display: 'inline-block' }} />
            <p style={{ margin: 0, fontSize: 14 }}>No hay votaciones activas</p>
            {isAdmin && <p style={{ margin: '4px 0 0', fontSize: 12 }}>Crea la primera desde el botón de arriba</p>}
          </div>
        </Card>
      ) : (
        <>
          {activePolls.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {activePolls.map(poll => (
                <PollCard
                  key={poll.id} poll={poll}
                  userId={userId} isAdmin={isAdmin} falleroNombre={falleroNombre}
                />
              ))}
            </div>
          )}

          {closedPolls.length > 0 && (
            <>
              <p style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '4px 0 0' }}>
                Cerradas
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {closedPolls.map(poll => (
                  <PollCard
                    key={poll.id} poll={poll}
                    userId={userId} isAdmin={isAdmin} falleroNombre={falleroNombre}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
