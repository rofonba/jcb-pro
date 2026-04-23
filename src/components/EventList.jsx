import { useState, useEffect, useCallback } from 'react'
import {
  collection, query, orderBy, onSnapshot,
  setDoc, deleteDoc, serverTimestamp, getDocs, where, doc, updateDoc,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import {
  Plus, MapPin, Calendar, Users, ChevronRight,
  X, Check, AlertCircle, Loader2, BarChart2, Pencil, Trash2,
} from 'lucide-react'
import AdminEventControl from './AdminEventControl'

const GOLD  = '#D4AF37'
const RED   = '#CE1126'
const GREEN = '#10b981'
const CARD  = '#141414'

const EVENT_TYPES = {
  comida:  { emoji: '🍽️', label: 'Comida',  color: GOLD },
  cena:    { emoji: '🌙', label: 'Cena',    color: '#6366f1' },
  acto:    { emoji: '🎭', label: 'Acto',    color: RED },
  reunion: { emoji: '📋', label: 'Reunión', color: '#6B7280' },
}

const sharedInput = {
  width: '100%', padding: '0.8rem 1rem',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '12px', color: 'white', fontSize: '1rem',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
}
const sharedLabel = {
  display: 'block', color: 'rgba(255,255,255,0.45)',
  fontSize: '0.7rem', fontWeight: '700',
  letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '0.4rem',
}

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2)
  return `${String(h).padStart(2, '0')}:${i % 2 === 0 ? '00' : '30'}`
})

function fmtDate(f) {
  if (!f) return '—'
  const d = f?.toDate ? f.toDate() : new Date(f)
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
}
function fmtTime(f) {
  if (!f) return ''
  const d = f?.toDate ? f.toDate() : new Date(f)
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

// ─── Overlay / bottom sheet ──────────────────────────────────────────────────
function Overlay({ children, onClose, scrollable = false }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ width: '100%', maxWidth: '480px', background: CARD, border: '1px solid rgba(212,175,55,0.18)', borderRadius: '24px 24px 0 0', padding: `1.5rem 1.5rem calc(1.5rem + env(safe-area-inset-bottom))`, animation: 'falla-slideUp 0.25s ease-out', ...(scrollable ? { maxHeight: '90dvh', overflowY: 'auto' } : {}) }}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

// ─── Event card ───────────────────────────────────────────────────────────────
function EventCard({ event, onPress, isRegistered, isAdmin, onAdminPress, onEditPress, onCancelPress, onDeletePress, index = 0 }) {
  const t      = EVENT_TYPES[event.tipo] ?? EVENT_TYPES.acto
  const ocupadas = event.plazasOcupadas ?? 0
  const pct    = event.plazasTotal ? Math.min(100, (ocupadas / event.plazasTotal) * 100) : null
  const isFull = event.plazasTotal && ocupadas >= event.plazasTotal && !isRegistered

  return (
    <div
      role="button" tabIndex={0}
      onClick={() => onPress(event)}
      onKeyDown={e => e.key === 'Enter' && onPress(event)}
      style={{
        width: '100%', textAlign: 'left',
        background: isRegistered ? 'rgba(16,185,129,0.04)' : CARD,
        border: `1px solid ${isRegistered ? 'rgba(16,185,129,0.35)' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: '18px', padding: 0,
        marginBottom: '0.75rem', cursor: 'pointer',
        transition: 'border-color 0.15s, transform 0.12s',
        animation: 'falla-cardEnter 0.35s ease-out both',
        animationDelay: `${index * 0.07}s`,
        outline: 'none', overflow: 'hidden',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = isRegistered ? 'rgba(16,185,129,0.6)' : 'rgba(212,175,55,0.35)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = isRegistered ? 'rgba(16,185,129,0.35)' : 'rgba(255,255,255,0.07)'; e.currentTarget.style.transform = 'translateY(0)' }}
    >
      {event.imagenUrl && (
        <img
          src={event.imagenUrl} alt={event.titulo}
          style={{ width: '100%', height: '130px', objectFit: 'cover', display: 'block' }}
          onError={e => { e.target.style.display = 'none' }}
        />
      )}
      <div style={{ padding: '1rem 1.1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', marginBottom: '0.75rem' }}>
        <div style={{ width: '44px', height: '44px', flexShrink: 0, background: `${t.color}1a`, border: `1px solid ${t.color}28`, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem' }}>
          {t.emoji}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.95rem', fontWeight: '700', color: 'white', lineHeight: 1.3, marginBottom: '0.2rem' }}>
            {event.titulo}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-block', padding: '0.1rem 0.45rem', background: `${t.color}20`, borderRadius: '6px', fontSize: '0.6rem', fontWeight: '700', letterSpacing: '0.08em', color: t.color, textTransform: 'uppercase' }}>
              {t.label}
            </span>
            {isRegistered && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.22rem 0.65rem', background: 'rgba(16,185,129,0.15)', border: '1.5px solid rgba(16,185,129,0.5)', borderRadius: '8px', fontSize: '0.65rem', fontWeight: '800', color: GREEN, letterSpacing: '0.05em' }}>
                ✅ ESTÁS APUNTADO
              </span>
            )}
            {isFull && (
              <span style={{ display: 'inline-block', padding: '0.1rem 0.45rem', background: 'rgba(206,17,38,0.15)', border: '1px solid rgba(206,17,38,0.3)', borderRadius: '6px', fontSize: '0.6rem', fontWeight: '800', color: RED, letterSpacing: '0.08em' }}>
                COMPLETO
              </span>
            )}
          </div>
        </div>
        {/* Admin buttons or chevron */}
        {isAdmin ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', flexShrink: 0 }}>
            <button
              onClick={e => { e.stopPropagation(); onAdminPress(event) }}
              style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.25)', borderRadius: '8px', padding: '0.35rem 0.55rem', color: GOLD, display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', minHeight: 'auto', minWidth: 'auto', fontSize: '0.6rem', fontWeight: '700', transition: 'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(212,175,55,0.2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(212,175,55,0.1)'}
            >
              <BarChart2 size={12} /><span>Inscritos</span>
            </button>
            <button
              onClick={e => { e.stopPropagation(); onEditPress(event) }}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '0.35rem 0.55rem', color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', minHeight: 'auto', minWidth: 'auto', fontSize: '0.6rem', fontWeight: '700', transition: 'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
            >
              <Pencil size={12} /><span>Editar</span>
            </button>
            <button
              onClick={e => { e.stopPropagation(); onDeletePress(event) }}
              style={{ background: 'rgba(206,17,38,0.08)', border: '1px solid rgba(206,17,38,0.25)', borderRadius: '8px', padding: '0.35rem 0.55rem', color: RED, display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', minHeight: 'auto', minWidth: 'auto', fontSize: '0.6rem', fontWeight: '700', transition: 'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(206,17,38,0.18)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(206,17,38,0.08)'}
            >
              <Trash2 size={12} /><span>Borrar</span>
            </button>
          </div>
        ) : (
          <ChevronRight size={17} color="rgba(255,255,255,0.2)" style={{ flexShrink: 0, marginTop: '3px' }} />
        )}
      </div>

      {/* Meta */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.28rem', marginBottom: '0.75rem' }}>
        {event.fecha && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
            <Calendar size={12} color="rgba(255,255,255,0.28)" />
            <span style={{ fontSize: '0.77rem', color: 'rgba(255,255,255,0.45)', textTransform: 'capitalize' }}>
              {fmtDate(event.fecha)}
            </span>
            {fmtTime(event.fecha) && (
              <span style={{ display: 'inline-block', padding: '0.1rem 0.45rem', background: 'rgba(212,175,55,0.14)', border: '1px solid rgba(212,175,55,0.28)', borderRadius: '6px', fontSize: '0.68rem', fontWeight: '700', color: GOLD, letterSpacing: '0.04em' }}>
                {fmtTime(event.fecha)}
              </span>
            )}
          </div>
        )}
        {event.lugar && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <MapPin size={12} color="rgba(255,255,255,0.28)" />
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.lugar)}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ fontSize: '0.77rem', color: 'rgba(212,175,55,0.7)', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: '2px' }}
            >
              {event.lugar}
            </a>
          </div>
        )}
        {event.plazasTotal && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <Users size={12} color="rgba(255,255,255,0.28)" />
            <span style={{ fontSize: '0.77rem', color: 'rgba(255,255,255,0.45)' }}>{ocupadas} / {event.plazasTotal} plazas</span>
          </div>
        )}
      </div>

      {/* Menu */}
      {event.menu && (
        <div style={{ marginBottom: '0.75rem', padding: '0.7rem 0.9rem', background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.18)', borderRadius: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
            <span style={{ fontSize: '0.85rem' }}>📜</span>
            <span style={{ fontSize: '0.68rem', fontWeight: '700', color: '#D4AF37', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Menú</span>
          </div>
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.55, whiteSpace: 'pre-line' }}>
            {event.menu}
          </p>
        </div>
      )}

      {/* Aforo bar */}
      {pct !== null && (
        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: '4px', height: '3px' }}>
            <div style={{ width: `${pct}%`, height: '100%', borderRadius: '4px', background: pct >= 100 ? RED : pct > 80 ? RED : pct > 50 ? GOLD : GREEN, transition: 'width 0.4s ease' }} />
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.7rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <span style={{ fontSize: '1.1rem', fontWeight: '800', color: GOLD }}>
          {event.precio != null ? `${event.precio} €` : 'Gratuito'}
        </span>
        {isRegistered ? (
          <button
            onClick={e => { e.stopPropagation(); onCancelPress(event) }}
            style={{ padding: '0.38rem 1rem', background: 'transparent', border: `1.5px solid rgba(206,17,38,0.38)`, borderRadius: '8px', fontSize: '0.73rem', fontWeight: '700', color: 'rgba(220,38,38,0.8)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', minHeight: 'auto', transition: 'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(206,17,38,0.08)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <X size={12} /> Anular inscripción
          </button>
        ) : isFull ? (
          <span style={{ padding: '0.38rem 0.9rem', background: 'rgba(206,17,38,0.1)', border: '1px solid rgba(206,17,38,0.25)', borderRadius: '8px', fontSize: '0.73rem', fontWeight: '700', color: 'rgba(206,17,38,0.7)' }}>
            Aforo completo
          </span>
        ) : (
          <button
            onClick={e => { e.stopPropagation(); onPress(event) }}
            style={{ padding: '0.38rem 1rem', background: `linear-gradient(135deg, ${GOLD}, #8a6f1a)`, border: 'none', borderRadius: '8px', fontSize: '0.73rem', fontWeight: '700', color: 'white', cursor: 'pointer', minHeight: 'auto', boxShadow: `0 2px 10px rgba(212,175,55,0.28)` }}
          >
            Apuntarse →
          </button>
        )}
      </div>
      </div>
    </div>
  )
}

// ─── Registration / Cancellation modal ───────────────────────────────────────
function RegistrationModal({ event, isRegistered, onClose, onSuccess, onCancelled }) {
  const { user, fallero } = useAuth()
  const isAdmin = fallero?.rol === 'admin'
  const myName  = fallero
    ? `${fallero.nombre} ${fallero.apellidos ?? ''}`.trim()
    : (user?.email?.split('@')[0] ?? 'Yo')

  const [adultos,    setAdultos]    = useState([]) // [{nombre:''}]
  const [ninos,      setNinos]      = useState([]) // [{nombre:''}]
  const [nota,       setNota]       = useState('')
  const [alergias,   setAlergias]   = useState('')
  const [status,     setStatus]     = useState(isRegistered ? 'duplicate' : 'clean')
  const [saving,     setSaving]     = useState(false)

  const [inscritosCount, setInscritosCount] = useState(null)
  const [myIns,       setMyIns]     = useState(null)
  const [loadingMine, setLoadingMine] = useState(isRegistered)
  const [cancelling,  setCancelling] = useState(false)

  // Modify-count flow
  const [modMode,  setModMode]  = useState(false)
  const [newAcomp, setNewAcomp] = useState(0)
  const [updating, setUpdating] = useState(false)

  const [cancelErr, setCancelErr] = useState('')

  // Admin external inscription
  const [showExt,   setShowExt]   = useState(false)
  const [extNombre, setExtNombre] = useState('')
  const [extEsHijo, setExtEsHijo] = useState(false)
  const [savingExt, setSavingExt] = useState(false)
  const [extDone,   setExtDone]   = useState(false)

  useEffect(() => {
    const q = query(collection(db, 'inscripciones'), where('eventId', '==', event.id))
    return onSnapshot(q, snap => {
      setInscritosCount(snap.docs.reduce((s, d) => s + (d.data().totalPersonas ?? 1), 0))
    })
  }, [event.id])

  useEffect(() => {
    if (!isRegistered || !user?.uid) return
    getDocs(query(
      collection(db, 'inscripciones'),
      where('eventId', '==', event.id),
      where('uid', '==', user.uid),
    )).then(snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      const mine = docs.find(d => !d.esManual) ?? docs[0] ?? null
      setMyIns(mine)
      if (mine) setNewAcomp(mine.acompañantes ?? 0)
    }).finally(() => setLoadingMine(false))
  }, [event.id, user?.uid, isRegistered])

  const plazasTotal   = event.plazasTotal ?? null
  const disponibles   = plazasTotal != null ? Math.max(0, plazasTotal - (inscritosCount ?? 0)) : Infinity
  const totalPersonas = 1 + adultos.length + ninos.length
  const wouldExceed   = plazasTotal != null && totalPersonas > disponibles
  const isAforoFull   = plazasTotal != null && disponibles <= 0
  const t             = EVENT_TYPES[event.tipo] ?? EVENT_TYPES.acto
  const totalCost     = event.precio != null ? event.precio * totalPersonas : null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (saving || wouldExceed || isAforoFull) return
    setSaving(true)
    if (plazasTotal) {
      const snap = await getDocs(query(collection(db, 'inscripciones'), where('eventId', '==', event.id)))
      const live = snap.docs.reduce((s, d) => s + (d.data().totalPersonas ?? 1), 0)
      if (live + totalPersonas > plazasTotal) { setInscritosCount(live); setSaving(false); return }
    }
    try {
      await setDoc(doc(db, 'inscripciones', `${user.uid}_${event.id}`), {
        eventId: event.id, eventoTitulo: event.titulo,
        uid: user.uid, nombre: myName,
        numFallero: fallero?.numero ?? '—',
        esHijo: false, esManual: false,
        acompañantesAdultos: adultos.map(a => ({ nombre: a.nombre.trim() || 'Adulto' })),
        acompañantesNinos:   ninos.map(n => ({ nombre: n.nombre.trim() || 'Niño/a' })),
        acompañantes: adultos.length + ninos.length,
        totalPersonas,
        nota: nota.trim() || null,
        alergias: (['comida', 'cena'].includes(event.tipo)) ? (alergias.trim() || null) : null,
        telefono:   fallero?.telefono ?? null,
        createdAt:  serverTimestamp(),
      })
      setStatus('saved')
      setTimeout(onSuccess, 900)
    } catch { setSaving(false) }
  }

  const handleCancel = async () => {
    if (!myIns || cancelling) return
    setCancelling(true)
    setCancelErr('')
    try {
      await deleteDoc(doc(db, 'inscripciones', myIns.id))
      setStatus('cancelled')
      setTimeout(() => onCancelled(event.id), 800)
    } catch (err) {
      setCancelErr(err?.message || 'Error al anular. Inténtalo de nuevo.')
    } finally { setCancelling(false) }
  }

  const handleModify = async () => {
    if (!myIns || updating) return
    setUpdating(true)
    try {
      await updateDoc(doc(db, 'inscripciones', myIns.id), {
        acompañantes: newAcomp,
        totalPersonas: 1 + newAcomp,
      })
      setMyIns(prev => ({ ...prev, acompañantes: newAcomp, totalPersonas: 1 + newAcomp }))
      setModMode(false)
    } catch {} finally { setUpdating(false) }
  }

  const handleExternal = async (e) => {
    e.preventDefault()
    const nombre = extNombre.trim()
    if (!nombre || savingExt) return
    setSavingExt(true)
    try {
      await addDoc(collection(db, 'inscripciones'), {
        eventId: event.id, eventoTitulo: event.titulo,
        uid: 'manual', nombre, numFallero: '—',
        esHijo: extEsHijo, esManual: true,
        acompañantes: 0, totalPersonas: 1,
        nota: null, alergias: null, createdAt: serverTimestamp(),
      })
      setExtDone(true)
      setTimeout(() => { setExtDone(false); setExtNombre(''); setExtEsHijo(false); setShowExt(false) }, 1400)
    } catch {} finally { setSavingExt(false) }
  }

  const showAdminSection = isAdmin && status !== 'saved' && status !== 'cancelled'

  return (
    <Overlay onClose={onClose} scrollable>
      <div style={{ width: '40px', height: '4px', background: 'rgba(255,255,255,0.12)', borderRadius: '2px', margin: '0 auto 1.25rem' }} />

      {/* Event header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div style={{ width: '50px', height: '50px', flexShrink: 0, background: `${t.color}1a`, border: `1px solid ${t.color}28`, borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>
          {t.emoji}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '800', color: 'white', lineHeight: 1.25 }}>{event.titulo}</h3>
          <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: 'rgba(255,255,255,0.38)', textTransform: 'capitalize' }}>
            {fmtDate(event.fecha)}{fmtTime(event.fecha) && ` · ${fmtTime(event.fecha)}`}
          </p>
        </div>
        <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '10px', padding: '0.5rem', color: 'rgba(255,255,255,0.35)', display: 'flex', cursor: 'pointer', minHeight: 'auto', minWidth: 'auto' }}>
          <X size={18} />
        </button>
      </div>

      {/* ── Duplicate: my inscription + modify / cancel ─── */}
      {status === 'duplicate' && (
        <div>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.78rem', fontWeight: '700', color: GREEN, letterSpacing: '0.04em' }}>
            ✅ Tu inscripción confirmada:
          </p>
          {loadingMine ? (
            <div style={{ textAlign: 'center', padding: '1rem', color: 'rgba(255,255,255,0.3)', fontSize: '0.85rem' }}>Cargando…</div>
          ) : myIns ? (
            <div>
              <div style={{ padding: '0.85rem 1rem', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '14px', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: modMode ? '0.9rem' : 0 }}>
                  <span style={{ fontSize: '1.1rem' }}>👤</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: '700', color: 'white' }}>{myIns.nombre}</div>
                    <div style={{ fontSize: '0.73rem', color: GREEN, marginTop: 2 }}>
                      {(myIns.acompañantes ?? 0) > 0
                        ? `Tú + ${myIns.acompañantes} acompañante${myIns.acompañantes > 1 ? 's' : ''} · Total ${1 + myIns.acompañantes} personas`
                        : 'Solo tú · 1 persona confirmada'}
                    </div>
                  </div>
                </div>
                {modMode && (
                  <div style={{ paddingTop: '0.9rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    <label style={{ ...sharedLabel, marginBottom: '0.5rem' }}>Nuevo número de acompañantes</label>
                    <select
                      value={newAcomp}
                      onChange={e => setNewAcomp(Number(e.target.value))}
                      style={{ ...sharedInput, marginBottom: '0.75rem', cursor: 'pointer' }}
                    >
                      {[0,1,2,3,4,5].map(n => (
                        <option key={n} value={n} style={{ background: CARD }}>
                          {n === 0 ? '0 acompañantes (solo yo)' : `${n} acompañante${n > 1 ? 's' : ''} · ${1+n} personas`}
                        </option>
                      ))}
                    </select>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button type="button" onClick={handleModify} disabled={updating}
                        style={{ flex: 1, minHeight: '42px', background: updating ? 'rgba(212,175,55,0.2)' : `linear-gradient(135deg, ${GOLD}, #8a6f1a)`, border: 'none', borderRadius: '10px', color: 'white', fontSize: '0.85rem', fontWeight: '700', cursor: updating ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                      >
                        {updating ? <Loader2 size={15} style={{ animation: 'falla-spin 0.8s linear infinite' }} /> : '💾 Confirmar'}
                      </button>
                      <button type="button" onClick={() => setModMode(false)}
                        style={{ minHeight: '42px', padding: '0 1rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', color: 'rgba(255,255,255,0.5)', fontSize: '0.82rem', fontWeight: '600', cursor: 'pointer' }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {!modMode && (
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <button type="button" onClick={() => { setNewAcomp(myIns.acompañantes ?? 0); setModMode(true) }}
                    style={{ flex: 1, minHeight: '44px', background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.25)', borderRadius: '10px', color: GOLD, fontSize: '0.82rem', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                  >
                    ✏️ Modificar número
                  </button>
                  <button type="button" onClick={handleCancel} disabled={cancelling}
                    style={{ flex: 1, minHeight: '44px', background: 'rgba(206,17,38,0.08)', border: '1px solid rgba(206,17,38,0.28)', borderRadius: '10px', color: RED, fontSize: '0.82rem', fontWeight: '700', cursor: cancelling ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                  >
                    {cancelling ? <Loader2 size={14} style={{ animation: 'falla-spin 0.8s linear infinite' }} /> : <><X size={13} /> Anular</>}
                  </button>
                </div>
              )}
            </div>
          ) : null}
          {cancelErr && (
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.72rem', color: RED, textAlign: 'center' }}>
              ⚠️ {cancelErr}
            </p>
          )}
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.7rem', color: 'rgba(255,255,255,0.22)', textAlign: 'center' }}>
            Al anular, la plaza queda libre automáticamente.
          </p>
        </div>
      )}

      {/* ── Cancelled ─── */}
      {status === 'cancelled' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem 1rem', gap: '0.75rem' }}>
          <div style={{ width: '58px', height: '58px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Check size={28} color="rgba(255,255,255,0.5)" strokeWidth={2.5} />
          </div>
          <p style={{ margin: 0, fontWeight: '800', fontSize: '1rem', color: 'rgba(255,255,255,0.55)' }}>
            Inscripción anulada correctamente
          </p>
        </div>
      )}

      {/* ── Saved ─── */}
      {status === 'saved' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem 1rem', gap: '0.75rem' }}>
          <div style={{ width: '58px', height: '58px', background: `${GREEN}18`, border: `1px solid ${GREEN}35`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Check size={28} color={GREEN} strokeWidth={2.5} />
          </div>
          <p style={{ margin: 0, fontWeight: '800', fontSize: '1rem', color: GREEN }}>
            ¡{totalPersonas > 1 ? `${totalPersonas} personas inscritas` : 'Inscripción confirmada'}! 🎉
          </p>
        </div>
      )}

      {/* ── Form (clean) ─── */}
      {status === 'clean' && (
        <form onSubmit={handleSubmit}>
          {plazasTotal && inscritosCount !== null && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.9rem', background: isAforoFull ? 'rgba(206,17,38,0.1)' : 'rgba(255,255,255,0.04)', border: `1px solid ${isAforoFull ? 'rgba(206,17,38,0.3)' : 'rgba(255,255,255,0.08)'}`, borderRadius: '10px', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Users size={13} color={isAforoFull ? RED : 'rgba(255,255,255,0.4)'} />
                <span style={{ fontSize: '0.78rem', color: isAforoFull ? RED : 'rgba(255,255,255,0.45)' }}>
                  {isAforoFull ? 'Aforo completo' : `${disponibles} ${disponibles === 1 ? 'plaza disponible' : 'plazas disponibles'}`}
                </span>
              </div>
              <span style={{ fontSize: '0.72rem', fontWeight: '700', color: isAforoFull ? RED : GOLD }}>
                {inscritosCount} / {plazasTotal}
              </span>
            </div>
          )}
          {isAforoFull ? (
            <div style={{ display: 'flex', gap: '0.65rem', padding: '1rem 1.1rem', background: 'rgba(206,17,38,0.08)', border: '1px solid rgba(206,17,38,0.28)', borderRadius: '14px' }}>
              <AlertCircle size={20} color={RED} style={{ flexShrink: 0, marginTop: '1px' }} />
              <div>
                <p style={{ margin: 0, fontWeight: '800', fontSize: '0.92rem', color: RED }}>Lo sentimos, aforo completo</p>
                <p style={{ margin: '0.3rem 0 0', fontSize: '0.78rem', color: 'rgba(255,255,255,0.38)', lineHeight: 1.4 }}>
                  No quedan plazas disponibles para este evento.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Fixed "yo" row */}
              <label style={{ ...sharedLabel, marginBottom: '0.6rem' }}>Tu inscripción</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: 'rgba(212,175,55,0.08)', border: '1.5px solid rgba(212,175,55,0.3)', borderRadius: '14px', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '1.2rem' }}>👤</span>
                <span style={{ flex: 1, fontSize: '0.9rem', fontWeight: '600', color: GOLD }}>
                  {myName} <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>· tú</span>
                </span>
                <Check size={14} color={GOLD} strokeWidth={3} />
              </div>

              {/* ── Adult companions ───────────────────────────── */}
              <label style={{ ...sharedLabel, marginBottom: '0.5rem' }}>👤 Acompañantes adultos</label>
              {adultos.map((a, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.4rem' }}>
                  <input
                    value={a.nombre}
                    onChange={e => { const next = [...adultos]; next[i] = { nombre: e.target.value }; setAdultos(next) }}
                    placeholder={`Nombre adulto ${i + 1}`}
                    style={{ ...sharedInput, flex: 1 }}
                    onFocus={e => e.target.style.borderColor = GOLD}
                    onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                  />
                  <button type="button" onClick={() => setAdultos(adultos.filter((_, j) => j !== i))}
                    style={{ background: 'rgba(206,17,38,0.08)', border: '1px solid rgba(206,17,38,0.2)', borderRadius: '8px', padding: '0 0.55rem', color: 'rgba(220,38,38,0.7)', cursor: 'pointer', display: 'flex', alignItems: 'center', minHeight: 'auto', minWidth: 'auto', flexShrink: 0 }}>
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setAdultos([...adultos, { nombre: '' }])}
                style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.14)', borderRadius: '10px', padding: '0.45rem', color: 'rgba(255,255,255,0.4)', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', minHeight: 'auto', marginBottom: '1rem' }}>
                + Añadir adulto
              </button>

              {/* ── Child companions ────────────────────────────── */}
              <label style={{ ...sharedLabel, marginBottom: '0.5rem' }}>🧒 Acompañantes niños/as</label>
              {ninos.map((n, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.4rem' }}>
                  <input
                    value={n.nombre}
                    onChange={e => { const next = [...ninos]; next[i] = { nombre: e.target.value }; setNinos(next) }}
                    placeholder={`Nombre niño/a ${i + 1}`}
                    style={{ ...sharedInput, flex: 1 }}
                    onFocus={e => e.target.style.borderColor = '#f97316'}
                    onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                  />
                  <button type="button" onClick={() => setNinos(ninos.filter((_, j) => j !== i))}
                    style={{ background: 'rgba(206,17,38,0.08)', border: '1px solid rgba(206,17,38,0.2)', borderRadius: '8px', padding: '0 0.55rem', color: 'rgba(220,38,38,0.7)', cursor: 'pointer', display: 'flex', alignItems: 'center', minHeight: 'auto', minWidth: 'auto', flexShrink: 0 }}>
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setNinos([...ninos, { nombre: '' }])}
                style={{ width: '100%', background: 'rgba(249,115,22,0.05)', border: '1px dashed rgba(249,115,22,0.22)', borderRadius: '10px', padding: '0.45rem', color: 'rgba(249,115,22,0.6)', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', minHeight: 'auto', marginBottom: '1rem' }}>
                + Añadir niño/a
              </button>

              {/* ── Breakdown summary ───────────────────────────── */}
              {(adultos.length > 0 || ninos.length > 0) && (
                <div style={{ padding: '0.85rem 1rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', marginBottom: '1rem' }}>
                  <p style={{ margin: '0 0 0.5rem', fontSize: '0.65rem', fontWeight: '700', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Resumen</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.28rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: 'rgba(255,255,255,0.6)' }}>
                      <span>👤</span><span style={{ flex: 1 }}>Tú (Adulto)</span><span style={{ fontWeight: '800', color: GOLD }}>1</span>
                    </div>
                    {adultos.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: 'rgba(255,255,255,0.6)' }}>
                        <span>👤</span><span style={{ flex: 1 }}>Adultos extra</span><span style={{ fontWeight: '800', color: '#3b82f6' }}>{adultos.length}</span>
                      </div>
                    )}
                    {ninos.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: 'rgba(255,255,255,0.6)' }}>
                        <span>🧒</span><span style={{ flex: 1 }}>Niños/as</span><span style={{ fontWeight: '800', color: '#f97316' }}>{ninos.length}</span>
                      </div>
                    )}
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '0.35rem', marginTop: '0.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem', fontWeight: '800', color: 'white' }}>
                      <span>👥</span><span style={{ flex: 1 }}>Total</span><span style={{ color: GOLD }}>{totalPersonas} {totalPersonas === 1 ? 'persona' : 'personas'}</span>
                    </div>
                  </div>
                </div>
              )}

              {wouldExceed && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 0.9rem', background: 'rgba(206,17,38,0.08)', border: '1px solid rgba(206,17,38,0.28)', borderRadius: '10px', marginBottom: '1rem' }}>
                  <AlertCircle size={14} color={RED} style={{ flexShrink: 0 }} />
                  <span style={{ color: '#ff8080', fontSize: '0.78rem' }}>
                    Solo {disponibles === 1 ? 'queda 1 plaza' : `quedan ${disponibles} plazas`}. Reduce el número.
                  </span>
                </div>
              )}

              {(event.tipo === 'comida' || event.tipo === 'cena') && (
                <>
                  <label style={sharedLabel}>🌾 Alergias / Restricciones</label>
                  <textarea
                    value={alergias} onChange={e => setAlergias(e.target.value)}
                    placeholder="Sin gluten, vegetariano, alergia a frutos secos…"
                    rows={2}
                    style={{ ...sharedInput, resize: 'vertical', marginBottom: '1rem' }}
                    onFocus={e => e.target.style.borderColor = GOLD}
                    onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                  />
                </>
              )}

              <label style={sharedLabel}>Nota (opcional)</label>
              <textarea value={nota} onChange={e => setNota(e.target.value)} placeholder="Menú infantil, silla de ruedas…" rows={2} style={{ ...sharedInput, resize: 'vertical', marginBottom: '1.25rem' }} onFocus={e => e.target.style.borderColor = GOLD} onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'} />

              {totalCost !== null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'rgba(212,175,55,0.07)', border: '1px solid rgba(212,175,55,0.18)', borderRadius: '12px', marginBottom: '1.25rem' }}>
                  <span style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.4)' }}>{totalPersonas} × {event.precio} €</span>
                  <span style={{ fontSize: '1.1rem', fontWeight: '800', color: GOLD }}>Total: {totalCost} €</span>
                </div>
              )}

              <button type="submit" disabled={saving || wouldExceed}
                className={saving || wouldExceed ? '' : 'btn-shimmer'}
                style={{
                  width: '100%', minHeight: '52px',
                  background: saving || wouldExceed ? 'rgba(206,17,38,0.35)' : `linear-gradient(135deg, ${RED}, #a00d1e)`,
                  border: 'none', borderRadius: '14px', color: 'white', fontSize: '1rem', fontWeight: '800',
                  cursor: saving || wouldExceed ? 'not-allowed' : 'pointer',
                  boxShadow: saving || wouldExceed ? 'none' : `0 6px 24px rgba(206,17,38,0.35)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                }}>
                {saving
                  ? <Loader2 size={18} style={{ animation: 'falla-spin 0.8s linear infinite' }} />
                  : `✅ Confirmar${totalPersonas > 1 ? ` (${totalPersonas} personas)` : ''}`}
              </button>
            </>
          )}
        </form>
      )}

      {/* ── Admin: inscribir externo ─── */}
      {showAdminSection && (
        <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <button
            type="button"
            onClick={() => { setShowExt(v => !v); setExtDone(false) }}
            style={{
              width: '100%', minHeight: '42px',
              background: showExt ? 'rgba(129,140,248,0.12)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${showExt ? 'rgba(129,140,248,0.35)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: '12px', color: showExt ? '#818cf8' : 'rgba(255,255,255,0.45)',
              fontSize: '0.82rem', fontWeight: '700', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
              transition: 'all 0.2s',
            }}
          >
            ➕ Inscribir externo
          </button>
          {showExt && (
            <form
              onSubmit={handleExternal}
              style={{ marginTop: '0.75rem', padding: '1rem', background: 'rgba(129,140,248,0.06)', border: '1px solid rgba(129,140,248,0.2)', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
            >
              {extDone ? (
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
                      value={extNombre} onChange={e => setExtNombre(e.target.value)}
                      placeholder="Ej: María García López"
                      style={sharedInput}
                      onFocus={e => e.target.style.borderColor = '#818cf8'}
                      onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: '700', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                      Tipo
                    </label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {[{ val: false, label: '👤 Adulto' }, { val: true, label: '👦 Infantil' }].map(({ val, label }) => (
                        <button key={String(val)} type="button" onClick={() => setExtEsHijo(val)}
                          style={{ flex: 1, padding: '0.55rem 0.5rem', background: extEsHijo === val ? 'rgba(129,140,248,0.15)' : 'rgba(255,255,255,0.04)', border: `1.5px solid ${extEsHijo === val ? 'rgba(129,140,248,0.5)' : 'rgba(255,255,255,0.1)'}`, borderRadius: '10px', color: extEsHijo === val ? '#818cf8' : 'rgba(255,255,255,0.4)', fontSize: '0.78rem', fontWeight: '700', cursor: 'pointer', minHeight: 'auto' }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button type="submit" disabled={savingExt}
                    style={{ minHeight: '44px', background: savingExt ? 'rgba(129,140,248,0.2)' : 'rgba(129,140,248,0.85)', border: 'none', borderRadius: '12px', color: 'white', fontSize: '0.88rem', fontWeight: '700', cursor: savingExt ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                    {savingExt ? <Loader2 size={15} style={{ animation: 'falla-spin 0.8s linear infinite' }} /> : '➕ Añadir como invitado'}
                  </button>
                </>
              )}
            </form>
          )}
        </div>
      )}
    </Overlay>
  )
}

// ─── Admin event form (create & edit) ────────────────────────────────────────
function EventFormModal({ onClose, onCreated, event: editEvent = null }) {
  const isEditing = !!editEvent
  const { fallero } = useAuth()
  const isPrivileged = fallero?.rol === 'admin' || fallero?.rol === 'directiva'

  const [form, setForm] = useState(() => {
    if (!editEvent) return { titulo: '', tipo: 'comida', fecha: '', hora: '', lugar: '', precio: '', plazasTotal: '', descripcion: '', imagenUrl: '', videoUrl: '', menu: '', notificar: false }
    const d = editEvent.fecha?.toDate ? editEvent.fecha.toDate() : editEvent.fecha ? new Date(editEvent.fecha) : null
    const pad = n => String(n).padStart(2, '0')
    return {
      titulo:      editEvent.titulo ?? '',
      tipo:        editEvent.tipo ?? 'comida',
      fecha:       d ? `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` : '',
      hora:        d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '',
      lugar:       editEvent.lugar ?? '',
      precio:      editEvent.precio != null ? String(editEvent.precio) : '',
      plazasTotal: editEvent.plazasTotal != null ? String(editEvent.plazasTotal) : '',
      descripcion: editEvent.descripcion ?? '',
      imagenUrl:   editEvent.imagenUrl ?? '',
      videoUrl:    editEvent.videoUrl ?? '',
      menu:        editEvent.menu ?? '',
      notificar:   editEvent.notificar ?? false,
    }
  })
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const fg  = e => e.target.style.borderColor = GOLD
  const fb  = e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'

  const handleDelete = async () => {
    setLoading(true)
    try {
      const insSnap = await getDocs(query(collection(db, 'inscripciones'), where('eventId', '==', editEvent.id)))
      await Promise.all(insSnap.docs.map(d => deleteDoc(d.ref)))
      await deleteDoc(doc(db, 'eventos', editEvent.id))
      onCreated()
    } catch {
      setError('Error al eliminar el evento.')
      setLoading(false)
      setConfirmDelete(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      const fechaDate = (form.fecha && form.hora)
        ? new Date(`${form.fecha}T${form.hora}`)
        : form.fecha ? new Date(`${form.fecha}T00:00`) : null
      const payload = {
        titulo:      form.titulo.trim(),
        tipo:        form.tipo,
        fecha:       fechaDate,
        lugar:       form.lugar.trim() || null,
        precio:      form.precio !== '' ? parseFloat(form.precio) : null,
        plazasTotal: form.plazasTotal !== '' ? parseInt(form.plazasTotal) : null,
        descripcion: form.descripcion.trim() || null,
        imagenUrl:   form.imagenUrl.trim() || null,
        videoUrl:    form.videoUrl.trim() || null,
        menu:        (['comida', 'cena'].includes(form.tipo)) ? (form.menu.trim() || null) : null,
        notificar:   isPrivileged ? Boolean(form.notificar) : false,
        timestampNotificacion: isPrivileged && form.notificar ? serverTimestamp() : null,
      }
      if (isEditing) {
        await updateDoc(doc(db, 'eventos', editEvent.id), payload)
      } else {
        await addDoc(collection(db, 'eventos'), { ...payload, plazasOcupadas: 0, createdAt: serverTimestamp() })
      }
      onCreated()
    } catch {
      setError(isEditing ? 'Error al guardar los cambios.' : 'Error al crear el evento.')
    } finally { setLoading(false) }
  }

  return (
    <Overlay onClose={onClose} scrollable>
      <div style={{ width: '40px', height: '4px', background: 'rgba(255,255,255,0.12)', borderRadius: '2px', margin: '0 auto 1.25rem' }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: GOLD }}>
          {isEditing ? '✏️ Editar evento' : '➕ Nuevo evento'}
        </h3>
        <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '10px', padding: '0.5rem', color: 'rgba(255,255,255,0.35)', display: 'flex', cursor: 'pointer', minHeight: 'auto', minWidth: 'auto' }}>
          <X size={18} />
        </button>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <label style={sharedLabel}>Título *</label>
          <input required style={sharedInput} value={form.titulo} onChange={e => set('titulo', e.target.value)} placeholder="Ej: Paella de la Falla" onFocus={fg} onBlur={fb} />
        </div>
        <div>
          <label style={sharedLabel}>Tipo</label>
          <select value={form.tipo} onChange={e => set('tipo', e.target.value)} style={{ ...sharedInput, cursor: 'pointer' }}>
            {Object.entries(EVENT_TYPES).map(([k, v]) => (
              <option key={k} value={k} style={{ background: CARD }}>{v.emoji} {v.label}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div>
            <label style={sharedLabel}>Fecha</label>
            <input type="date" style={sharedInput} value={form.fecha} onChange={e => set('fecha', e.target.value)} onFocus={fg} onBlur={fb} />
          </div>
          <div>
            <label style={sharedLabel}>Hora</label>
            <select value={form.hora} onChange={e => set('hora', e.target.value)} style={{ ...sharedInput, cursor: 'pointer' }}>
              <option value="" style={{ background: CARD }}>— Sin hora —</option>
              {TIME_OPTIONS.map(t => <option key={t} value={t} style={{ background: CARD }}>{t}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label style={sharedLabel}>Lugar</label>
          <input style={sharedInput} value={form.lugar} onChange={e => set('lugar', e.target.value)} placeholder="Carpa de la Falla" onFocus={fg} onBlur={fb} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div>
            <label style={sharedLabel}>Precio (€)</label>
            <input type="number" min="0" step="0.5" style={sharedInput} value={form.precio} onChange={e => set('precio', e.target.value)} placeholder="Gratis" onFocus={fg} onBlur={fb} />
          </div>
          <div>
            <label style={sharedLabel}>Plazas</label>
            <input type="number" min="1" style={sharedInput} value={form.plazasTotal} onChange={e => set('plazasTotal', e.target.value)} placeholder="Ilimitado" onFocus={fg} onBlur={fb} />
          </div>
        </div>
        <div>
          <label style={sharedLabel}>Descripción</label>
          <textarea rows={2} style={{ ...sharedInput, resize: 'vertical' }} value={form.descripcion} onChange={e => set('descripcion', e.target.value)} placeholder="Detalles…" onFocus={fg} onBlur={fb} />
        </div>
        <div>
          <label style={sharedLabel}>🖼 URL Imagen / Cartel</label>
          <input style={sharedInput} value={form.imagenUrl} onChange={e => set('imagenUrl', e.target.value)} placeholder="https://…" onFocus={fg} onBlur={fb} />
        </div>
        <div>
          <label style={sharedLabel}>🎬 URL Vídeo (YouTube / Vimeo)</label>
          <input style={sharedInput} value={form.videoUrl} onChange={e => set('videoUrl', e.target.value)} placeholder="https://youtube.com/…" onFocus={fg} onBlur={fb} />
        </div>
        {(form.tipo === 'comida' || form.tipo === 'cena') && (
          <div>
            <label style={sharedLabel}>📜 Menú detallado</label>
            <textarea rows={3} style={{ ...sharedInput, resize: 'vertical' }} value={form.menu} onChange={e => set('menu', e.target.value)} placeholder={'Primer plato: …\nSegundo plato: …\nPostre: …'} onFocus={fg} onBlur={fb} />
          </div>
        )}
        {/* Notify toggle — privileged only */}
        {isPrivileged && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.9rem 1rem', background: form.notificar ? 'rgba(212,175,55,0.07)' : 'rgba(255,255,255,0.03)', border: `1.5px solid ${form.notificar ? 'rgba(212,175,55,0.38)' : 'rgba(255,255,255,0.1)'}`, borderRadius: '14px', transition: 'all 0.2s' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ fontSize: '1.15rem' }}>📢</span>
              <div>
                <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: '700', color: 'white', lineHeight: 1.2 }}>Notificar a la comisión</p>
                <p style={{ margin: '2px 0 0', fontSize: '0.67rem', color: 'rgba(255,255,255,0.35)' }}>Muestra un aviso urgente a todos</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => set('notificar', !form.notificar)}
              style={{
                width: '46px', height: '26px', flexShrink: 0,
                background: form.notificar ? GOLD : 'rgba(255,255,255,0.18)',
                border: 'none', borderRadius: '13px',
                position: 'relative', cursor: 'pointer',
                transition: 'background 0.22s', minHeight: 'auto', minWidth: 'auto',
              }}
              aria-checked={form.notificar}
              role="switch"
            >
              <div style={{
                position: 'absolute', top: '3px',
                left: form.notificar ? '23px' : '3px',
                width: '20px', height: '20px',
                background: 'white', borderRadius: '50%',
                transition: 'left 0.22s',
                boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
              }} />
            </button>
          </div>
        )}

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', background: 'rgba(206,17,38,0.08)', border: '1px solid rgba(206,17,38,0.28)', borderRadius: '10px' }}>
            <AlertCircle size={15} color={RED} />
            <span style={{ color: '#ff8080', fontSize: '0.82rem' }}>{error}</span>
          </div>
        )}
        <button type="submit" disabled={loading} style={{ minHeight: '52px', background: loading ? `rgba(212,175,55,0.35)` : `linear-gradient(135deg, ${GOLD}, #8a6f1a)`, border: 'none', borderRadius: '14px', color: 'white', fontSize: '1rem', fontWeight: '800', cursor: loading ? 'not-allowed' : 'pointer', boxShadow: loading ? 'none' : `0 6px 20px rgba(212,175,55,0.3)`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
          {loading
            ? <Loader2 size={18} style={{ animation: 'falla-spin 0.8s linear infinite' }} />
            : isEditing ? '💾 Guardar cambios' : '🔥 Crear evento'}
        </button>

        {/* Delete section — only when editing */}
        {isEditing && !confirmDelete && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            style={{ minHeight: '44px', background: 'transparent', border: '1px solid rgba(206,17,38,0.28)', borderRadius: '12px', color: 'rgba(206,17,38,0.7)', fontSize: '0.82rem', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
          >
            <Trash2 size={14} /> Eliminar evento
          </button>
        )}

        {isEditing && confirmDelete && (
          <div style={{ padding: '1rem', background: 'rgba(206,17,38,0.07)', border: '1px solid rgba(206,17,38,0.28)', borderRadius: '14px' }}>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', fontWeight: '700', color: '#ff8080', lineHeight: 1.4 }}>
              ⚠️ ¿Eliminar este evento? Se borrarán también <strong>todos los inscritos</strong>.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" onClick={() => setConfirmDelete(false)} disabled={loading}
                style={{ flex: 1, minHeight: '42px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', color: 'rgba(255,255,255,0.55)', fontSize: '0.82rem', fontWeight: '700', cursor: loading ? 'not-allowed' : 'pointer' }}>
                Cancelar
              </button>
              <button type="button" onClick={handleDelete} disabled={loading}
                style={{ flex: 1, minHeight: '42px', background: loading ? 'rgba(206,17,38,0.35)' : `linear-gradient(135deg, ${RED}, #a00d1e)`, border: 'none', borderRadius: '10px', color: 'white', fontSize: '0.82rem', fontWeight: '700', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                {loading ? <Loader2 size={14} style={{ animation: 'falla-spin 0.8s linear infinite' }} /> : <><Trash2 size={14} /> Sí, eliminar</>}
              </button>
            </div>
          </div>
        )}
      </form>
    </Overlay>
  )
}

// ─── Cancel confirmation modal ────────────────────────────────────────────────
function CancelConfirmModal({ event, onConfirm, onCancel, deleting }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 150, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 1.5rem' }}
      onClick={!deleting ? onCancel : undefined}
    >
      <div
        style={{ width: '100%', maxWidth: '340px', background: CARD, border: '1px solid rgba(206,17,38,0.22)', borderRadius: '20px', padding: '1.5rem', animation: 'falla-slideUp 0.22s ease-out' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '2.2rem', marginBottom: '0.6rem' }}>⚠️</div>
          <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: '800', color: 'white' }}>
            ¿Anular inscripción?
          </h3>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'rgba(255,255,255,0.48)', lineHeight: 1.55 }}>
            Se eliminarán tu inscripción y la de tus acompañantes en:
            <br />
            <strong style={{ color: 'rgba(255,255,255,0.82)', fontWeight: '700' }}>{event.titulo}</strong>
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.65rem' }}>
          <button
            type="button" onClick={onCancel} disabled={deleting}
            style={{ flex: 1, minHeight: '46px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: 'rgba(255,255,255,0.55)', fontSize: '0.9rem', fontWeight: '700', cursor: deleting ? 'not-allowed' : 'pointer' }}
          >
            Mantener
          </button>
          <button
            type="button" onClick={onConfirm} disabled={deleting}
            style={{ flex: 1, minHeight: '46px', background: deleting ? 'rgba(206,17,38,0.35)' : `linear-gradient(135deg, ${RED}, #a00d1e)`, border: 'none', borderRadius: '12px', color: 'white', fontSize: '0.9rem', fontWeight: '700', cursor: deleting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', boxShadow: deleting ? 'none' : '0 4px 16px rgba(206,17,38,0.28)' }}
          >
            {deleting ? <Loader2 size={16} style={{ animation: 'falla-spin 0.8s linear infinite' }} /> : 'Sí, anular'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Delete event confirmation modal ─────────────────────────────────────────
function DeleteEventModal({ event, onConfirm, onCancel, deleting }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 150, background: 'rgba(0,0,0,0.80)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 1.5rem' }}
      onClick={!deleting ? onCancel : undefined}
    >
      <div
        style={{ width: '100%', maxWidth: '340px', background: CARD, border: '1px solid rgba(206,17,38,0.28)', borderRadius: '20px', padding: '1.5rem', animation: 'falla-slideUp 0.22s ease-out' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '2.4rem', marginBottom: '0.6rem' }}>🗑️</div>
          <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: '800', color: 'white' }}>
            ¿Eliminar este evento?
          </h3>
          <p style={{ margin: '0 0 0.6rem', fontSize: '0.8rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.55 }}>
            Se borrarán todas las inscripciones asociadas.
            <br />
            <strong style={{ color: '#ff8080' }}>Esta acción no se puede deshacer.</strong>
          </p>
          <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: '700', color: 'rgba(255,255,255,0.85)', lineHeight: 1.35 }}>
            {event.titulo}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.65rem' }}>
          <button
            type="button" onClick={onCancel} disabled={deleting}
            style={{ flex: 1, minHeight: '46px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: 'rgba(255,255,255,0.55)', fontSize: '0.9rem', fontWeight: '700', cursor: deleting ? 'not-allowed' : 'pointer' }}
          >
            Cancelar
          </button>
          <button
            type="button" onClick={onConfirm} disabled={deleting}
            style={{ flex: 1, minHeight: '46px', background: deleting ? 'rgba(206,17,38,0.35)' : `linear-gradient(135deg, ${RED}, #a00d1e)`, border: 'none', borderRadius: '12px', color: 'white', fontSize: '0.9rem', fontWeight: '700', cursor: deleting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', boxShadow: deleting ? 'none' : '0 4px 16px rgba(206,17,38,0.3)' }}
          >
            {deleting
              ? <Loader2 size={16} style={{ animation: 'falla-spin 0.8s linear infinite' }} />
              : <><Trash2 size={14} /> Eliminar</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Success toast ────────────────────────────────────────────────────────────
function SuccessToast({ message, onDismiss }) {
  useEffect(() => {
    const id = setTimeout(onDismiss, 3200)
    return () => clearTimeout(id)
  }, [onDismiss])
  return (
    <div style={{ position: 'fixed', top: '1rem', left: '50%', transform: 'translateX(-50%)', zIndex: 200, display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.7rem 1.25rem', background: 'rgba(16,185,129,0.14)', border: '1px solid rgba(16,185,129,0.38)', borderRadius: '50px', color: '#6ee7b7', fontSize: '0.85rem', fontWeight: '600', backdropFilter: 'blur(14px)', boxShadow: '0 4px 24px rgba(0,0,0,0.4)', animation: 'falla-slideDown 0.3s ease-out', whiteSpace: 'nowrap' }}>
      <Check size={15} />
      {message}
    </div>
  )
}

// ─── EventList (main export) ──────────────────────────────────────────────────
export default function EventList() {
  const { user, fallero } = useAuth()
  const isAdmin = fallero?.rol === 'admin' || fallero?.rol === 'directiva'

  const [events, setEvents]               = useState([])
  const [loading, setLoading]             = useState(true)
  const [registeredIds, setRegisteredIds] = useState(new Set())
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [adminEvent, setAdminEvent]       = useState(null)
  const [showForm, setShowForm]           = useState(false)
  const [editEvent, setEditEvent]         = useState(null)
  const [toast, setToast]                 = useState(null)
  const [cancelTarget, setCancelTarget]   = useState(null)
  const [deleting, setDeleting]           = useState(false)
  const [deleteTarget, setDeleteTarget]   = useState(null)
  const [deletingEvt, setDeletingEvt]     = useState(false)

  useEffect(() => {
    const q = query(collection(db, 'eventos'), orderBy('fecha', 'asc'))
    return onSnapshot(q, snap => { setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false) }, () => setLoading(false))
  }, [])

  useEffect(() => {
    if (!user?.uid) return
    getDocs(query(collection(db, 'inscripciones'), where('uid', '==', user.uid)))
      .then(snap => setRegisteredIds(new Set(snap.docs.map(d => d.data().eventId))))
      .catch(() => {})
  }, [user?.uid])

  const handleRegistered = useCallback((eventId) => {
    setSelectedEvent(null)
    setRegisteredIds(prev => new Set([...prev, eventId]))
    setToast('¡Inscripción confirmada! 🎉')
  }, [])

  const handleCancelled = useCallback((eventId) => {
    setSelectedEvent(null)
    setRegisteredIds(prev => { const next = new Set(prev); next.delete(eventId); return next })
    setToast('Inscripción anulada correctamente')
  }, [])

  const handleConfirmCancel = useCallback(async () => {
    if (!cancelTarget || deleting) return
    setDeleting(true)
    try {
      const snap = await getDocs(query(
        collection(db, 'inscripciones'),
        where('eventId', '==', cancelTarget.id),
        where('uid', '==', user.uid),
      ))
      await Promise.all(snap.docs.map(d => deleteDoc(d.ref)))
      setRegisteredIds(prev => { const next = new Set(prev); next.delete(cancelTarget.id); return next })
      setCancelTarget(null)
      setToast('Inscripción anulada correctamente')
    } catch (err) {
      setCancelTarget(null)
      setToast(err?.message || 'Error al anular. Inténtalo de nuevo.')
    } finally { setDeleting(false) }
  }, [cancelTarget, deleting, user?.uid])

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget || deletingEvt) return
    setDeletingEvt(true)
    try {
      const insSnap = await getDocs(query(collection(db, 'inscripciones'), where('eventId', '==', deleteTarget.id)))
      await Promise.all(insSnap.docs.map(d => deleteDoc(d.ref)))
      await deleteDoc(doc(db, 'eventos', deleteTarget.id))
      setDeleteTarget(null)
      setToast('Evento eliminado correctamente 🗑️')
    } catch (err) {
      setDeleteTarget(null)
      setToast(err?.message || 'Error al eliminar el evento.')
    } finally { setDeletingEvt(false) }
  }, [deleteTarget, deletingEvt])

  const handleCreated = useCallback(() => { setShowForm(false); setToast('Evento creado correctamente 🔥') }, [])

  return (
    <>
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: '900', color: 'white' }}>Eventos</h2>
        <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'rgba(255,255,255,0.32)' }}>
          Pulsa en un evento para apuntarte
        </p>
      </div>

      {loading ? (
        <>{[1, 2, 3].map(i => (
          <div key={i} style={{ height: '148px', background: '#1a1a1a', borderRadius: '18px', marginBottom: '0.75rem', animation: 'falla-pulse 1.6s ease-in-out infinite' }} />
        ))}</>
      ) : events.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3.5rem 1rem', background: CARD, border: '1px dashed rgba(212,175,55,0.12)', borderRadius: '18px' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🎭</div>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.28)', fontSize: '0.9rem' }}>No hay eventos próximos</p>
          {isAdmin && <p style={{ margin: '0.5rem 0 0', color: 'rgba(255,255,255,0.18)', fontSize: '0.78rem' }}>Pulsa + para crear el primero</p>}
        </div>
      ) : (
        events.map((ev, i) => (
          <EventCard
            key={ev.id} event={ev} index={i}
            isRegistered={registeredIds.has(ev.id)}
            isAdmin={isAdmin}
            onPress={setSelectedEvent}
            onAdminPress={setAdminEvent}
            onEditPress={setEditEvent}
            onCancelPress={setCancelTarget}
            onDeletePress={setDeleteTarget}
          />
        ))
      )}

      {/* FAB admin */}
      {isAdmin && (
        <button onClick={() => setShowForm(true)} style={{ position: 'fixed', bottom: 'calc(76px + env(safe-area-inset-bottom))', right: '1.25rem', width: '56px', height: '56px', background: `linear-gradient(135deg, ${GOLD}, #8a6f1a)`, border: 'none', borderRadius: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', minHeight: 'auto', boxShadow: `0 8px 28px rgba(212,175,55,0.4)`, zIndex: 40 }}>
          <Plus size={26} color="white" strokeWidth={2.5} />
        </button>
      )}

      {selectedEvent && (
        <RegistrationModal
          event={selectedEvent}
          isRegistered={registeredIds.has(selectedEvent.id)}
          onClose={() => setSelectedEvent(null)}
          onSuccess={() => handleRegistered(selectedEvent.id)}
          onCancelled={handleCancelled}
        />
      )}
      {adminEvent && (
        <AdminEventControl event={adminEvent} onClose={() => setAdminEvent(null)} />
      )}
      {showForm  && <EventFormModal onClose={() => setShowForm(false)} onCreated={handleCreated} />}
      {editEvent && <EventFormModal event={editEvent} onClose={() => setEditEvent(null)} onCreated={() => { setEditEvent(null); setToast('Evento actualizado ✓') }} />}
      {toast && <SuccessToast message={toast} onDismiss={() => setToast(null)} />}
      {cancelTarget && (
        <CancelConfirmModal
          event={cancelTarget}
          onConfirm={handleConfirmCancel}
          onCancel={() => !deleting && setCancelTarget(null)}
          deleting={deleting}
        />
      )}
      {deleteTarget && (
        <DeleteEventModal
          event={deleteTarget}
          onConfirm={handleConfirmDelete}
          onCancel={() => !deletingEvt && setDeleteTarget(null)}
          deleting={deletingEvt}
        />
      )}
    </>
  )
}

export { RegistrationModal, EventFormModal, SuccessToast, CancelConfirmModal, DeleteEventModal }
