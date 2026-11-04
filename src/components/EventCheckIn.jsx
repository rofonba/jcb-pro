import { useState, useEffect, useMemo } from 'react'
import {
  collection, query, where, onSnapshot, doc, runTransaction, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { ArrowLeft, ScanLine, Loader2, Search, DoorOpen } from 'lucide-react'

const GOLD  = '#D4AF37'
const RED   = '#CE1126'
const GREEN = '#10b981'
const CARD  = '#141414'

// Adultos / niños de una inscripción (formato nuevo con arrays y formato antiguo).
function getCounts(ins) {
  if (ins.acompañantesAdultos !== undefined || ins.acompañantesNinos !== undefined) {
    return { adultos: 1 + (ins.acompañantesAdultos?.length ?? 0), ninos: ins.acompañantesNinos?.length ?? 0 }
  }
  return ins.esHijo
    ? { adultos: 0, ninos: ins.totalPersonas ?? 1 }
    : { adultos: ins.totalPersonas ?? 1, ninos: 0 }
}

// Evita inyección de fórmulas en Excel/Sheets (=, +, -, @) y escapa comillas.
function csvCell(v) {
  let s = String(v ?? '')
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}

// Exporta TODOS los apuntados: Nombre, Adultos, Niños, Total Pagado, ID Transacción.
export function exportAttendeesCsv(event, inscriptions) {
  const rows = [
    ['Nombre', 'Adultos', 'Niños', 'Total Pagado (€)', 'ID Transacción'],
    ...inscriptions.map(i => {
      const { adultos, ninos } = getCounts(i)
      return [
        i.nombre ?? '',
        adultos,
        ninos,
        i.pagado && i.totalConComision != null ? Number(i.totalConComision).toFixed(2) : '',
        i.stripePaymentId ?? '',
      ]
    }),
  ]
  const csv = '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `lista-${(event.titulo ?? 'evento').replace(/\s+/g, '-')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function EventCheckIn({ event, onClose }) {
  const { fallero } = useAuth()
  const isStaff = fallero?.rol === 'admin' || fallero?.rol === 'directiva'

  const [inscriptions, setInscriptions] = useState([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [busyId,       setBusyId]       = useState(null)
  const [error,        setError]        = useState('')

  useEffect(() => {
    if (!isStaff) return
    const q = query(collection(db, 'inscripciones'), where('eventId', '==', event.id))
    return onSnapshot(q, snap => {
      setInscriptions(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }, () => setLoading(false))
  }, [event.id, isStaff])

  const paid = useMemo(() => {
    const list = inscriptions
      .filter(i => i.pagado === true)
      .sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es'))
    const q = search.trim().toLowerCase()
    return q ? list.filter(i => (i.nombre ?? '').toLowerCase().includes(q)) : list
  }, [inscriptions, search])

  const totalPaid   = inscriptions.filter(i => i.pagado === true).length
  const totalIn     = inscriptions.filter(i => i.pagado === true && i.checkIn === true).length

  // Transacción: relee el documento y sólo marca si todavía no ha entrado
  // (evita doble entrada si dos puertas pulsan a la vez).
  const handleCheckIn = async (ins) => {
    setBusyId(ins.id); setError('')
    try {
      await runTransaction(db, async (tx) => {
        const ref  = doc(db, 'inscripciones', ins.id)
        const snap = await tx.get(ref)
        if (!snap.exists()) throw new Error('La inscripción ya no existe.')
        if (snap.data().checkIn === true) throw new Error(`${ins.nombre} ya ha entrado.`)
        tx.update(ref, { checkIn: true, checkInAt: serverTimestamp() })
      })
    } catch (err) {
      setError(err?.message || 'No se pudo registrar la entrada.')
    } finally { setBusyId(null) }
  }

  if (!isStaff) return null

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ width: '100%', maxWidth: 480, background: CARD, border: '1px solid rgba(212,175,55,0.2)', borderRadius: '24px 24px 0 0', padding: '1.5rem 1.5rem calc(1.5rem + env(safe-area-inset-bottom))', maxHeight: '92dvh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexShrink: 0 }}>
          <button onClick={onClose}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.25)', borderRadius: 10, padding: '0.45rem 0.75rem', color: GOLD, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', minHeight: 'auto', minWidth: 'auto' }}>
            <ArrowLeft size={14} /> Volver
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ScanLine size={14} color={GOLD} />
              <span style={{ fontSize: '0.9rem', fontWeight: 800, color: GOLD }}>Check-in</span>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: 'rgba(255,255,255,0.38)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{event.titulo}</p>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 900, color: GREEN, lineHeight: 1 }}>{totalIn}/{totalPaid}</div>
            <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Han entrado</div>
          </div>
        </div>

        <div style={{ position: 'relative', marginBottom: '0.75rem', flexShrink: 0 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre…"
            style={{ width: '100%', padding: '0.7rem 0.9rem 0.7rem 2.2rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: 'white', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
          />
        </div>

        {error && (
          <div style={{ padding: '0.6rem 0.9rem', background: 'rgba(206,17,38,0.1)', border: '1px solid rgba(206,17,38,0.3)', borderRadius: 10, marginBottom: '0.75rem', color: '#ff8080', fontSize: '0.8rem', flexShrink: 0 }}>{error}</div>
        )}

        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'rgba(255,255,255,0.35)' }}>
              <Loader2 size={20} style={{ animation: 'falla-spin 0.8s linear infinite' }} />
            </div>
          ) : paid.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: '0.85rem', padding: '2rem 0' }}>
              {search ? 'Sin resultados' : 'Nadie ha pagado este evento todavía'}
            </p>
          ) : paid.map(ins => {
            const { adultos, ninos } = getCounts(ins)
            const entered = ins.checkIn === true
            const at = ins.checkInAt?.toDate ? ins.checkInAt.toDate().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : null
            return (
              <div key={ins.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 0.9rem', background: entered ? 'rgba(16,185,129,0.07)' : 'rgba(255,255,255,0.04)', border: `1px solid ${entered ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'white', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{ins.nombre}</div>
                  <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                    {adultos} adulto{adultos !== 1 ? 's' : ''}{ninos > 0 ? ` · ${ninos} niño${ninos !== 1 ? 's' : ''}` : ''}
                    {ins.totalConComision != null && ` · ${Number(ins.totalConComision).toFixed(2)} €`}
                  </div>
                </div>
                {entered ? (
                  <span style={{ flexShrink: 0, padding: '0.5rem 0.75rem', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: 10, color: GREEN, fontSize: '0.75rem', fontWeight: 800, textAlign: 'center' }}>
                    ✅ Ya ha entrado{at ? ` · ${at}` : ''}
                  </span>
                ) : (
                  <button onClick={() => handleCheckIn(ins)} disabled={busyId === ins.id}
                    style={{ flexShrink: 0, minHeight: 44, padding: '0 0.9rem', background: busyId === ins.id ? 'rgba(212,175,55,0.3)' : `linear-gradient(135deg, ${GOLD}, #8a6f1a)`, border: 'none', borderRadius: 10, color: 'white', fontSize: '0.78rem', fontWeight: 800, cursor: busyId === ins.id ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {busyId === ins.id ? <Loader2 size={14} style={{ animation: 'falla-spin 0.8s linear infinite' }} /> : <><DoorOpen size={14} /> Hacer Check-in</>}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
