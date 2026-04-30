import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  collection, query, orderBy, getDocs, getDoc, where,
  doc, updateDoc, arrayUnion, arrayRemove, onSnapshot, writeBatch,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { usePushNotifications } from '../hooks/usePushNotifications'
import { enviarNotificacionFCM } from '../services/fcmService'
import {
  Download, Users, ChevronRight, X, Loader2,
  Shield, Star, Flame, Plus, Trash2, Baby, Bell, Phone, Check, Zap,
  Pencil, Search, UserPlus, UserMinus,
} from 'lucide-react'

const GOLD  = '#D4AF37'
const RED   = '#CE1126'
const WHITE = '#FFFFFF'
const TEXT  = '#111827'
const TEXT2 = '#6B7280'
const MUTED = '#9CA3AF'
const BORDER = '#F3F4F6'
const BG    = '#F9FAFB'

// ─── Card primitive ───────────────────────────────────────────────────────────
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

function InfoRow({ label, value, last = false }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      paddingBottom: last ? 0 : '0.65rem', marginBottom: last ? 0 : '0.65rem',
      borderBottom: last ? 'none' : `1px solid ${BORDER}`,
    }}>
      <span style={{ fontSize: 13, color: TEXT2 }}>{label}</span>
      <span style={{ fontSize: 13, color: TEXT, fontWeight: 600 }}>{value}</span>
    </div>
  )
}

function calcAge(fechaNacimiento) {
  if (!fechaNacimiento) return null
  const birth = new Date(fechaNacimiento)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

// ─── Contact info (phone + birthdate, editable) ───────────────────────────────
function EditableRow({ label, displayValue, editValue, onEditStart, onSave, onCancel, saving, inputProps, last = false }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(editValue)

  const handleEdit = () => { setVal(editValue); setEditing(true); onEditStart?.() }
  const handleSave = async () => { await onSave(val); setEditing(false) }
  const handleCancel = () => { setEditing(false); onCancel?.() }

  const { style: extraStyle, ...restInputProps } = inputProps ?? {}

  return (
    <div style={{
      paddingBottom: last ? 0 : '0.65rem', marginBottom: last ? 0 : '0.65rem',
      borderBottom: last ? 'none' : `1px solid ${BORDER}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, color: TEXT2 }}>{label}</span>
        {!editing ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: TEXT, fontWeight: 600 }}>{displayValue}</span>
            <button
              onClick={handleEdit}
              style={{ fontSize: 11, color: GOLD, background: `${GOLD}14`, border: `1px solid ${GOLD}30`, borderRadius: 8, padding: '3px 8px', cursor: 'pointer', minHeight: 'auto', fontWeight: 700 }}
            >
              ✏️
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              autoFocus value={val} onChange={e => setVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel() }}
              style={{ padding: '6px 10px', background: BG, border: `1.5px solid ${GOLD}50`, borderRadius: 10, fontSize: 13, color: TEXT, outline: 'none', fontFamily: 'inherit', width: 120, ...extraStyle }}
              {...restInputProps}
            />
            <button onClick={handleSave} disabled={saving} style={{ background: GOLD, border: 'none', borderRadius: 8, padding: '6px 8px', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', minHeight: 'auto' }}>
              {saving ? <Loader2 size={13} color="white" style={{ animation: 'falla-spin 0.8s linear infinite' }} /> : <Check size={13} color="white" strokeWidth={2.5} />}
            </button>
            <button onClick={handleCancel} style={{ background: BORDER, border: 'none', borderRadius: 8, padding: '6px 8px', cursor: 'pointer', display: 'flex', minHeight: 'auto' }}>
              <X size={13} color={MUTED} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function fmtBirthDisplay(fecha) {
  if (!fecha) return null
  const d = new Date(fecha + 'T00:00:00')
  const fmt = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
  const age = calcAge(fecha)
  return age != null ? `${fmt} · ${age} años` : fmt
}

function ContactSection({ fallero, userId, onUpdate }) {
  const [savingPhone,  setSavingPhone]  = useState(false)
  const [savingNumero, setSavingNumero] = useState(false)
  const [savingBirth,  setSavingBirth]  = useState(false)

  const numFallero = fallero?.numeroFallero ?? fallero?.memberNumber ?? fallero?.numero ?? null

  const savePhone = async (val) => {
    setSavingPhone(true)
    try {
      await updateDoc(doc(db, 'falleros', userId), { telefono: val.trim() })
      onUpdate({ telefono: val.trim() })
    } finally { setSavingPhone(false) }
  }

  const saveNumero = async (val) => {
    const n = parseInt(val, 10)
    if (!val || isNaN(n) || n < 1) return
    setSavingNumero(true)
    try {
      await updateDoc(doc(db, 'falleros', userId), { numeroFallero: n })
      onUpdate({ numeroFallero: n })
    } finally { setSavingNumero(false) }
  }

  const saveBirth = async (val) => {
    if (!val) return
    setSavingBirth(true)
    try {
      await updateDoc(doc(db, 'falleros', userId), { fechaNacimiento: val })
      onUpdate({ fechaNacimiento: val })
    } finally { setSavingBirth(false) }
  }

  const birthDisplay = fmtBirthDisplay(fallero?.fechaNacimiento)

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Phone size={15} color={GOLD} />
        <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>Contacto</span>
      </div>

      {/* Número de fallero */}
      <EditableRow
        label="Nº Fallero"
        displayValue={numFallero != null ? `Nº ${String(numFallero).padStart(3, '0')}` : 'S/N'}
        editValue={numFallero != null ? String(numFallero) : ''}
        onSave={saveNumero}
        saving={savingNumero}
        inputProps={{ type: 'number', min: '1', inputMode: 'numeric', placeholder: 'Ej: 124', style: { width: 90 } }}
      />

      {/* Teléfono */}
      <EditableRow
        label="Teléfono"
        displayValue={
          fallero?.telefono
            ? <a href={`tel:${fallero.telefono}`} style={{ fontSize: 13, color: TEXT, fontWeight: 600, textDecoration: 'none' }}>{fallero.telefono}</a>
            : <span style={{ color: MUTED }}>Sin teléfono</span>
        }
        editValue={fallero?.telefono ?? ''}
        onSave={savePhone}
        saving={savingPhone}
        inputProps={{ type: 'tel', placeholder: '6XX XXX XXX', style: { width: 130 } }}
      />

      {/* Fecha de nacimiento (editable) */}
      <EditableRow
        label="Fecha de nacimiento"
        displayValue={birthDisplay ?? <span style={{ color: MUTED }}>Sin registrar</span>}
        editValue={fallero?.fechaNacimiento ?? ''}
        onSave={saveBirth}
        saving={savingBirth}
        inputProps={{ type: 'date', style: { width: 150 } }}
        last
      />
    </Card>
  )
}

// ─── Carnet Digital (dark — es un carnet físico) ──────────────────────────────
function CarnetDigital({ nombre, numFallero, rol, isLoading }) {
  const isAdmin   = rol === 'admin'
  // numFallero: number | null.  null → 'S-000'
  const numDisplay = numFallero != null ? String(numFallero).padStart(3, '0') : 'S-000'
  return (
    <div style={{
      borderRadius: 20, overflow: 'hidden',
      background: 'linear-gradient(145deg, #1a1a1a 0%, #0f0f0f 100%)',
      border: `1.5px solid rgba(212,175,55,0.35)`,
      boxShadow: '0 20px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(212,175,55,0.1)',
      marginBottom: 20, position: 'relative',
      animation: 'falla-fadeIn 0.4s ease-out',
    }}>
      {/* Header band */}
      <div style={{
        background: 'linear-gradient(90deg, #CE1126, #8a0a1a 40%, #D4AF37 100%)',
        padding: '0.75rem 1.25rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Flame size={16} color="white" strokeWidth={2} />
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: '800', color: 'white', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Falla Joaquín Costa
            </div>
            <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.7)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
              Burriana · Valencia
            </div>
          </div>
        </div>
        {isAdmin && (
          <div style={{
            background: 'rgba(255,255,255,0.2)', borderRadius: '6px', padding: '0.15rem 0.5rem',
            display: 'flex', alignItems: 'center', gap: '0.3rem',
          }}>
            <Shield size={10} color="white" fill="white" />
            <span style={{ fontSize: '0.58rem', fontWeight: '800', color: 'white', letterSpacing: '0.1em' }}>ADMIN</span>
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '1.5rem 1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginBottom: '1.25rem' }}>
          <div style={{
            width: 64, height: 64, flexShrink: 0,
            background: 'linear-gradient(135deg, rgba(212,175,55,0.2), rgba(206,17,38,0.2))',
            border: `1.5px solid rgba(212,175,55,0.3)`, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem',
          }}>
            👤
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
              Número de Fallero
            </div>
            <div style={{
              fontSize: '2.4rem', fontWeight: '900', lineHeight: 1, letterSpacing: '-0.02em',
              background: isLoading
                ? 'rgba(255,255,255,0.12)'
                : 'linear-gradient(180deg, #F5D06A 0%, #D4AF37 60%, #A07C1C 100%)',
              WebkitBackgroundClip: isLoading ? undefined : 'text',
              WebkitTextFillColor: isLoading ? 'transparent' : 'transparent',
              backgroundClip: isLoading ? undefined : 'text',
              borderRadius: isLoading ? 8 : 0,
              minWidth: isLoading ? 80 : undefined,
              minHeight: isLoading ? 38 : undefined,
              animation: isLoading ? 'falla-pulse 1.4s ease-in-out infinite' : undefined,
            }}>
              {isLoading ? ' ' : numDisplay}
            </div>
          </div>
        </div>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '1rem' }}>
          <div style={{
            fontSize: '1.05rem', fontWeight: '800', color: 'white', marginBottom: '0.4rem',
            ...(isLoading ? { background: 'rgba(255,255,255,0.1)', borderRadius: 6, color: 'transparent', minWidth: 120, animation: 'falla-pulse 1.4s ease-in-out infinite' } : {}),
          }}>{isLoading ? ' ' : nombre}</div>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
            padding: '0.2rem 0.6rem',
            background: isAdmin ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.07)',
            border: isAdmin ? '1px solid rgba(212,175,55,0.35)' : '1px solid rgba(255,255,255,0.1)',
            borderRadius: '100px',
          }}>
            {isAdmin
              ? <Shield size={10} color={GOLD} fill={GOLD} />
              : <Star size={10} color={GOLD} fill={GOLD} />}
            <span style={{ fontSize: '0.65rem', fontWeight: '700', color: isAdmin ? GOLD : 'rgba(255,255,255,0.6)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {isAdmin ? 'Administrador' : 'Fallero'}
            </span>
          </span>
        </div>
      </div>

      {/* Bottom strip */}
      <div style={{ height: '4px', background: 'linear-gradient(90deg, #CE1126, #D4AF37, #F5D06A, #D4AF37, #CE1126)' }} />

      {/* Shimmer */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', borderRadius: 20 }}>
        <div style={{
          position: 'absolute', top: 0, bottom: 0, width: '35%',
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.055), transparent)',
          animation: 'falla-cardShimmer 5s ease-in-out infinite',
        }} />
      </div>
    </div>
  )
}

// ─── Gestión de hijos ─────────────────────────────────────────────────────────
function normalizeHijo(h) {
  if (typeof h === 'string') return { nombre: h, fechaNacimiento: null }
  return h ?? { nombre: '', fechaNacimiento: null }
}

function HijosSection({ fallero, userId, onUpdate }) {
  const hijos = (fallero?.hijos ?? []).map(normalizeHijo)
  const [adding,     setAdding]     = useState(false)
  const [editingIdx, setEditingIdx] = useState(null)
  const [newNombre,  setNewNombre]  = useState('')
  const [newFecha,   setNewFecha]   = useState('')
  const [editNombre, setEditNombre] = useState('')
  const [editFecha,  setEditFecha]  = useState('')
  const [saving,     setSaving]     = useState(false)

  const saveArray = async (newArr) => {
    setSaving(true)
    try {
      await updateDoc(doc(db, 'falleros', userId), { hijos: newArr })
      onUpdate({ hijos: newArr })
    } finally { setSaving(false) }
  }

  const addHijo = async () => {
    const nombre = newNombre.trim()
    if (!nombre) return
    await saveArray([...hijos, { nombre, fechaNacimiento: newFecha || null }])
    setNewNombre(''); setNewFecha(''); setAdding(false)
  }

  const startEdit = (i) => {
    setEditingIdx(i)
    setEditNombre(hijos[i].nombre)
    setEditFecha(hijos[i].fechaNacimiento ?? '')
  }

  const saveEdit = async () => {
    const nombre = editNombre.trim()
    if (!nombre) return
    const next = hijos.map((h, i) => i === editingIdx ? { nombre, fechaNacimiento: editFecha || null } : h)
    await saveArray(next)
    setEditingIdx(null)
  }

  const removeHijo = (i) => saveArray(hijos.filter((_, j) => j !== i))

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: hijos.length > 0 || adding ? 14 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Baby size={16} color={GOLD} />
          <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>Hijos/as</span>
          {hijos.length > 0 && (
            <span style={{ background: `${GOLD}18`, color: GOLD, fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, border: `1px solid ${GOLD}35` }}>
              {hijos.length}
            </span>
          )}
        </div>
        {!adding && editingIdx === null && (
          <button onClick={() => setAdding(true)} style={{ background: `${GOLD}14`, color: GOLD, border: `1.5px solid ${GOLD}40`, borderRadius: 10, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', minHeight: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Plus size={13} /> Añadir
          </button>
        )}
      </div>

      {hijos.map((h, i) => {
        const age = calcAge(h.fechaNacimiento)
        return (
          <div key={i} style={{ borderTop: `1px solid ${BORDER}` }}>
            {editingIdx === i ? (
              <div style={{ padding: '10px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input value={editNombre} onChange={e => setEditNombre(e.target.value)} placeholder="Nombre" style={{ padding: '8px 12px', background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 10, fontSize: 13, color: TEXT, outline: 'none', fontFamily: 'inherit' }} onFocus={e => e.target.style.borderColor = GOLD} onBlur={e => e.target.style.borderColor = BORDER} />
                <input type="date" value={editFecha} onChange={e => setEditFecha(e.target.value)} style={{ padding: '8px 12px', background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 10, fontSize: 13, color: TEXT, outline: 'none', fontFamily: 'inherit' }} onFocus={e => e.target.style.borderColor = GOLD} onBlur={e => e.target.style.borderColor = BORDER} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={saveEdit} disabled={saving || !editNombre.trim()} style={{ flex: 1, background: GOLD, color: WHITE, border: 'none', borderRadius: 10, padding: '8px', fontSize: 12, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', minHeight: 'auto', opacity: !editNombre.trim() ? 0.5 : 1 }}>
                    {saving ? '…' : '💾 Guardar'}
                  </button>
                  <button onClick={() => setEditingIdx(null)} style={{ background: BORDER, color: MUTED, border: 'none', borderRadius: 10, padding: '8px 12px', cursor: 'pointer', minHeight: 'auto', display: 'flex', alignItems: 'center' }}>
                    <X size={14} />
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, background: `${GOLD}14`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                    {age !== null && age < 13 ? '🧒' : '👦'}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: TEXT }}>{h.nombre}</div>
                    {h.fechaNacimiento && (
                      <div style={{ fontSize: 11, color: MUTED }}>
                        {fmtBirthDisplay(h.fechaNacimiento) ?? h.fechaNacimiento}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => startEdit(i)} style={{ background: `${GOLD}12`, color: GOLD, border: `1.5px solid ${GOLD}30`, borderRadius: 8, padding: '6px', cursor: 'pointer', minHeight: 'auto', minWidth: 'auto', display: 'flex', alignItems: 'center' }}>
                    <Pencil size={12} />
                  </button>
                  <button onClick={() => removeHijo(i)} style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: '1.5px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '6px', cursor: 'pointer', minHeight: 'auto', minWidth: 'auto', display: 'flex', alignItems: 'center' }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {adding && (
        <div style={{ marginTop: hijos.length > 0 ? 12 : 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input autoFocus value={newNombre} onChange={e => setNewNombre(e.target.value)} onKeyDown={e => e.key === 'Enter' && addHijo()} placeholder="Nombre del hijo/a" style={{ padding: '10px 14px', background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 12, fontSize: 14, color: TEXT, outline: 'none', fontFamily: 'inherit' }} onFocus={e => e.target.style.borderColor = GOLD} onBlur={e => e.target.style.borderColor = BORDER} />
          <input type="date" value={newFecha} onChange={e => setNewFecha(e.target.value)} placeholder="Fecha de nacimiento" style={{ padding: '10px 14px', background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 12, fontSize: 14, color: TEXT, outline: 'none', fontFamily: 'inherit' }} onFocus={e => e.target.style.borderColor = GOLD} onBlur={e => e.target.style.borderColor = BORDER} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={addHijo} disabled={saving || !newNombre.trim()} style={{ flex: 1, background: GOLD, color: '#fff', border: 'none', borderRadius: 12, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', minHeight: 'auto', opacity: !newNombre.trim() ? 0.5 : 1 }}>
              {saving ? '…' : 'Añadir'}
            </button>
            <button onClick={() => { setAdding(false); setNewNombre(''); setNewFecha('') }} style={{ background: BORDER, color: MUTED, border: 'none', borderRadius: 12, padding: '10px 12px', cursor: 'pointer', minHeight: 'auto', display: 'flex', alignItems: 'center' }}>
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {hijos.length === 0 && !adding && (
        <p style={{ fontSize: 13, color: MUTED, margin: '8px 0 0' }}>
          Añade a tus hijos para inscribirlos en eventos fácilmente.
        </p>
      )}
    </Card>
  )
}

// ─── Vínculos familiares ──────────────────────────────────────────────────────
function normalizeSearch(str) {
  return (str ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function FamiliaSection({ fallero, userId, onUpdate }) {
  const familiaUids = fallero?.familiaUids ?? []
  const [familiaData,  setFamiliaData]  = useState([])
  const [loadingFam,   setLoadingFam]   = useState(false)
  const [showSearch,   setShowSearch]   = useState(false)
  const [fallerosList, setFallerosList] = useState([])
  const [search,       setSearch]       = useState('')
  const [linking,      setLinking]      = useState(false)
  const [linkError,    setLinkError]    = useState('')

  const familiaKey = familiaUids.join(',')
  useEffect(() => {
    if (familiaUids.length === 0) { setFamiliaData([]); return }
    setLoadingFam(true)
    Promise.all(familiaUids.map(uid => getDoc(doc(db, 'falleros', uid))))
      .then(docs => setFamiliaData(docs.filter(d => d.exists()).map(d => ({ uid: d.id, ...d.data() }))))
      .finally(() => setLoadingFam(false))
  }, [familiaKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const openSearch = async () => {
    setShowSearch(true); setSearch(''); setLinkError('')
    if (fallerosList.length === 0) {
      const snap = await getDocs(collection(db, 'falleros'))
      setFallerosList(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }
  }

  const filtered = useMemo(() => {
    const key = normalizeSearch(search)
    return fallerosList
      .filter(f => f.id !== userId && !familiaUids.includes(f.id))
      .filter(f => !key || normalizeSearch(`${f.nombre ?? ''} ${f.apellidos ?? ''}`).includes(key))
      .slice(0, 20)
  }, [fallerosList, search, userId, familiaKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const linkFamiliar = async (targetId, targetData) => {
    const targetFamily = targetData.familiaUids ?? []
    if (targetFamily.length > 0 && !targetFamily.includes(userId)) {
      setLinkError(`${targetData.nombre} ya pertenece a otro núcleo familiar.`)
      return
    }
    setLinking(true); setLinkError('')
    try {
      const batch = writeBatch(db)
      batch.update(doc(db, 'falleros', userId),   { familiaUids: arrayUnion(targetId) })
      batch.update(doc(db, 'falleros', targetId), { familiaUids: arrayUnion(userId) })
      await batch.commit()
      onUpdate({ familiaUids: [...familiaUids, targetId] })
      setShowSearch(false)
    } catch (err) {
      setLinkError(err?.message || 'Error al vincular.')
    } finally { setLinking(false) }
  }

  const unlinkFamiliar = async (targetId) => {
    try {
      const batch = writeBatch(db)
      batch.update(doc(db, 'falleros', userId),   { familiaUids: arrayRemove(targetId) })
      batch.update(doc(db, 'falleros', targetId), { familiaUids: arrayRemove(userId) })
      await batch.commit()
      onUpdate({ familiaUids: familiaUids.filter(uid => uid !== targetId) })
    } catch {}
  }

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: familiaData.length > 0 || showSearch ? 14 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Users size={16} color={GOLD} />
          <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>Vínculos familiares</span>
          {familiaData.length > 0 && (
            <span style={{ background: `${GOLD}18`, color: GOLD, fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, border: `1px solid ${GOLD}35` }}>
              {familiaData.length}
            </span>
          )}
        </div>
        {!showSearch && (
          <button onClick={openSearch} style={{ background: `${GOLD}14`, color: GOLD, border: `1.5px solid ${GOLD}40`, borderRadius: 10, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', minHeight: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            <UserPlus size={13} /> Vincular
          </button>
        )}
      </div>

      {loadingFam && <p style={{ fontSize: 12, color: MUTED, margin: 0 }}>Cargando…</p>}

      {familiaData.map(m => (
        <div key={m.uid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderTop: `1px solid ${BORDER}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, background: 'rgba(99,102,241,0.1)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>👫</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>{m.nombre} {m.apellidos ?? ''}</div>
              {m.numero && <div style={{ fontSize: 11, color: MUTED }}>Nº {m.numero}</div>}
            </div>
          </div>
          <button onClick={() => unlinkFamiliar(m.uid)} style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: '1.5px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '6px', cursor: 'pointer', minHeight: 'auto', minWidth: 'auto', display: 'flex', alignItems: 'center' }}>
            <UserMinus size={13} />
          </button>
        </div>
      ))}

      {familiaData.length === 0 && !showSearch && !loadingFam && (
        <p style={{ fontSize: 13, color: MUTED, margin: '8px 0 0' }}>
          Vincula a tu pareja u otros adultos de tu familia para gestionar inscripciones juntos.
        </p>
      )}

      {showSearch && (
        <div style={{ marginTop: familiaData.length > 0 ? 4 : 0 }}>
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <Search size={13} color={MUTED} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre…" style={{ width: '100%', padding: '9px 14px 9px 32px', background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 11, fontSize: 13, color: TEXT, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} onFocus={e => e.target.style.borderColor = GOLD} onBlur={e => e.target.style.borderColor = BORDER} />
          </div>
          {linkError && <p style={{ fontSize: 12, color: RED, margin: '0 0 8px', fontWeight: 600 }}>⚠️ {linkError}</p>}
          <div style={{ maxHeight: 196, overflowY: 'auto', border: `1.5px solid ${BORDER}`, borderRadius: 11, background: WHITE, marginBottom: 8 }}>
            {filtered.length === 0 ? (
              <p style={{ textAlign: 'center', fontSize: 13, color: MUTED, padding: '14px' }}>
                {search.length < 1 ? 'Empieza a escribir un nombre' : 'Sin resultados'}
              </p>
            ) : filtered.map(f => (
              <button key={f.id} type="button" onClick={() => linkFamiliar(f.id, f)} disabled={linking}
                style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', borderBottom: `1px solid ${BORDER}`, padding: '9px 14px', cursor: linking ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'inherit' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{f.nombre} {f.apellidos ?? ''}</div>
                  {f.numero && <div style={{ fontSize: 11, color: MUTED }}>Nº {f.numero}</div>}
                </div>
                {linking
                  ? <Loader2 size={14} color={GOLD} style={{ animation: 'falla-spin 0.8s linear infinite' }} />
                  : <span style={{ fontSize: 11, color: GOLD, fontWeight: 700 }}>Vincular →</span>
                }
              </button>
            ))}
          </div>
          <button onClick={() => { setShowSearch(false); setLinkError('') }} style={{ width: '100%', background: BORDER, color: MUTED, border: 'none', borderRadius: 10, padding: '8px', fontSize: 12, fontWeight: 600, cursor: 'pointer', minHeight: 'auto' }}>
            Cancelar
          </button>
        </div>
      )}
    </Card>
  )
}

// ─── Notification Preferences ────────────────────────────────────────────────

const NOTIF_PREFS = [
  { key: 'recordatorioEventos',       emoji: '⏰', label: 'Recordatorio de eventos',        desc: '24h antes del acto' },
  { key: 'nuevosAvisos',              emoji: '📢', label: 'Nuevos avisos de la directiva',   desc: 'Cuando se publique un aviso' },
  { key: 'confirmacionInscripciones', emoji: '✅', label: 'Confirmación de inscripciones',   desc: 'Al apuntarte a un evento' },
]

function NotificationPreferences({ fallero, userId, onUpdate }) {
  const prefs = fallero?.notificaciones ?? {}
  const [saving, setSaving] = useState(null)
  const { permission, loading: pushLoading, error: pushError, tokenSaved, enableNotifications } = usePushNotifications(userId)

  const toggle = async (key) => {
    const newVal = !(prefs[key] ?? true)
    setSaving(key)
    try {
      await updateDoc(doc(db, 'falleros', userId), { [`notificaciones.${key}`]: newVal })
      onUpdate({ notificaciones: { ...prefs, [key]: newVal } })
    } finally {
      setSaving(null)
    }
  }

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Bell size={15} color={GOLD} />
        <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>Configuración de Avisos</span>
      </div>

      {NOTIF_PREFS.map((p, i) => {
        const isOn   = prefs[p.key] ?? true
        const isLast = i === NOTIF_PREFS.length - 1
        return (
          <div
            key={p.key}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              paddingTop: 12, paddingBottom: isLast ? 0 : 12,
              borderTop: `1px solid ${BORDER}`,
            }}
          >
            <div style={{
              width: 36, height: 36, flexShrink: 0,
              background: BG, borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 17,
            }}>
              {p.emoji}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: TEXT, margin: '0 0 1px' }}>{p.label}</p>
              <p style={{ fontSize: 11, color: MUTED, margin: 0 }}>{p.desc}</p>
            </div>
            {/* Toggle pill */}
            <button
              onClick={() => toggle(p.key)}
              disabled={saving === p.key}
              style={{
                flexShrink: 0, width: 44, height: 24,
                background: isOn ? GOLD : '#D1D5DB',
                border: 'none', borderRadius: 12,
                cursor: saving === p.key ? 'not-allowed' : 'pointer',
                minHeight: 'auto', minWidth: 'auto',
                position: 'relative',
                transition: 'background 0.25s',
              }}
            >
              <div style={{
                position: 'absolute', top: 2,
                left: isOn ? 22 : 2,
                width: 20, height: 20,
                background: WHITE, borderRadius: '50%',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                transition: 'left 0.25s',
              }} />
            </button>
          </div>
        )
      })}

      {/* Push permission button */}
      <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: 14, paddingTop: 14 }}>
        {permission === 'unsupported' ? (
          <p style={{ fontSize: 11, color: MUTED, margin: 0 }}>
            Tu navegador no soporta notificaciones push.
          </p>
        ) : permission === 'denied' ? (
          <p style={{ fontSize: 11, color: RED, margin: 0 }}>
            🔕 Notificaciones bloqueadas. Actívalas en los ajustes del navegador.
          </p>
        ) : tokenSaved ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Check size={13} color={GREEN} strokeWidth={2.5} />
            <span style={{ fontSize: 12, color: GREEN, fontWeight: 600 }}>Notificaciones push activas</span>
          </div>
        ) : (
          <button
            onClick={enableNotifications}
            disabled={pushLoading}
            style={{
              width: '100%', minHeight: 42,
              background: pushLoading ? `${GOLD}40` : `linear-gradient(135deg, ${GOLD}, #8a6f1a)`,
              border: 'none', borderRadius: 12,
              color: WHITE, fontSize: 13, fontWeight: 700,
              cursor: pushLoading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              boxShadow: pushLoading ? 'none' : `0 4px 14px rgba(212,175,55,0.3)`,
            }}
          >
            {pushLoading
              ? <Loader2 size={15} style={{ animation: 'falla-spin 0.8s linear infinite' }} />
              : <><Bell size={14} /> Activar notificaciones push</>}
          </button>
        )}
        {pushError && <p style={{ fontSize: 11, color: RED, margin: '6px 0 0' }}>{pushError}</p>}
      </div>
    </Card>
  )
}

// ─── Admin: Quick Actions (push notifications) ────────────────────────────────

const GREEN = '#10b981'

function AdminQuickActions() {
  const [sending, setSending] = useState(null)
  const [result,  setResult]  = useState(null)

  const send = useCallback(async (title, body) => {
    setSending(title); setResult(null)
    try {
      const res = await enviarNotificacionFCM(title, body)
      setResult(`✅ Enviado a ${res.sent} dispositivo${res.sent !== 1 ? 's' : ''}`)
    } catch (err) {
      setResult(`❌ ${err?.message || 'Error al enviar'}`)
    } finally { setSending(null) }
  }, [])

  const actions = [
    {
      id: 'comida',
      emoji: '🥘',
      label: '¡Comida lista!',
      title: '🥘 ¡A COMER!',
      body: 'La comida ya está servida en el casal. ¡Ven antes de que se enfríe!',
      color: '#f97316',
    },
    {
      id: 'reunion',
      emoji: '📋',
      label: 'Convocar reunión',
      title: '📋 Convocatoria de reunión',
      body: 'Hay una reunión en el casal. ¡Os esperamos!',
      color: '#6366f1',
    },
  ]

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Zap size={15} color={RED} fill={`${RED}40`} />
        <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>Acciones Rápidas</span>
        <span style={{ background: 'rgba(206,17,38,0.08)', color: RED, fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, border: `1px solid rgba(206,17,38,0.22)` }}>
          PUSH
        </span>
      </div>
      <p style={{ fontSize: 12, color: MUTED, margin: '0 0 14px' }}>
        Envía una notificación push a todos los falleros con la app instalada.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {actions.map(a => (
          <button
            key={a.id}
            onClick={() => send(a.title, a.body)}
            disabled={!!sending}
            style={{
              width: '100%', minHeight: 52,
              background: sending === a.title ? `${a.color}30` : `${a.color}12`,
              border: `1.5px solid ${a.color}${sending === a.title ? '60' : '30'}`,
              borderRadius: 14, cursor: sending ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (!sending) e.currentTarget.style.background = `${a.color}22` }}
            onMouseLeave={e => { if (!sending) e.currentTarget.style.background = `${a.color}12` }}
          >
            <span style={{ fontSize: 24, flexShrink: 0 }}>{a.emoji}</span>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: TEXT }}>{a.label}</p>
              <p style={{ margin: 0, fontSize: 11, color: MUTED }}>{a.body.slice(0, 48)}…</p>
            </div>
            {sending === a.title
              ? <Loader2 size={17} color={a.color} style={{ animation: 'falla-spin 0.8s linear infinite', flexShrink: 0 }} />
              : <Bell size={15} color={a.color} style={{ flexShrink: 0 }} />
            }
          </button>
        ))}
      </div>
      {result && (
        <p style={{ margin: '12px 0 0', fontSize: 12, fontWeight: 600, color: result.startsWith('✅') ? GREEN : RED, textAlign: 'center' }}>
          {result}
        </p>
      )}
    </Card>
  )
}

// ─── Admin: Modal lista de inscritos ─────────────────────────────────────────
function AttendeesModal({ event, onClose }) {
  const [attendees, setAttendees] = useState([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    const q = query(
      collection(db, 'inscripciones'),
      where('eventId', '==', event.id),
      orderBy('createdAt', 'asc'),
    )
    const unsub = onSnapshot(q, snap => {
      setAttendees(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }, () => setLoading(false))
    return unsub
  }, [event.id])

  const totalPersonas = attendees.reduce((s, a) => s + (a.totalPersonas ?? 1), 0)

  const formatFecha = ts => {
    if (!ts) return ''
    const d = ts.toDate ? ts.toDate() : new Date(ts)
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const acompNames = a => {
    const adultos = (a.acompañantesAdultos ?? []).map(x => x.nombre).filter(Boolean)
    const ninos   = (a.acompañantesNinos   ?? []).map(x => x.nombre).filter(Boolean)
    return [...adultos, ...ninos].join(', ') || '—'
  }

  const handleDownload = () => {
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`
    const header = ['Nº Orden', 'Nombre', 'Acomp. adultos', 'Acomp. niños', 'Total personas', 'Nota', 'Alergias', 'Teléfono', 'Fecha inscripción', 'Delegación']
    const rows = attendees.map(a => [
      a.numeroOrden ?? '',
      a.nombre ?? '',
      (a.acompañantesAdultos ?? []).map(x => x.tipoRegistro ? `${x.nombre} [${x.tipoRegistro}]` : x.nombre).join(' | '),
      (a.acompañantesNinos   ?? []).map(x => x.tipoRegistro ? `${x.nombre} [${x.tipoRegistro}]` : x.nombre).join(' | '),
      a.totalPersonas ?? 1,
      a.nota      ?? '',
      a.alergias  ?? '',
      a.telefono  ?? '',
      formatFecha(a.createdAt),
      event.delegacion ?? 'General',
    ])
    const csv = [header, ...rows].map(r => r.map(esc).join(';')).join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `inscritos-${event.titulo.replace(/[^a-zA-Z0-9]/g, '-')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ width: '100%', maxWidth: '520px', background: WHITE, borderRadius: '24px 24px 0 0', padding: `1.25rem 1.25rem calc(1.25rem + env(safe-area-inset-bottom))`, animation: 'falla-slideUp 0.25s ease-out', maxHeight: '88dvh', display: 'flex', flexDirection: 'column', boxShadow: '0 -4px 40px rgba(0,0,0,0.18)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div style={{ width: 40, height: 4, background: BORDER, borderRadius: 2, margin: '0 auto 1rem' }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem', flexShrink: 0 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '800', color: TEXT }}>{event.titulo}</h3>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.78rem', color: TEXT2 }}>
              {loading ? '…' : `${attendees.length} inscripción${attendees.length !== 1 ? 'es' : ''} · ${totalPersonas} persona${totalPersonas !== 1 ? 's' : ''} en total`}
            </p>
          </div>
          <button onClick={onClose} style={{ background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '0.45rem', color: MUTED, display: 'flex', cursor: 'pointer', minHeight: 'auto', minWidth: 'auto', flexShrink: 0 }}>
            <X size={17} />
          </button>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflowY: 'auto', marginBottom: '0.875rem', borderRadius: 14, border: `1.5px solid ${BORDER}`, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2.5rem 0' }}>
              <Loader2 size={22} color={GOLD} style={{ animation: 'falla-spin 0.8s linear infinite', display: 'inline-block' }} />
            </div>
          ) : attendees.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: MUTED, fontSize: '0.85rem' }}>
              Nadie apuntado todavía
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ background: BG, borderBottom: `1.5px solid ${BORDER}` }}>
                  {['Nº', 'Nombre', 'Acompañantes', 'Total'].map(h => (
                    <th key={h} style={{ padding: '9px 10px', textAlign: 'left', fontWeight: 700, color: TEXT2, fontSize: '0.72rem', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {attendees.map((a, i) => (
                  <tr key={a.id} style={{ borderBottom: i < attendees.length - 1 ? `1px solid ${BORDER}` : 'none', background: i % 2 === 0 ? WHITE : BG }}>
                    <td style={{ padding: '9px 10px', color: MUTED, fontWeight: 600, whiteSpace: 'nowrap' }}>{a.numeroOrden ?? i + 1}</td>
                    <td style={{ padding: '9px 10px', fontWeight: 600, color: TEXT, minWidth: 100 }}>
                      {a.nombre}
                      {a.nota && <div style={{ fontSize: '0.68rem', color: MUTED, fontWeight: 400, marginTop: 1 }}>{a.nota}</div>}
                    </td>
                    <td style={{ padding: '9px 10px', color: TEXT2, maxWidth: 140, wordBreak: 'break-word' }}>
                      {(a.acompañantes ?? 0) === 0 ? <span style={{ color: MUTED }}>—</span> : acompNames(a)}
                    </td>
                    <td style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>
                      <span style={{ background: `${GOLD}18`, color: GOLD, fontWeight: 700, fontSize: '0.75rem', padding: '2px 8px', borderRadius: 20, border: `1px solid ${GOLD}30` }}>
                        {a.totalPersonas ?? 1}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: `${GOLD}08`, borderTop: `1.5px solid ${BORDER}` }}>
                  <td colSpan={3} style={{ padding: '8px 10px', fontWeight: 700, color: TEXT, fontSize: '0.78rem' }}>Total personas</td>
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{ background: GOLD, color: WHITE, fontWeight: 700, fontSize: '0.78rem', padding: '2px 9px', borderRadius: 20 }}>{totalPersonas}</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* CSV button */}
        {!loading && attendees.length > 0 && (
          <button
            onClick={handleDownload}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              width: '100%', minHeight: '50px', flexShrink: 0,
              background: `linear-gradient(135deg, ${GOLD}, #8a6f1a)`,
              border: 'none', borderRadius: '14px',
              color: WHITE, fontSize: '0.9rem', fontWeight: '700',
              cursor: 'pointer', boxShadow: `0 4px 18px ${GOLD}40`,
            }}
          >
            <Download size={17} />
            📥 Descargar CSV
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Panel de Admin ───────────────────────────────────────────────────────────
function AdminPanel() {
  const [events, setEvents]          = useState([])
  const [loading, setLoading]        = useState(true)
  const [selectedEvent, setSelected] = useState(null)
  const [inscCountMap, setInscCountMap] = useState({})

  useEffect(() => {
    getDocs(query(collection(db, 'eventos'), orderBy('fecha', 'asc')))
      .then(snap => setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'inscripciones'), snap => {
      const map = {}
      snap.forEach(d => {
        const { eventId, totalPersonas = 1 } = d.data()
        if (eventId) map[eventId] = (map[eventId] ?? 0) + totalPersonas
      })
      setInscCountMap(map)
    })
    return unsub
  }, [])

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Shield size={15} color={GOLD} fill={`${GOLD}40`} />
        <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>Panel de Administración</span>
        <span style={{ background: `${GOLD}18`, color: GOLD, fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, border: `1px solid ${GOLD}35` }}>
          ADMIN
        </span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
          <Loader2 size={20} color={GOLD} style={{ animation: 'falla-spin 0.8s linear infinite', display: 'inline-block' }} />
        </div>
      ) : events.length === 0 ? (
        <p style={{ color: MUTED, fontSize: 13, textAlign: 'center', padding: '1rem 0', margin: 0 }}>
          No hay eventos creados
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {events.map(ev => (
            <button
              key={ev.id}
              onClick={() => setSelected(ev)}
              style={{
                width: '100%', textAlign: 'left',
                background: BG, border: `1.5px solid ${BORDER}`,
                borderRadius: 14, padding: '12px 14px',
                cursor: 'pointer', minHeight: 'auto',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = `${GOLD}60`}
              onMouseLeave={e => e.currentTarget.style.borderColor = BORDER}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 2 }}>{ev.titulo}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Users size={11} color={GOLD} />
                  <span style={{ fontSize: 11, color: GOLD, fontWeight: 600 }}>{inscCountMap[ev.id] ?? 0} inscritos</span>
                  <span style={{ fontSize: 11, color: MUTED }}>· Ver lista y CSV</span>
                </div>
              </div>
              <ChevronRight size={15} color={MUTED} />
            </button>
          ))}
        </div>
      )}

      {selectedEvent && (
        <AttendeesModal event={selectedEvent} onClose={() => setSelected(null)} />
      )}
    </Card>
  )
}

// ─── Profile (main export) ────────────────────────────────────────────────────
export default function Profile() {
  const { user, fallero, loading, logout, updateFallero } = useAuth()

  // Support all field name variants across app versions
  const numFallero   = fallero?.numeroFallero ?? fallero?.memberNumber ?? fallero?.numero ?? null
  const nombre       = fallero ? `${fallero.nombre} ${fallero.apellidos ?? ''}`.trim() : user?.displayName || user?.email?.split('@')[0] || 'Fallero'
  const rol          = fallero?.rol ?? 'fallero'
  const isAdmin      = rol === 'admin'
  const isPrivileged = rol === 'admin' || rol === 'directiva'

  return (
    <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 26, fontWeight: 700, color: TEXT, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Mi Perfil</h2>
        <p style={{ fontSize: 13, color: TEXT2, margin: 0 }}>Tu carnet digital de fallero</p>
      </div>

      <CarnetDigital nombre={nombre} numFallero={numFallero} rol={rol} isLoading={loading} />

      {/* Info */}
      <Card>
        <InfoRow label="Email" value={user?.email ?? '—'} />
        <InfoRow label="Rol" value={isAdmin ? '👑 Administrador' : '🔥 Fallero'} />
        <InfoRow label="Estado" value={fallero?.estaActivo ? '✅ Activo' : '⏸ Inactivo'} last />
      </Card>

      {/* Contact info */}
      {user && fallero && (
        <ContactSection
          fallero={fallero}
          userId={user.uid}
          onUpdate={updateFallero}
        />
      )}

      {/* Hijos */}
      {user && (
        <HijosSection
          fallero={fallero}
          userId={user.uid}
          onUpdate={updateFallero}
        />
      )}

      {/* Vínculos familiares */}
      {user && (
        <FamiliaSection
          fallero={fallero}
          userId={user.uid}
          onUpdate={updateFallero}
        />
      )}

      {/* Notification preferences */}
      {user && (
        <NotificationPreferences
          fallero={fallero}
          userId={user.uid}
          onUpdate={updateFallero}
        />
      )}

      {/* Admin quick actions + panel */}
      {isPrivileged && <AdminQuickActions />}
      {isPrivileged && <AdminPanel />}

      {/* Logout */}
      <button
        onClick={() => { if (window.confirm('¿Cerrar sesión? Tendrás que volver a entrar con tu email y contraseña.')) logout() }}
        style={{
          width: '100%', minHeight: '50px', marginTop: 4,
          background: 'rgba(239,68,68,0.06)',
          border: '1.5px solid rgba(239,68,68,0.2)',
          borderRadius: 16, color: '#EF4444',
          fontSize: 14, fontWeight: 700, cursor: 'pointer',
        }}
      >
        Cerrar sesión
      </button>
    </div>
  )
}
