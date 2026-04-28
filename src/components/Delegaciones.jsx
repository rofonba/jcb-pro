import { useState, useEffect, useMemo } from 'react'
import {
  collection, query, orderBy, onSnapshot, where,
  getDocs, deleteDoc, doc, addDoc, updateDoc, serverTimestamp,
} from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../firebase'
import { getDirectImageUrl } from '../utils/imageUtils'
import { useAuth } from '../contexts/AuthContext'
import { ChevronLeft, Plus, X, Loader2, Pencil, Trash2 } from 'lucide-react'
import { RegistrationModal, CancelConfirmModal, SuccessToast, EventFormModal } from './EventList'

const GOLD   = '#D4AF37'
const WHITE  = '#FFFFFF'
const TEXT   = '#111827'
const TEXT2  = '#6B7280'
const MUTED  = '#9CA3AF'
const BORDER = '#F3F4F6'
const BG     = '#F9FAFB'
const RED    = '#CE1126'
const GREEN  = '#10b981'

const DELEGACIONES = [
  { key: 'Baile',      emoji: '💃', color: '#E91E63' },
  { key: 'Deportes',   emoji: '⚽', color: '#2196F3' },
  { key: 'Falla',      emoji: '🔥', color: GOLD      },
  { key: 'Festejos',   emoji: '🎉', color: '#FF9800' },
  { key: 'Infantiles', emoji: '🧒', color: '#4CAF50' },
  { key: 'Perchero',   emoji: '👗', color: '#9C27B0' },
  { key: 'Protocolo',  emoji: '📋', color: '#607D8B' },
]

const DELEGACION_OPTS = ['General','Baile','Deportes','Falla','Festejos','Infantiles','Perchero','Protocolo']

const DELEGACION_COLORS = {
  Baile: '#E91E63', Deportes: '#2196F3', Falla: GOLD, Festejos: '#FF9800',
  Infantiles: '#4CAF50', Perchero: '#9C27B0', Protocolo: '#607D8B', General: '#6B7280',
}

function renderTextWithLinks(text) {
  if (!text) return null
  const parts = text.split(/(https?:\/\/[^\s]+)/g)
  return parts.map((part, i) =>
    /^https?:\/\//.test(part)
      ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: '#2563EB', textDecoration: 'underline', wordBreak: 'break-all' }}>{part}</a>
      : part
  )
}

const EVENT_TYPES = {
  comida:  { emoji: '🍽️', label: 'Comida',  color: GOLD      },
  cena:    { emoji: '🌙', label: 'Cena',    color: '#6366f1' },
  acto:    { emoji: '🎭', label: 'Acto',    color: RED       },
  reunion: { emoji: '📋', label: 'Reunión', color: TEXT2     },
  otro:    { emoji: '📌', label: 'Otro',    color: MUTED     },
}

function fmtDate(f) {
  if (!f) return '—'
  const d = f?.toDate ? f.toDate() : new Date(f)
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
}
function fmtTime(f) {
  if (!f) return ''
  const d = f?.toDate ? f.toDate() : new Date(f)
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

// ─── Admin action sheet ───────────────────────────────────────────────────────

function ActionSheet({ delegacion, onCreateEvent, onCreateAviso, onClose }) {
  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 198, backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }}
      />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 199,
        background: WHITE, borderRadius: '24px 24px 0 0',
        padding: '12px 20px calc(28px + env(safe-area-inset-bottom))',
        animation: 'falla-slideUp 0.25s ease-out',
      }}>
        <div style={{ width: 36, height: 4, background: BORDER, borderRadius: 2, margin: '0 auto 16px' }} />
        <p style={{ margin: '0 0 14px', fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Crear en {delegacion.emoji} {delegacion.key}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={onCreateEvent}
            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 16, cursor: 'pointer', minHeight: 'auto', textAlign: 'left' }}
          >
            <div style={{ width: 44, height: 44, borderRadius: 13, background: `${GOLD}14`, border: `1px solid ${GOLD}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
              🎭
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: TEXT }}>Crear Evento</p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: TEXT2 }}>Acto, comida, reunión…</p>
            </div>
          </button>
          <button
            onClick={onCreateAviso}
            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 16, cursor: 'pointer', minHeight: 'auto', textAlign: 'left' }}
          >
            <div style={{ width: 44, height: 44, borderRadius: 13, background: `${RED}10`, border: `1px solid ${RED}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
              📢
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: TEXT }}>Crear Aviso</p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: TEXT2 }}>Comunicado para la delegación</p>
            </div>
          </button>
        </div>
        <button
          onClick={onClose}
          style={{ marginTop: 14, width: '100%', padding: '12px', background: 'none', border: `1.5px solid ${BORDER}`, borderRadius: 12, fontSize: 14, fontWeight: 600, color: MUTED, cursor: 'pointer', minHeight: 'auto' }}
        >
          Cancelar
        </button>
      </div>
    </>
  )
}

// ─── Aviso creation / edit sheet ─────────────────────────────────────────────

function AvisoFormSheet({ initialDelegacion, editData = null, onClose, onCreated }) {
  const inputStyle = {
    width: '100%', padding: '10px 12px',
    border: `1.5px solid ${BORDER}`, borderRadius: 12,
    fontSize: 14, fontFamily: 'inherit', color: TEXT,
    background: WHITE, boxSizing: 'border-box', outline: 'none',
  }
  const [titulo,       setTitulo]       = useState(editData?.titulo ?? '')
  const [cuerpo,       setCuerpo]       = useState(editData?.cuerpo ?? '')
  const [esUrgente,    setEsUrgente]    = useState(editData?.esUrgente ?? false)
  const [delegacion,   setDelegacion]   = useState(editData?.delegacion ?? initialDelegacion)
  const [enlace,       setEnlace]       = useState(editData?.enlace ?? '')
  const [imageFile,    setImageFile]    = useState(null)
  const [imagePreview, setImagePreview] = useState(editData?.imageUrl ?? null)
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')

  const handleImageChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!titulo.trim()) return
    setSaving(true); setError('')
    try {
      let imageUrl = editData?.imageUrl ?? null
      if (imageFile) {
        const snap = await uploadBytes(storageRef(storage, `avisos/${Date.now()}_${imageFile.name}`), imageFile)
        imageUrl = await getDownloadURL(snap.ref)
      }
      const payload = {
        titulo: titulo.trim(), cuerpo: cuerpo.trim() || null,
        esUrgente, delegacion, enlace: enlace.trim() || null, imageUrl,
      }
      if (editData) {
        await updateDoc(doc(db, 'anuncios', editData.id), payload)
      } else {
        await addDoc(collection(db, 'anuncios'), { ...payload, createdAt: serverTimestamp() })
      }
      onCreated()
    } catch (err) {
      setError(err?.message || 'Error al guardar el aviso.')
      setSaving(false)
    }
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 198, backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }}
      />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 199,
        background: WHITE, borderRadius: '24px 24px 0 0',
        padding: '12px 20px calc(28px + env(safe-area-inset-bottom))',
        animation: 'falla-slideUp 0.28s ease-out',
        maxHeight: '90dvh', overflowY: 'auto',
      }}>
        <div style={{ width: 36, height: 4, background: BORDER, borderRadius: 2, margin: '0 auto 14px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: TEXT }}>{editData ? '✏️ Editar aviso' : '📢 Nuevo aviso'}</h3>
          <button onClick={onClose} style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 6, cursor: 'pointer', display: 'flex', minHeight: 'auto', minWidth: 'auto' }}>
            <X size={16} color={MUTED} />
          </button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            required value={titulo} onChange={e => setTitulo(e.target.value)}
            placeholder="Título del aviso *"
            style={inputStyle}
            onFocus={e => e.target.style.borderColor = GOLD}
            onBlur={e => e.target.style.borderColor = BORDER}
          />
          <textarea
            value={cuerpo} onChange={e => setCuerpo(e.target.value)}
            placeholder="Mensaje (opcional)"
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
            onFocus={e => e.target.style.borderColor = GOLD}
            onBlur={e => e.target.style.borderColor = BORDER}
          />
          {/* Image picker */}
          <div>
            <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 600, color: TEXT2 }}>Imagen (opcional)</p>
            {imagePreview && (
              <div style={{ position: 'relative', marginBottom: 8 }}>
                <img src={imagePreview} alt="" style={{ width: '100%', height: 150, objectFit: 'cover', borderRadius: 12, display: 'block' }} />
                <button
                  type="button"
                  onClick={() => { setImageFile(null); setImagePreview(editData?.imageUrl ?? null) }}
                  style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: 8, padding: '4px 6px', cursor: 'pointer', minHeight: 'auto', minWidth: 'auto', display: 'flex', alignItems: 'center' }}
                >
                  <X size={14} color="white" />
                </button>
              </div>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: BG, border: `1.5px dashed ${BORDER}`, borderRadius: 12, cursor: 'pointer', fontSize: 13, color: TEXT2 }}>
              📷 {imageFile ? imageFile.name : (imagePreview ? 'Cambiar imagen' : 'Seleccionar imagen')}
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageChange} />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 600, color: TEXT2 }}>Delegación</p>
              <select
                value={delegacion} onChange={e => setDelegacion(e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}
                onFocus={e => e.target.style.borderColor = GOLD}
                onBlur={e => e.target.style.borderColor = BORDER}
              >
                {DELEGACION_OPTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 600, color: TEXT2 }}>Enlace (opcional)</p>
              <input
                type="url" value={enlace} onChange={e => setEnlace(e.target.value)}
                placeholder="https://…"
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = GOLD}
                onBlur={e => e.target.style.borderColor = BORDER}
              />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: esUrgente ? 'rgba(206,17,38,0.04)' : BG, border: `1.5px solid ${esUrgente ? 'rgba(206,17,38,0.32)' : BORDER}`, borderRadius: 12, transition: 'all 0.2s' }}>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: TEXT }}>⚡ Marcar como urgente</p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: TEXT2 }}>Activa el borde rojo pulsante</p>
            </div>
            <button
              type="button" onClick={() => setEsUrgente(v => !v)}
              style={{ width: 46, height: 26, background: esUrgente ? RED : 'rgba(0,0,0,0.12)', border: 'none', borderRadius: 13, position: 'relative', cursor: 'pointer', transition: 'background 0.22s', minHeight: 'auto', minWidth: 'auto', flexShrink: 0 }}
            >
              <div style={{ position: 'absolute', top: 3, left: esUrgente ? 23 : 3, width: 20, height: 20, background: WHITE, borderRadius: '50%', transition: 'left 0.22s', boxShadow: '0 1px 3px rgba(0,0,0,0.22)' }} />
            </button>
          </div>
          {error && <p style={{ margin: 0, fontSize: 12, color: RED }}>{error}</p>}
          <button
            type="submit" disabled={saving}
            style={{ width: '100%', minHeight: 48, background: saving ? `${GOLD}50` : `linear-gradient(135deg, ${GOLD}, #8a6f1a)`, border: 'none', borderRadius: 14, color: WHITE, fontSize: 15, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: saving ? 'none' : `0 4px 14px rgba(212,175,55,0.3)` }}
          >
            {saving ? <Loader2 size={18} style={{ animation: 'falla-spin 0.8s linear infinite' }} /> : (editData ? '💾 Guardar cambios' : '📢 Publicar aviso')}
          </button>
        </form>
      </div>
    </>
  )
}

// ─── Aviso card ───────────────────────────────────────────────────────────────

function AvisoCard({ a, isUrgent, date, delColor, imgUrl, isAdmin, onEdit, onDelete }) {
  const [imgError, setImgError] = useState(false)
  return (
    <div
      className={isUrgent ? 'jcb-urgent-pulse' : ''}
      style={{ background: WHITE, borderRadius: 16, border: `1.5px solid ${isUrgent ? 'rgba(206,17,38,0.45)' : BORDER}`, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', overflow: 'hidden' }}
    >
      {imgUrl && !imgError && (
        <img
          src={imgUrl} alt=""
          onError={() => setImgError(true)}
          style={{ width: '100%', height: 155, objectFit: 'cover', display: 'block' }}
        />
      )}
      <div style={{ padding: '12px 16px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: TEXT, margin: 0, flex: 1, lineHeight: 1.35 }}>{a.titulo}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            {isUrgent && <span style={{ background: RED, color: WHITE, fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 20, letterSpacing: '0.05em' }}>URGENTE</span>}
            {isAdmin && (
              <>
                <button
                  onClick={onEdit}
                  style={{ background: 'transparent', border: `1px solid ${GOLD}40`, borderRadius: 7, padding: '3px 5px', color: `${GOLD}99`, cursor: 'pointer', display: 'flex', alignItems: 'center', minHeight: 'auto', minWidth: 'auto', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = `${GOLD}14`; e.currentTarget.style.color = GOLD }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = `${GOLD}99` }}
                >
                  <Pencil size={12} />
                </button>
                <button
                  onClick={onDelete}
                  style={{ background: 'transparent', border: `1px solid rgba(206,17,38,0.22)`, borderRadius: 7, padding: '3px 5px', color: 'rgba(206,17,38,0.55)', cursor: 'pointer', display: 'flex', alignItems: 'center', minHeight: 'auto', minWidth: 'auto', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(206,17,38,0.07)'; e.currentTarget.style.color = RED }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(206,17,38,0.55)' }}
                >
                  <Trash2 size={12} />
                </button>
              </>
            )}
          </div>
        </div>
        {a.cuerpo && (
          <p style={{ fontSize: 12, color: TEXT2, margin: '0 0 8px', lineHeight: 1.55 }}>
            {renderTextWithLinks(a.cuerpo)}
          </p>
        )}
        {a.enlace && (
          <a
            href={a.enlace} target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 8, padding: '5px 13px', background: '#EFF6FF', border: '1px solid rgba(37,99,235,0.22)', borderRadius: 20, fontSize: 11, fontWeight: 600, color: '#2563EB', textDecoration: 'none' }}
          >
            🔗 Ver enlace
          </a>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
          {date && <p style={{ fontSize: 11, color: MUTED, margin: 0 }}>{date}</p>}
          {a.delegacion && (
            <span style={{ fontSize: 10, fontWeight: 600, color: delColor, background: `${delColor}12`, border: `1px solid ${delColor}28`, borderRadius: 20, padding: '2px 9px', fontStyle: 'italic' }}>
              {a.delegacion}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Delegation detail view ───────────────────────────────────────────────────

function DelegacionDetail({ delegacion, onBack, isAdmin }) {
  const { user } = useAuth()
  const [events,        setEvents]        = useState([])
  const [announcements, setAnn]           = useState([])
  const [registeredIds, setRegisteredIds] = useState(new Set())
  const [inscCountMap,  setInscCountMap]  = useState({})
  const [loading,       setLoading]       = useState(true)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [cancelTarget,  setCancelTarget]  = useState(null)
  const [deleting,      setDeleting]      = useState(false)
  const [toast,         setToast]         = useState(null)
  const [showSheet,     setShowSheet]     = useState(false)
  const [showEventForm, setShowEventForm] = useState(false)
  const [showAvisoForm, setShowAvisoForm] = useState(false)
  const [editingAviso,  setEditingAviso]  = useState(null)

  useEffect(() => {
    setLoading(true)
    const q = query(collection(db, 'eventos'), orderBy('fecha', 'asc'))
    return onSnapshot(q, snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setEvents(all.filter(ev => ev.delegacion === delegacion.key))
      setLoading(false)
    })
  }, [delegacion.key])

  useEffect(() => {
    const q = query(collection(db, 'anuncios'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setAnn(all.filter(a => a.delegacion === delegacion.key))
    })
  }, [delegacion.key])

  useEffect(() => {
    if (!user?.uid) return
    getDocs(query(collection(db, 'inscripciones'), where('uid', '==', user.uid)))
      .then(snap => setRegisteredIds(new Set(snap.docs.map(d => d.data().eventId))))
      .catch(() => {})
  }, [user?.uid])

  useEffect(() => {
    return onSnapshot(collection(db, 'inscripciones'), snap => {
      const map = {}
      for (const d of snap.docs) {
        const { eventId, totalPersonas } = d.data()
        if (eventId) map[eventId] = (map[eventId] ?? 0) + (totalPersonas ?? 1)
      }
      setInscCountMap(map)
    })
  }, [])

  const handleConfirmCancel = async () => {
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
      setToast(err?.message || 'Error al anular.')
    } finally { setDeleting(false) }
  }

  const handleDeleteAviso = async (annId) => {
    if (!window.confirm('¿Quieres eliminar este aviso definitivamente?')) return
    try {
      await deleteDoc(doc(db, 'anuncios', annId))
    } catch (err) {
      setToast(err?.message || 'Error al eliminar el aviso.')
    }
  }

  const upcomingEvents = useMemo(() => {
    const now = Date.now() - 3600000
    return events.filter(ev => {
      if (!ev.fecha) return true
      const d = ev.fecha?.toDate ? ev.fecha.toDate() : new Date(ev.fecha)
      return d.getTime() >= now
    })
  }, [events])

  return (
    <div style={{ paddingBottom: 100 }}>
      {/* Header */}
      <div style={{ background: WHITE, borderBottom: `1px solid ${BORDER}`, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <button
          onClick={onBack}
          style={{ background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', minHeight: 'auto', minWidth: 'auto', flexShrink: 0 }}
        >
          <ChevronLeft size={18} color={TEXT2} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: `${delegacion.color}18`, border: `1.5px solid ${delegacion.color}35`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
            {delegacion.emoji}
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: TEXT, letterSpacing: '-0.01em' }}>
              {delegacion.key}
            </h2>
            <p style={{ margin: 0, fontSize: 11, color: TEXT2 }}>Delegación</p>
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 20px', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Events section */}
        <div>
          <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: MUTED, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Próximos actos · {upcomingEvents.length}
          </p>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[1, 2].map(i => <div key={i} style={{ height: 82, background: '#E5E7EB', borderRadius: 16, animation: 'falla-pulse 1.6s ease-in-out infinite' }} />)}
            </div>
          ) : upcomingEvents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', background: WHITE, border: `1.5px solid ${BORDER}`, borderRadius: 16 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📅</div>
              <p style={{ margin: 0, fontSize: 13, color: MUTED }}>No hay actos programados</p>
              {isAdmin && <p style={{ margin: '6px 0 0', fontSize: 12, color: MUTED, opacity: 0.7 }}>Usa el botón + para crear uno</p>}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {upcomingEvents.map(ev => {
                const t      = EVENT_TYPES[ev.tipo] ?? EVENT_TYPES.otro
                const isReg  = registeredIds.has(ev.id)
                const ocu    = inscCountMap[ev.id] ?? ev.plazasOcupadas ?? 0
                const isFull = ev.plazasTotal && ocu >= ev.plazasTotal && !isReg
                return (
                  <div
                    key={ev.id}
                    style={{ background: isReg ? 'rgba(16,185,129,0.04)' : WHITE, border: `1.5px solid ${isReg ? 'rgba(16,185,129,0.3)' : BORDER}`, borderRadius: 16, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: 12 }}
                  >
                    <div style={{ width: 42, height: 42, flexShrink: 0, background: `${t.color}14`, border: `1px solid ${t.color}22`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                      {t.emoji}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: TEXT, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                        {ev.titulo}
                      </p>
                      <p style={{ margin: '3px 0 0', fontSize: 11, color: TEXT2 }}>
                        {fmtDate(ev.fecha)}{fmtTime(ev.fecha) && ` · ${fmtTime(ev.fecha)}`}
                        {ev.precio != null ? ` · ${ev.precio} €` : ' · Gratis'}
                      </p>
                      {isReg && <span style={{ display: 'inline-block', marginTop: 3, fontSize: 10, fontWeight: 700, color: GREEN }}>✅ APUNTADO</span>}
                    </div>
                    <div style={{ flexShrink: 0 }}>
                      {isReg ? (
                        <button
                          onClick={() => setCancelTarget(ev)}
                          style={{ padding: '6px 10px', background: 'transparent', border: '1.5px solid rgba(206,17,38,0.35)', borderRadius: 8, fontSize: 11, fontWeight: 700, color: 'rgba(206,17,38,0.75)', cursor: 'pointer', minHeight: 'auto' }}
                        >
                          Anular
                        </button>
                      ) : isFull ? (
                        <span style={{ fontSize: 10, fontWeight: 700, color: RED, padding: '6px 8px', background: 'rgba(206,17,38,0.07)', border: '1px solid rgba(206,17,38,0.2)', borderRadius: 8, display: 'inline-block' }}>
                          Completo
                        </span>
                      ) : (
                        <button
                          onClick={() => setSelectedEvent(ev)}
                          style={{ padding: '7px 13px', background: RED, border: 'none', borderRadius: 8, fontSize: 11, fontWeight: 700, color: WHITE, cursor: 'pointer', minHeight: 'auto', boxShadow: '0 2px 8px rgba(206,17,38,0.25)' }}
                        >
                          Apuntarse
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Announcements section */}
        {announcements.length > 0 && (
          <div>
            <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: MUTED, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Avisos · {announcements.length}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {announcements.map(a => {
                const isUrgent = a.esUrgente || a.importante
                const date = a.createdAt?.toDate?.()
                  ? a.createdAt.toDate().toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
                  : null
                const delColor = DELEGACION_COLORS[a.delegacion] ?? '#6B7280'
                const imgUrl = getDirectImageUrl(a.imageUrl)
                return (
                  <AvisoCard
                    key={a.id}
                    a={a} isUrgent={isUrgent} date={date} delColor={delColor}
                    imgUrl={imgUrl} isAdmin={isAdmin}
                    onEdit={() => { setEditingAviso(a); setShowAvisoForm(true) }}
                    onDelete={() => handleDeleteAviso(a.id)}
                  />
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Admin FAB */}
      {isAdmin && (
        <button
          onClick={() => setShowSheet(true)}
          style={{
            position: 'fixed',
            bottom: 'calc(76px + env(safe-area-inset-bottom))',
            right: '1.25rem',
            width: 56, height: 56,
            background: `linear-gradient(135deg, ${delegacion.color}, ${delegacion.color}bb)`,
            border: 'none', borderRadius: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', minHeight: 'auto',
            boxShadow: `0 8px 28px ${delegacion.color}55`,
            zIndex: 40,
          }}
        >
          <Plus size={26} color="white" strokeWidth={2.5} />
        </button>
      )}

      {/* Modals */}
      {selectedEvent && (
        <RegistrationModal
          event={selectedEvent}
          isRegistered={registeredIds.has(selectedEvent.id)}
          onClose={() => setSelectedEvent(null)}
          onSuccess={() => {
            setRegisteredIds(prev => new Set([...prev, selectedEvent.id]))
            setSelectedEvent(null)
            setToast('¡Inscripción confirmada! 🎉')
          }}
          onCancelled={(evId) => {
            setRegisteredIds(prev => { const next = new Set(prev); next.delete(evId); return next })
            setSelectedEvent(null)
            setToast('Inscripción anulada correctamente')
          }}
        />
      )}
      {cancelTarget && (
        <CancelConfirmModal
          event={cancelTarget}
          onConfirm={handleConfirmCancel}
          onCancel={() => !deleting && setCancelTarget(null)}
          deleting={deleting}
        />
      )}
      {showSheet && (
        <ActionSheet
          delegacion={delegacion}
          onCreateEvent={() => { setShowSheet(false); setShowEventForm(true) }}
          onCreateAviso={() => { setShowSheet(false); setShowAvisoForm(true) }}
          onClose={() => setShowSheet(false)}
        />
      )}
      {showEventForm && (
        <EventFormModal
          initialDelegacion={delegacion.key}
          onClose={() => setShowEventForm(false)}
          onCreated={() => { setShowEventForm(false); setToast(`Evento creado en ${delegacion.key} 🔥`) }}
        />
      )}
      {showAvisoForm && (
        <AvisoFormSheet
          initialDelegacion={delegacion.key}
          editData={editingAviso}
          onClose={() => { setShowAvisoForm(false); setEditingAviso(null) }}
          onCreated={() => {
            setShowAvisoForm(false); setEditingAviso(null)
            setToast(editingAviso ? 'Aviso actualizado ✓' : `Aviso publicado en ${delegacion.key} ✓`)
          }}
        />
      )}
      {toast && <SuccessToast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}

// ─── Delegation list ──────────────────────────────────────────────────────────

export default function Delegaciones({ isAdmin = false }) {
  const [selected, setSelected] = useState(null)

  if (selected) {
    return (
      <DelegacionDetail
        delegacion={selected}
        onBack={() => setSelected(null)}
        isAdmin={isAdmin}
      />
    )
  }

  return (
    <div style={{ padding: '24px 20px', paddingBottom: 100 }}>
      <h2 style={{ fontSize: 26, fontWeight: 700, color: TEXT, margin: '0 0 4px', letterSpacing: '-0.02em' }}>
        Delegaciones
      </h2>
      <p style={{ fontSize: 13, color: TEXT2, margin: '0 0 24px' }}>
        Actos y avisos por área
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {DELEGACIONES.map(d => (
          <button
            key={d.key}
            onClick={() => setSelected(d)}
            style={{
              width: '100%',
              background: WHITE,
              border: `1.5px solid ${BORDER}`,
              borderRadius: 18,
              padding: '16px 18px',
              display: 'flex', alignItems: 'center', gap: 14,
              cursor: 'pointer', minHeight: 'auto', textAlign: 'left',
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
              transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
            onTouchStart={e => { e.currentTarget.style.borderColor = d.color; e.currentTarget.style.boxShadow = `0 4px 16px ${d.color}20` }}
            onTouchEnd={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)' }}
          >
            <div style={{
              width: 52, height: 52, flexShrink: 0,
              background: `${d.color}14`,
              border: `1.5px solid ${d.color}30`,
              borderRadius: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24,
            }}>
              {d.emoji}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: TEXT }}>{d.key}</p>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: TEXT2 }}>Eventos y avisos</p>
            </div>
            <ChevronLeft size={18} color={MUTED} style={{ transform: 'rotate(180deg)', flexShrink: 0 }} />
          </button>
        ))}
      </div>
    </div>
  )
}
