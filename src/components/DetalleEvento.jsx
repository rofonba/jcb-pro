import { useState, useEffect, useMemo, useRef } from 'react'
import {
  doc, collection, query, where, onSnapshot,
  getDocs, deleteDoc, documentId,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { X, Users, Phone, Edit2, Download, Trash2, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { RegistrationModal, EventFormModal, CancelConfirmModal, DeleteEventModal } from './EventList'

const GOLD   = '#D4AF37'
const BG     = '#F9FAFB'
const WHITE  = '#FFFFFF'
const TEXT   = '#111827'
const TEXT2  = '#6B7280'
const MUTED  = '#9CA3AF'
const BORDER = '#F3F4F6'
const GREEN  = '#10b981'
const RED    = '#CE1126'

const EVENT_TYPES = {
  comida:  { emoji: '🍽️', label: 'Comida',  color: GOLD },
  cena:    { emoji: '🌙', label: 'Cena',    color: '#6366f1' },
  acto:    { emoji: '🎭', label: 'Acto',    color: RED },
  reunion: { emoji: '📋', label: 'Reunión', color: TEXT2 },
}

function fmtDateLong(f) {
  if (!f) return '—'
  const d = f?.toDate ? f.toDate() : new Date(f)
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
function fmtTime(f) {
  if (!f) return ''
  const d = f?.toDate ? f.toDate() : new Date(f)
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

function MetaRow({ icon, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 15, flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: 13, color: TEXT, fontWeight: 500 }}>{label}</span>
    </div>
  )
}

export default function DetalleEvento({ eventId, onClose, onRegistered, onCancelled }) {
  const { user, fallero } = useAuth()
  const userId  = user?.uid
  const isAdmin = fallero?.rol === 'admin' || fallero?.rol === 'directiva'

  const [event,          setEvent]          = useState(null)
  const [loadingEvent,   setLoadingEvent]   = useState(true)
  const [inscripciones,  setInscripciones]  = useState([])

  const [showRegistration, setShowRegistration] = useState(false)
  const [showCancel,       setShowCancel]       = useState(false)
  const [showEdit,         setShowEdit]         = useState(false)
  const [showDelete,       setShowDelete]       = useState(false)
  const [showAttendees,    setShowAttendees]    = useState(false)
  const [showPhones,       setShowPhones]       = useState(false)
  const [phones,           setPhones]           = useState({})
  const [loadingPhones,    setLoadingPhones]    = useState(false)
  const [deleting,         setDeleting]         = useState(false)

  const seenRef = useRef(false)

  useEffect(() => {
    return onSnapshot(doc(db, 'eventos', eventId), snap => {
      if (snap.exists()) {
        seenRef.current = true
        setEvent({ id: snap.id, ...snap.data() })
      } else if (seenRef.current) {
        onClose()
        return
      } else {
        setEvent(null)
      }
      setLoadingEvent(false)
    })
  }, [eventId])

  useEffect(() => {
    const q = query(collection(db, 'inscripciones'), where('eventId', '==', eventId))
    return onSnapshot(q, snap => setInscripciones(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [eventId])

  const isRegistered = useMemo(
    () => inscripciones.some(i => i.uid === userId && !i.esManual),
    [inscripciones, userId],
  )

  const totalAsistentes = useMemo(
    () => inscripciones.reduce((s, i) => s + (i.totalPersonas ?? 1), 0),
    [inscripciones],
  )

  const isPast = useMemo(() => {
    if (!event?.fecha) return false
    const d = event.fecha?.toDate ? event.fecha.toDate() : new Date(event.fecha)
    return d < new Date()
  }, [event?.fecha])

  const disponibles = event?.plazasTotal != null
    ? Math.max(0, event.plazasTotal - totalAsistentes)
    : null
  const isFull = event?.plazasTotal != null && disponibles <= 0 && !isRegistered

  const loadPhones = async () => {
    setLoadingPhones(true)
    const uids = [...new Set(inscripciones.filter(i => i.uid && i.uid !== 'manual').map(i => i.uid))]
    if (!uids.length) { setLoadingPhones(false); return }
    const phoneMap = {}
    try {
      for (let i = 0; i < uids.length; i += 10) {
        const chunk = uids.slice(i, i + 10)
        const snap = await getDocs(query(collection(db, 'falleros'), where(documentId(), 'in', chunk)))
        snap.docs.forEach(d => { phoneMap[d.id] = d.data().telefono ?? '—' })
      }
    } catch {}
    setPhones(phoneMap)
    setLoadingPhones(false)
  }

  const handleTogglePhones = () => {
    if (!showPhones && Object.keys(phones).length === 0) loadPhones()
    setShowPhones(v => !v)
  }

  const handleDownload = () => {
    if (!event) return
    const lines = [
      `LISTA DE INSCRITOS — ${event.titulo}`,
      `Fecha: ${fmtDateLong(event.fecha)} · ${fmtTime(event.fecha)}`,
      `Lugar: ${event.lugar ?? '—'}`,
      `Total personas: ${totalAsistentes}`,
      '',
      ...inscripciones.map((ins, idx) => {
        const phone = phones[ins.uid] ? ` · Tel: ${phones[ins.uid]}` : ''
        const n = ins.totalPersonas ?? 1
        return `${idx + 1}. ${ins.nombre ?? '—'}${phone} (${n} persona${n !== 1 ? 's' : ''})`
      }),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `inscritos-${(event.titulo ?? 'evento').replace(/\s+/g, '-').toLowerCase()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleConfirmCancel = async () => {
    if (deleting) return
    setDeleting(true)
    try {
      const snap = await getDocs(query(
        collection(db, 'inscripciones'),
        where('eventId', '==', eventId),
        where('uid', '==', userId),
      ))
      await Promise.all(snap.docs.map(d => deleteDoc(d.ref)))
      setShowCancel(false)
      onCancelled?.(eventId)
    } catch {
      setDeleting(false)
    }
  }

  const handleConfirmDelete = async () => {
    setDeleting(true)
    try {
      const snap = await getDocs(query(collection(db, 'inscripciones'), where('eventId', '==', eventId)))
      await Promise.all(snap.docs.map(d => deleteDoc(d.ref)))
      await deleteDoc(doc(db, 'eventos', eventId))
      onClose()
    } catch {
      setDeleting(false)
      setShowDelete(false)
    }
  }

  const t = event ? (EVENT_TYPES[event.tipo] ?? EVENT_TYPES.acto) : EVENT_TYPES.acto

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 90, backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
      />

      {/* Bottom sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 91,
        background: WHITE, borderRadius: '24px 24px 0 0',
        maxHeight: '92dvh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
        animation: 'falla-slideUp 0.3s ease-out',
      }}>
        {/* Handle + header */}
        <div style={{ padding: '12px 20px 0', flexShrink: 0 }}>
          <div style={{ width: 40, height: 4, background: BORDER, borderRadius: 2, margin: '0 auto 14px' }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
            {loadingEvent ? (
              <div style={{ height: 24, flex: 1, background: BORDER, borderRadius: 8, animation: 'falla-pulse 1.6s infinite' }} />
            ) : (
              <>
                <span style={{ fontSize: 26, flexShrink: 0, lineHeight: 1 }}>{t.emoji}</span>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: TEXT, lineHeight: 1.25, flex: 1, minWidth: 0 }}>
                  {event?.titulo}
                </h2>
              </>
            )}
            <button
              onClick={onClose}
              style={{ background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', minHeight: 'auto', minWidth: 'auto', flexShrink: 0 }}
            >
              <X size={16} color={TEXT2} />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '0 20px 40px' }}>
          {loadingEvent ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 12 }}>
              {[70, 130, 110, 180].map((h, i) => (
                <div key={i} style={{ height: h, background: BORDER, borderRadius: 16, animation: 'falla-pulse 1.6s infinite' }} />
              ))}
            </div>
          ) : !event ? (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <p style={{ color: MUTED, fontSize: 14 }}>Evento no encontrado</p>
            </div>
          ) : (
            <>
              {/* Badges */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                <span style={{ background: `${t.color}14`, border: `1px solid ${t.color}30`, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700, color: t.color }}>
                  {t.label}
                </span>
                {isPast && (
                  <span style={{ background: 'rgba(0,0,0,0.05)', border: `1px solid ${BORDER}`, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600, color: MUTED }}>
                    Pasado
                  </span>
                )}
                {isRegistered && (
                  <span style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700, color: GREEN }}>
                    ✅ Apuntado
                  </span>
                )}
              </div>

              {/* Image */}
              {event.imagenUrl && (
                <img
                  src={event.imagenUrl}
                  alt={event.titulo}
                  style={{ width: '100%', height: 200, objectFit: 'cover', borderRadius: 16, marginBottom: 14, border: `1.5px solid ${BORDER}` }}
                />
              )}

              {/* Meta */}
              <div style={{ background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '14px 16px', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <MetaRow icon="📅" label={fmtDateLong(event.fecha)} />
                {fmtTime(event.fecha) && <MetaRow icon="🕐" label={fmtTime(event.fecha)} />}
                {event.lugar && <MetaRow icon="📍" label={event.lugar} />}
                <MetaRow icon="💶" label={event.precio != null ? `${event.precio} € por persona` : 'Gratuito'} />
              </div>

              {/* Capacity bar */}
              {event.plazasTotal != null && (
                <div style={{ background: BG, border: `1.5px solid ${isFull ? 'rgba(206,17,38,0.25)' : BORDER}`, borderRadius: 16, padding: '12px 16px', marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Users size={13} color={isFull ? RED : TEXT2} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: isFull ? RED : TEXT2 }}>
                        {isFull ? 'Aforo completo' : `${disponibles} plaza${disponibles !== 1 ? 's' : ''} libre${disponibles !== 1 ? 's' : ''}`}
                      </span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: isFull ? RED : GOLD }}>
                      {totalAsistentes} / {event.plazasTotal}
                    </span>
                  </div>
                  <div style={{ height: 6, background: BORDER, borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.min(100, (totalAsistentes / event.plazasTotal) * 100)}%`,
                      background: isFull ? RED : GOLD,
                      borderRadius: 3, transition: 'width 0.4s',
                    }} />
                  </div>
                </div>
              )}

              {/* Description */}
              <div style={{ marginBottom: 14 }}>
                <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: TEXT2, letterSpacing: '0.07em', textTransform: 'uppercase' }}>Descripción</p>
                <p style={{ margin: 0, fontSize: 14, color: event.descripcion ? TEXT : MUTED, lineHeight: 1.6, whiteSpace: 'pre-wrap', fontStyle: event.descripcion ? 'normal' : 'italic' }}>
                  {event.descripcion || 'Sin descripción disponible'}
                </p>
              </div>

              {/* Menu */}
              {event.menu && (
                <div style={{ background: `${GOLD}08`, border: `1.5px solid ${GOLD}25`, borderRadius: 16, padding: '14px 16px', marginBottom: 14 }}>
                  <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: '0.07em', textTransform: 'uppercase' }}>🍽️ Menú</p>
                  <p style={{ margin: 0, fontSize: 13, color: TEXT, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{event.menu}</p>
                </div>
              )}

              {/* CTA */}
              {!isPast && (
                <div style={{ marginBottom: 14 }}>
                  {isRegistered ? (
                    <button
                      onClick={() => setShowCancel(true)}
                      style={{ width: '100%', minHeight: 52, background: 'transparent', border: `2px solid rgba(206,17,38,0.4)`, borderRadius: 16, color: RED, fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                    >
                      ✕ Cancelar inscripción
                    </button>
                  ) : isFull ? (
                    <div style={{ textAlign: 'center', padding: '14px', background: 'rgba(206,17,38,0.06)', border: `1.5px solid rgba(206,17,38,0.2)`, borderRadius: 16 }}>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: RED }}>Aforo completo</p>
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: TEXT2 }}>No quedan plazas disponibles</p>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowRegistration(true)}
                      style={{ width: '100%', minHeight: 52, background: `linear-gradient(135deg, ${RED}, #a00d1e)`, border: 'none', borderRadius: 16, color: WHITE, fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: `0 6px 24px rgba(206,17,38,0.3)`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                    >
                      ✅ Apuntarme
                    </button>
                  )}
                </div>
              )}

              {/* Attendees */}
              {inscripciones.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <button
                    onClick={() => setShowAttendees(v => !v)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', padding: '8px 0', cursor: 'pointer', minHeight: 'auto' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <Users size={14} color={TEXT2} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>
                        Inscritos — {totalAsistentes} persona{totalAsistentes !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {showAttendees ? <ChevronUp size={16} color={TEXT2} /> : <ChevronDown size={16} color={TEXT2} />}
                  </button>

                  {showAttendees && (
                    <div style={{ background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 16, overflow: 'hidden' }}>
                      {isAdmin && (
                        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${BORDER}` }}>
                          <button
                            onClick={handleTogglePhones}
                            disabled={loadingPhones}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, background: showPhones ? `${GOLD}14` : 'transparent', border: `1px solid ${showPhones ? `${GOLD}50` : BORDER}`, borderRadius: 10, padding: '5px 10px', cursor: loadingPhones ? 'not-allowed' : 'pointer', minHeight: 'auto', transition: 'all 0.15s' }}
                          >
                            {loadingPhones
                              ? <Loader2 size={12} style={{ animation: 'falla-spin 0.8s linear infinite' }} color={GOLD} />
                              : <Phone size={12} color={showPhones ? GOLD : TEXT2} />}
                            <span style={{ fontSize: 11, fontWeight: 700, color: showPhones ? GOLD : TEXT2 }}>
                              {showPhones ? 'Ocultar teléfonos' : 'Ver teléfonos'}
                            </span>
                          </button>
                        </div>
                      )}

                      {inscripciones.map((ins, idx) => (
                        <div
                          key={ins.id}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: idx < inscripciones.length - 1 ? `1px solid ${BORDER}` : 'none' }}
                        >
                          <div style={{ width: 30, height: 30, flexShrink: 0, background: `${ins.esManual ? '#818cf8' : t.color}14`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
                            {ins.esManual ? '🎫' : '👤'}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: TEXT, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                              {ins.nombre ?? '—'}
                            </p>
                            {(ins.acompañantes ?? 0) > 0 && (
                              <p style={{ margin: '1px 0 0', fontSize: 11, color: TEXT2 }}>
                                +{ins.acompañantes} acompañante{ins.acompañantes > 1 ? 's' : ''} · {ins.totalPersonas} personas
                              </p>
                            )}
                            {showPhones && phones[ins.uid] && (
                              <p style={{ margin: '1px 0 0', fontSize: 11, color: GOLD, fontWeight: 600 }}>
                                📞 {phones[ins.uid]}
                              </p>
                            )}
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: MUTED, flexShrink: 0 }}>
                            {ins.totalPersonas ?? 1}p
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Admin actions */}
              {isAdmin && (
                <div style={{ borderTop: `1.5px solid ${BORDER}`, paddingTop: 16 }}>
                  <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: TEXT2, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Gestión admin
                  </p>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={() => setShowEdit(true)}
                      style={{ flex: 1, minHeight: 46, background: `${GOLD}0e`, border: `1.5px solid ${GOLD}30`, borderRadius: 14, color: GOLD, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
                    >
                      <Edit2 size={13} /> Editar
                    </button>
                    <button
                      onClick={handleDownload}
                      style={{ flex: 1, minHeight: 46, background: 'rgba(99,102,241,0.08)', border: '1.5px solid rgba(99,102,241,0.25)', borderRadius: 14, color: '#6366f1', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
                    >
                      <Download size={13} /> Descargar
                    </button>
                    <button
                      onClick={() => setShowDelete(true)}
                      style={{ flex: 1, minHeight: 46, background: 'rgba(206,17,38,0.06)', border: '1.5px solid rgba(206,17,38,0.22)', borderRadius: 14, color: RED, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
                    >
                      <Trash2 size={13} /> Eliminar
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Sub-modals (zIndex 100+, above the sheet) ─────────────────────────── */}

      {showRegistration && event && (
        <RegistrationModal
          event={event}
          isRegistered={false}
          onClose={() => setShowRegistration(false)}
          onSuccess={() => {
            setShowRegistration(false)
            onRegistered?.(eventId)
          }}
          onCancelled={(evId) => {
            setShowRegistration(false)
            onCancelled?.(evId)
          }}
        />
      )}

      {showCancel && event && (
        <CancelConfirmModal
          event={event}
          onConfirm={handleConfirmCancel}
          onCancel={() => !deleting && setShowCancel(false)}
          deleting={deleting}
        />
      )}

      {showEdit && event && (
        <EventFormModal
          event={event}
          onClose={() => setShowEdit(false)}
          onCreated={() => setShowEdit(false)}
        />
      )}

      {showDelete && event && (
        <DeleteEventModal
          event={event}
          onConfirm={handleConfirmDelete}
          onCancel={() => !deleting && setShowDelete(false)}
          deleting={deleting}
        />
      )}
    </>
  )
}
