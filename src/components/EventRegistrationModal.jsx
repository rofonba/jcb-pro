// Checkout de GRUPO (modelo v2): el pagador suma asistentes y hace UN solo pago.
//
// Bloques, en orden de menor fricción:
//   1. Mi familia e hijos   → yo, familiares (useFamilia) y mis hijos del censo (checkboxes)
//   2/3. Otros falleros     → buscador del directorio (adultos e hijos); si no está: "fallero sin app"
//   4. Invitados            → personas de fuera de la falla (nombre, apellidos, adulto/infantil)
//
// Duplicados: se escuchan las inscripciones del evento y quien ya está inscrito aparece
// deshabilitado con "Ya inscrito por X". El servidor lo vuelve a comprobar (ids deterministas).
//
// Cobro online: POST /api/createGroupCheckout reserva las plazas (pendientes) y devuelve el
// PaymentIntent; tras pagar, esperamos a que el webhook ponga pedidos/{pedidoId}.estado = 'pagado'.
// Sin cobro online: las inscripciones se escriben desde aquí (writeBatch, reglas crearV2).
import { useState, useEffect, useMemo, useRef } from 'react'
import {
  collection, query, where, onSnapshot, getDocs, doc, writeBatch, deleteDoc, serverTimestamp,
} from 'firebase/firestore'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, useStripe, useElements, CardElement, PaymentRequestButtonElement } from '@stripe/react-stripe-js'
import { X, Loader2, Check, Search, UserPlus, Users, Trash2, AlertCircle, ChevronLeft } from 'lucide-react'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { useFamilia } from '../hooks/useFamilia'
import { PENDING_TTL_MS } from '../utils/inscripciones'
import { checkStripeMode } from '../utils/stripeMode'

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)

const GOLD  = '#D4AF37'
const RED   = '#CE1126'
const GREEN = '#10b981'
const CARD  = '#141414'
const CHILD_AGE_LIMIT = 15   // ≤ 14 años → infantil (DEBE coincidir con api/_lib/pricing.js)

const fmtEur = c => (c / 100).toFixed(2).replace('.', ',') + ' €'
const norm   = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const fullName = f => `${f?.nombre ?? ''} ${f?.apellidos ?? ''}`.trim()

function ageFrom(fechaNacimiento) {
  if (!fechaNacimiento) return null
  const b = new Date(fechaNacimiento); if (isNaN(b.getTime())) return null
  const t = new Date(); let a = t.getFullYear() - b.getFullYear()
  const m = t.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && t.getDate() < b.getDate())) a--
  return a
}
// Categoría ESTIMADA en el cliente (sólo para el resumen); la definitiva la pone el servidor.
const catAdult = dob => { const a = ageFrom(dob); return a != null && a < CHILD_AGE_LIMIT ? 'nino' : 'adulto' }
const catHijo  = dob => { const a = ageFrom(dob); return a == null || a < CHILD_AGE_LIMIT ? 'nino' : 'adulto' }

const newPedidoId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

// ─── Inscripciones del evento en vivo → quién está ya inscrito (v2 y v1) ─────
function useTaken(eventId, uid) {
  const [taken, setTaken] = useState({ byKey: new Map(), byName: new Map(), mine: [] })
  useEffect(() => {
    const q = query(collection(db, 'inscripciones'), where('eventId', '==', eventId))
    return onSnapshot(q, snap => {
      const byKey = new Map(), byName = new Map(), mine = [], now = Date.now()
      for (const d of snap.docs) {
        const x = d.data()
        const pendiente = x.pagado !== true && x.estadoPago === 'pendiente'
        // MI reserva sin pagar (pago abandonado): nunca me bloquea; se ofrece reemplazarla o cancelarla
        if (pendiente && (x.modelo === 2 ? x.pagadorUid === uid : x.uid === uid)) {
          mine.push({ id: d.id, n: x.modelo === 2 ? 1 : (x.totalPersonas ?? 1) }); continue
        }
        if (pendiente) { const t = x.createdAt?.toMillis?.(); if (t != null && now - t > PENDING_TTL_MS) continue }
        if (x.modelo === 2) {
          const info = { por: (x.pagadorNombre ?? 'otra persona').split(' ')[0], pendiente }
          if (x.asistenteKey) byKey.set(x.asistenteKey, info)
          if (x.asistenteNombre) byName.set(norm(x.asistenteNombre), info)
        } else {
          const info = { por: (x.nombre ?? 'otra persona').split(' ')[0], pendiente }
          if (x.uid && x.uid !== 'manual') byKey.set(x.uid, info)
          if (x.nombre) byName.set(norm(x.nombre), info)
          for (const c of [...(x.acompañantesAdultos ?? []), ...(x.acompañantesNinos ?? [])]) {
            if (c?.uid) byKey.set(c.uid, info)
            if (c?.nombre) byName.set(norm(c.nombre), info)
          }
        }
      }
      setTaken({ byKey, byName, mine })
    }, () => {})
  }, [eventId, uid])
  return taken
}

// ─── Modal ───────────────────────────────────────────────────────────────────
export default function EventRegistrationModal(props) {
  return (
    <Elements stripe={stripePromise}>
      <Content {...props} />
    </Elements>
  )
}

function Content({ event, onClose, onSuccess }) {
  const { user, fallero } = useAuth()
  const uid = user?.uid
  const isStaff = fallero?.rol === 'admin' || fallero?.rol === 'directiva'
  const { members: familia } = useFamilia(uid, fallero?.familiaUids ?? [])
  const taken = useTaken(event.id, uid)
  const [cancelling, setCancelling] = useState(false)
  // Borra mis reservas pendientes (las reglas lo permiten al pagador/dueño mientras no estén pagadas)
  const deleteMyPending = () => Promise.allSettled(taken.mine.map(m => deleteDoc(doc(db, 'inscripciones', m.id))))
  const cancelMyPending = async () => { setCancelling(true); await deleteMyPending(); setCancelling(false) }

  const paid        = event.precio != null && event.precio > 0
  const cobraOnline = paid && event.pagoApp === true
  // SEGURIDAD: en un evento con coste, las plazas de invitados y de falleros sin app sólo pueden
  // darse de alta pasando por Stripe. Si el evento no cobra online, únicamente el staff puede
  // apuntarlas (pago manual / efectivo en el casal); un fallero normal ve el bloque bloqueado.
  const manualBlocked = paid && !cobraOnline && !isStaff
  const manualStaff   = paid && !cobraOnline && isStaff     // se marca pagoManual: true
  const esManualLine  = l => l.tipo === 'invitado' || (l.tipo === 'fallero' && !l.uid)
  const precioA     = Math.round((event.precio ?? 0) * 100)
  const precioN     = event.precioNino != null ? Math.round(event.precioNino * 100) : precioA
  const priceOf     = cat => (cat === 'nino' ? precioN : precioA)

  const [cart, setCart]       = useState([])          // líneas seleccionadas
  const [step, setStep]       = useState('select')    // select | pay | awaiting | done
  const [error, setError]     = useState('')
  const [busy, setBusy]       = useState(false)
  const [checkout, setCheckout] = useState(null)      // respuesta del servidor (pedidoId, clientSecret, totales…)

  // ── Bloque 1: yo, familia, mis hijos ──
  const block1 = useMemo(() => {
    const rows = []
    if (uid && fallero) rows.push({ key: uid, tipo: 'titular', uid, nombre: fullName(fallero), sub: 'Tú', categoria: catAdult(fallero.fechaNacimiento) })
    for (const m of familia) rows.push({ key: m.uid, tipo: 'familiar', uid: m.uid, nombre: fullName(m), sub: 'Familiar', categoria: catAdult(m.fechaNacimiento) })
    ;(fallero?.hijos ?? []).forEach((h, i) => {
      const nombre = typeof h === 'string' ? h : h?.nombre
      if (!nombre) return
      rows.push({ key: `${uid}|h${i}`, tipo: 'hijo', nombre, sub: 'Hijo/a', categoria: catHijo(typeof h === 'object' ? h?.fechaNacimiento : null) })
    })
    return rows
  }, [uid, fallero, familia])
  const block1Keys = useMemo(() => new Set(block1.map(r => r.key)), [block1])

  const inCart   = key => cart.some(l => l.key === key)
  const toggle   = row => setCart(c => inCart(row.key) ? c.filter(l => l.key !== row.key) : [...c, row])
  const addLine  = line => setCart(c => [...c, line])
  const removeAt = i => setCart(c => c.filter((_, j) => j !== i))

  const estimateNeto = cart.reduce((s, l) => s + priceOf(l.categoria), 0)
  const nAdultos = cart.filter(l => l.categoria === 'adulto').length

  // ── Confirmar ──
  const confirm = async () => {
    if (cart.length === 0 || busy) return
    if (manualBlocked && cart.some(esManualLine)) { setError('Los invitados y los falleros sin app sólo pueden inscribirse en eventos con pago online. Contacta con la directiva.'); return }
    setBusy(true); setError('')
    const asistentes = cart.map(l =>
      l.tipo === 'titular' ? { tipo: 'titular' }
      : l.tipo === 'hijo'   ? { tipo: 'hijo', key: l.key }
      : l.uid               ? { tipo: l.tipo, uid: l.uid }
      : { tipo: l.tipo, uid: null, nombre: l.nombreLibre, apellidos: l.apellidosLibre, categoria: l.categoria })
    try {
      if (cobraOnline) {
        if (taken.mine.length) await deleteMyPending()   // reserva anterior abandonada: se reemplaza
        const idToken = await user.getIdToken()
        const res  = await fetch('/api/createGroupCheckout', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ eventId: event.id, asistentes }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
        const modeErr = checkStripeMode(data.livemode)
        if (modeErr) throw new Error(modeErr)
        setCheckout(data); setStep('pay')
      } else {
        // Evento gratuito / pago en el casal: las inscripciones se escriben desde la app
        const pedidoId = newPedidoId()
        const batch = writeBatch(db)
        cart.forEach((l, i) => {
          const asistenteKey = l.key && (l.uid || l.tipo === 'hijo') ? l.key : null
          const id = asistenteKey ? `${event.id}_${asistenteKey}` : `${event.id}_${pedidoId}_${i}`
          batch.set(doc(db, 'inscripciones', id), {
            modelo: 2, eventId: event.id, eventoTitulo: event.titulo ?? '', pedidoId, pagadorUid: uid, pagadorNombre: fullName(fallero),
            nombre: fullName(fallero),   // compatibilidad con las vistas clásicas ("pagada por")
            tipo: l.tipo, asistenteUid: l.uid ?? null, asistenteKey,
            asistenteNombre: l.uid || l.tipo === 'hijo' ? l.nombre : `${l.nombreLibre} ${l.apellidosLibre}`,
            categoria: l.categoria, precioNetoCent: paid ? priceOf(l.categoria) : 0,
            pagado: false, estadoPago: null, checkIn: false, createdAt: serverTimestamp(),
            ...(manualStaff && esManualLine(l) && { pagoManual: true }),   // alta por staff: pago manual / efectivo
          })
        })
        await batch.commit()
        setStep('done'); onSuccess?.()
      }
    } catch (err) {
      setError(err?.message || 'No se pudo completar la inscripción.')
    } finally { setBusy(false) }
  }

  // Si el pago no llega a hacerse, liberamos las reservas pendientes (las reglas lo permiten al pagador).
  const releaseReservation = async () => {
    const ids = checkout?.inscripcionIds ?? []
    await Promise.allSettled(ids.map(id => deleteDoc(doc(db, 'inscripciones', id))))
  }
  const backToSelect = async () => { await releaseReservation(); setCheckout(null); setStep('select') }
  const close = async () => { if (step === 'pay') await releaseReservation(); onClose() }

  return (
    <div onClick={step === 'awaiting' ? undefined : close}
      style={{ position: 'fixed', inset: 0, zIndex: 310, background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 480, maxHeight: '92dvh', overflowY: 'auto', background: CARD, border: '1px solid rgba(212,175,55,0.18)', borderRadius: '24px 24px 0 0', padding: '1.25rem 1.25rem calc(1.5rem + env(safe-area-inset-bottom))', animation: 'falla-slideUp 0.25s ease-out', color: 'white' }}>

        {/* Cabecera */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.9rem' }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: '0.65rem', fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Inscripción</p>
            <h3 style={{ margin: '2px 0 0', fontSize: '1.05rem', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{event.titulo}</h3>
          </div>
          {step !== 'awaiting' && (
            <button onClick={close} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 10, width: 34, height: 34, minHeight: 'auto', minWidth: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', flexShrink: 0 }}>
              <X size={16} />
            </button>
          )}
        </div>

        {step === 'select' && (
          <>
            {taken.mine.length > 0 && (
              <div style={{ padding: '0.75rem 0.9rem', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.35)', borderRadius: 12, marginBottom: '1rem' }}>
                <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700, color: '#fbbf24' }}>
                  ⏳ Tienes una reserva pendiente de pago ({taken.mine.reduce((s, m) => s + m.n, 0)} {taken.mine.reduce((s, m) => s + m.n, 0) === 1 ? 'persona' : 'personas'})
                </p>
                <p style={{ margin: '0.3rem 0 0.6rem', fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.45 }}>
                  El pago no llegó a completarse. Elige de nuevo los asistentes y paga (la reserva anterior se reemplaza), o cancélala.
                </p>
                <button type="button" onClick={cancelMyPending} disabled={cancelling}
                  style={{ minHeight: 36, padding: '0 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 9, color: 'rgba(255,255,255,0.8)', fontSize: '0.75rem', fontWeight: 700, cursor: cancelling ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                  {cancelling ? 'Cancelando…' : 'Cancelar reserva pendiente'}
                </button>
              </div>
            )}
            <Block1 rows={block1} taken={taken} inCart={inCart} onToggle={toggle} />
            <BlockFalleros uid={uid} exclude={block1Keys} cart={cart} taken={taken} onAdd={addLine} manualBlocked={manualBlocked} manualStaff={manualStaff} />
            <BlockInvitados onAdd={addLine} taken={taken} manualBlocked={manualBlocked} manualStaff={manualStaff} />
            <Resumen cart={cart} paid={paid} priceOf={priceOf} onRemove={removeAt} block1Keys={block1Keys} />

            {error && <ErrorBox msg={error} />}

            <button onClick={confirm} disabled={cart.length === 0 || busy}
              style={{ width: '100%', minHeight: 52, marginTop: '0.75rem', background: cart.length === 0 || busy ? 'rgba(212,175,55,0.35)' : `linear-gradient(135deg, ${GOLD}, #8a6f1a)`, border: 'none', borderRadius: 14, color: 'white', fontSize: '1rem', fontWeight: 800, cursor: cart.length === 0 || busy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {busy ? <Loader2 size={18} style={{ animation: 'falla-spin 0.8s linear infinite' }} />
                : cobraOnline ? `Continuar al pago · ${fmtEur(estimateNeto)}`
                : paid ? `Inscribir ${cart.length} · ${fmtEur(estimateNeto)} en el casal`
                : `Inscribir ${cart.length === 1 ? '1 persona' : `${cart.length} personas`}`}
            </button>
            {cobraOnline && cart.length > 0 && (
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', textAlign: 'center' }}>
                Importe estimado ({nAdultos} adulto{nAdultos === 1 ? '' : 's'} · {cart.length - nAdultos} infantil). El definitivo lo calcula el servidor por fecha de nacimiento.
              </p>
            )}
          </>
        )}

        {step === 'pay' && checkout && (
          <PayStep event={event} user={user} fallero={fallero} checkout={checkout}
            onBack={backToSelect}
            onPaid={() => setStep('awaiting')} />
        )}

        {step === 'awaiting' && checkout && (
          <Awaiting pedidoId={checkout.pedidoId} paymentIntentId={checkout.paymentIntentId}
            onConfirmed={() => { setStep('done'); onSuccess?.() }}
            onGiveUp={onClose} />
        )}

        {step === 'done' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1.5rem 1rem', gap: '0.75rem' }}>
            <div style={{ width: 58, height: 58, background: `${GREEN}18`, border: `1px solid ${GREEN}35`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Check size={28} color={GREEN} strokeWidth={2.5} />
            </div>
            <p style={{ margin: 0, fontWeight: 800, fontSize: '1.05rem', color: GREEN }}>
              {cobraOnline ? 'Pago confirmado 🎉' : `¡${cart.length > 1 ? `${cart.length} personas inscritas` : 'Inscripción confirmada'}! 🎉`}
            </p>
            {cobraOnline && checkout && (
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>
                <strong style={{ color: 'white' }}>{event.titulo}</strong> · {fmtEur(checkout.totalConComision)} · {cart.length} {cart.length === 1 ? 'plaza' : 'plazas'}<br />
                <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)' }}>Ref. {checkout.paymentIntentId} · Las entradas ya están en «Check-in».</span>
              </p>
            )}
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: '0.82rem', color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>
              {cart.map((l, i) => <li key={i}>{l.uid || l.tipo === 'hijo' ? l.nombre : `${l.nombreLibre} ${l.apellidosLibre}`}</li>)}
            </ul>
            <button onClick={onClose} style={{ marginTop: 6, width: '100%', minHeight: 50, background: `linear-gradient(135deg, ${GOLD}, #8a6f1a)`, border: 'none', borderRadius: 14, color: 'white', fontSize: '1rem', fontWeight: 800, cursor: 'pointer' }}>Entendido</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Bloque 1 ────────────────────────────────────────────────────────────────
function Block1({ rows, taken, inCart, onToggle }) {
  return (
    <section style={{ marginBottom: '1rem' }}>
      <SectionTitle icon={<Users size={13} />} n={1}>Mi familia e hijos</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map(r => {
          const t = taken.byKey.get(r.key)
          const checked = inCart(r.key)
          return (
            <label key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.7rem 0.85rem', borderRadius: 12, cursor: t ? 'not-allowed' : 'pointer', background: checked ? 'rgba(212,175,55,0.1)' : 'rgba(255,255,255,0.04)', border: `1.5px solid ${checked ? 'rgba(212,175,55,0.45)' : 'rgba(255,255,255,0.08)'}`, opacity: t ? 0.55 : 1 }}>
              <input type="checkbox" checked={checked} disabled={!!t} onChange={() => onToggle(r)} style={{ width: 20, height: 20, accentColor: GOLD, flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.nombre}</div>
                <div style={{ fontSize: '0.7rem', color: t ? '#fbbf24' : 'rgba(255,255,255,0.45)' }}>
                  {t ? (t.pendiente ? `Reserva en curso por ${t.por}` : `Ya inscrito por ${t.por}`) : `${r.sub} · ${r.categoria === 'nino' ? 'Infantil' : 'Adulto'}`}
                </div>
              </div>
            </label>
          )
        })}
        {rows.length <= 1 && (
          <p style={{ margin: '2px 0 0', fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)' }}>
            Vincula familiares y añade a tus hijos desde tu perfil para tenerlos aquí.
          </p>
        )}
      </div>
    </section>
  )
}

// ─── Bloques 2/3: otros falleros (directorio o sin app) ──────────────────────
function BlockFalleros({ uid, exclude, cart, taken, onAdd, manualBlocked = false, manualStaff = false }) {
  const [dir, setDir]       = useState(null)   // directorio cargado bajo demanda
  const [q, setQ]           = useState('')
  const [open, setOpen]     = useState(false)
  const [manual, setManual] = useState(null)   // { nombre, apellidos, categoria } | null

  const openSearch = async () => {
    setOpen(true)
    if (dir) return
    try {
      const snap = await getDocs(collection(db, 'directorio'))
      const list = []
      for (const d of snap.docs) {
        const f = d.data()
        if (d.id === uid) continue
        list.push({ key: d.id, tipo: 'fallero', uid: d.id, nombre: fullName(f), sub: 'Fallero/a', categoria: catAdult(f.fechaNacimiento) })
        ;(Array.isArray(f.hijos) ? f.hijos : []).forEach((h, i) => {
          const nombre = typeof h === 'string' ? h : h?.nombre
          if (nombre) list.push({ key: `${d.id}|h${i}`, tipo: 'hijo', nombre, sub: `Hijo/a de ${f.nombre ?? ''}`, categoria: catHijo(typeof h === 'object' ? h?.fechaNacimiento : null) })
        })
      }
      setDir(list)
    } catch { setDir([]) }
  }

  const results = useMemo(() => {
    const k = norm(q)
    if (!dir || k.length < 2) return []
    const inCartKeys = new Set(cart.map(l => l.key))
    return dir.filter(r => !exclude.has(r.key) && !inCartKeys.has(r.key) && norm(r.nombre).includes(k)).slice(0, 8)
  }, [dir, q, exclude, cart])

  const pick = r => { onAdd(r); setQ('') }

  const submitManual = () => {
    const nombre = manual.nombre.trim(), apellidos = manual.apellidos.trim()
    if (nombre.length < 2 || apellidos.length < 2) return
    onAdd({ key: `libre_${Date.now()}`, tipo: 'fallero', uid: null, nombreLibre: nombre, apellidosLibre: apellidos, nombre: `${nombre} ${apellidos}`, sub: 'Fallero/a sin app', categoria: manual.categoria })
    setManual(null); setQ('')
  }
  const warnName = manual && taken.byName.get(norm(`${manual.nombre} ${manual.apellidos}`))

  return (
    <section style={{ marginBottom: '1rem' }}>
      <SectionTitle icon={<Search size={13} />} n="2·3">Añadir otro fallero (adulto o infantil)</SectionTitle>
      {!open ? (
        <OutlineButton onClick={openSearch}><Search size={14} /> Buscar en el directorio</OutlineButton>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Nombre o apellidos…" style={inputStyle} />
          {dir == null && <p style={{ margin: 0, fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>Cargando directorio…</p>}
          {results.map(r => {
            const t = taken.byKey.get(r.key)
            return (
              <button key={r.key} type="button" disabled={!!t} onClick={() => pick(r)}
                style={{ textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '0.6rem 0.85rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: 'white', cursor: t ? 'not-allowed' : 'pointer', opacity: t ? 0.55 : 1, minHeight: 'auto', fontFamily: 'inherit' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700 }}>{r.nombre}</div>
                  <div style={{ fontSize: '0.68rem', color: t ? '#fbbf24' : 'rgba(255,255,255,0.45)' }}>
                    {t ? (t.pendiente ? `Reserva en curso por ${t.por}` : `Ya inscrito por ${t.por}`) : `${r.sub} · ${r.categoria === 'nino' ? 'Infantil' : 'Adulto'}`}
                  </div>
                </div>
                {!t && <span style={{ fontSize: '0.7rem', color: GOLD, fontWeight: 700, flexShrink: 0 }}>Añadir +</span>}
              </button>
            )
          })}
          {dir && norm(q).length >= 2 && results.length === 0 && !manual && (
            <div style={{ padding: '0.75rem 0.85rem', background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 10 }}>
              <p style={{ margin: '0 0 8px', fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>No está en el directorio (aún no tiene la app).</p>
              {manualBlocked
                ? <LockedNotice />
                : <OutlineButton onClick={() => setManual({ nombre: q.trim(), apellidos: '', categoria: 'adulto' })}><UserPlus size={14} /> Añadir fallero sin app{manualStaff ? ' · Pago manual / Efectivo' : ''}</OutlineButton>}
            </div>
          )}
          {manual && (
            <PersonForm title="Fallero/a sin app" value={manual} onChange={setManual} onCancel={() => setManual(null)} onSubmit={submitManual}
              warn={warnName ? `Ojo: ya hay un/a "${manual.nombre} ${manual.apellidos}" inscrito por ${warnName.por}.` : null} />
          )}
        </div>
      )}
    </section>
  )
}

// ─── Bloque 4: invitados ─────────────────────────────────────────────────────
function BlockInvitados({ onAdd, taken, manualBlocked = false, manualStaff = false }) {
  const [form, setForm] = useState(null)
  const submit = () => {
    const nombre = form.nombre.trim(), apellidos = form.apellidos.trim()
    if (nombre.length < 2 || apellidos.length < 2) return
    onAdd({ key: `inv_${Date.now()}`, tipo: 'invitado', uid: null, nombreLibre: nombre, apellidosLibre: apellidos, nombre: `${nombre} ${apellidos}`, sub: 'Invitado/a', categoria: form.categoria })
    setForm(null)
  }
  const warn = form && taken.byName.get(norm(`${form.nombre} ${form.apellidos}`))
  return (
    <section style={{ marginBottom: '1rem' }}>
      <SectionTitle icon={<UserPlus size={13} />} n={4}>Añadir no fallero (invitados)</SectionTitle>
      {manualBlocked ? <LockedNotice /> : !form
        ? <OutlineButton onClick={() => setForm({ nombre: '', apellidos: '', categoria: 'adulto' })}><UserPlus size={14} /> Añadir invitado{manualStaff ? ' · Pago manual / Efectivo' : ''}</OutlineButton>
        : <PersonForm title="Invitado/a de fuera de la falla" value={form} onChange={setForm} onCancel={() => setForm(null)} onSubmit={submit}
            warn={warn ? `Ojo: ya hay un/a "${form.nombre} ${form.apellidos}" inscrito por ${warn.por}.` : null} />}
    </section>
  )
}

// ─── Resumen / carrito ───────────────────────────────────────────────────────
function Resumen({ cart, paid, priceOf, onRemove, block1Keys }) {
  if (cart.length === 0) return null
  const total = cart.reduce((s, l) => s + priceOf(l.categoria), 0)
  return (
    <section style={{ padding: '0.85rem 1rem', background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.22)', borderRadius: 12 }}>
      <p style={{ margin: '0 0 0.5rem', fontSize: '0.65rem', fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Asistentes · {cart.length}</p>
      {cart.map((l, i) => (
        <div key={l.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '0.3rem 0', fontSize: '0.84rem' }}>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {l.nombre} <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem' }}>· {l.sub}{l.categoria === 'nino' ? ' · infantil' : ''}</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {paid && <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>{fmtEur(priceOf(l.categoria))}</span>}
            {!block1Keys.has(l.key) && (
              <button onClick={() => onRemove(i)} title="Quitar" style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: 2, minHeight: 'auto', minWidth: 'auto', display: 'flex' }}><Trash2 size={14} /></button>
            )}
          </span>
        </div>
      ))}
      {paid && (
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.45rem', marginTop: '0.3rem', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: '0.85rem' }}>
          <span style={{ color: 'rgba(255,255,255,0.55)' }}>Subtotal</span>
          <span style={{ fontWeight: 800, color: GOLD }}>{fmtEur(total)}</span>
        </div>
      )}
    </section>
  )
}

// ─── Paso de pago (Apple/Google Pay o tarjeta) ───────────────────────────────
function PayStep({ event, user, fallero, checkout, onBack, onPaid }) {
  const stripe   = useStripe()
  const elements = useElements()
  const [accepted, setAccepted]   = useState(false)
  const [pr, setPr]               = useState(null)
  const [showCard, setShowCard]   = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError]         = useState('')
  const paidRef = useRef(onPaid)
  useEffect(() => { paidRef.current = onPaid })

  const { clientSecret, totalConComision, totalNeto, gastosGestion, lineas } = checkout

  const finish = async (intent) => {
    let fin = intent
    if (fin.status === 'requires_action' || fin.status === 'requires_confirmation') {
      const { paymentIntent, error: e } = await stripe.confirmCardPayment(clientSecret)
      if (e) throw new Error(e.message || 'Autenticación bancaria fallida.')
      fin = paymentIntent
    }
    if (fin.status !== 'succeeded' && fin.status !== 'processing') throw new Error(`Pago no completado (${fin.status}).`)
    paidRef.current()
  }

  useEffect(() => {
    if (!stripe) return
    let cancelled = false
    const req = stripe.paymentRequest({
      country: 'ES', currency: 'eur',
      total: { label: event.titulo || 'Inscripción', amount: totalConComision },
      displayItems: [{ label: 'Inscripción', amount: totalNeto }, ...(gastosGestion > 0 ? [{ label: 'Gastos de gestión', amount: gastosGestion }] : [])],
      requestPayerName: true, requestPayerEmail: false,
    })
    req.canMakePayment().then(r => { if (!cancelled) setPr(r ? req : null) })
    req.on('paymentmethod', async (ev) => {
      try {
        const { paymentIntent, error: e } = await stripe.confirmCardPayment(clientSecret, { payment_method: ev.paymentMethod.id }, { handleActions: false })
        if (e) { ev.complete('fail'); setError(e.message || 'Pago rechazado.'); return }
        ev.complete('success')
        await finish(paymentIntent)
      } catch (err) { setError(err.message) }
    })
    return () => { cancelled = true }
  }, [stripe, clientSecret, totalConComision, totalNeto, gastosGestion, event.titulo]) // eslint-disable-line react-hooks/exhaustive-deps

  const payWithCard = async () => {
    if (!stripe || !elements || processing || !accepted) return
    setProcessing(true); setError('')
    try {
      const { paymentIntent, error: e } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card: elements.getElement(CardElement), billing_details: { name: fullName(fallero) || user?.email } },
      })
      if (e) throw new Error(e.message || 'Tarjeta rechazada.')
      await finish(paymentIntent)
    } catch (err) { setError(err.message); setProcessing(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <button onClick={onBack} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: 'rgba(255,255,255,0.55)', fontSize: '0.78rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: 0, minHeight: 'auto' }}>
        <ChevronLeft size={14} /> Cambiar asistentes
      </button>

      <div style={{ padding: '0.85rem 1rem', background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.22)', borderRadius: 12 }}>
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.65rem', fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Resumen del pago</p>
        {lineas.map(l => (
          <div key={l.inscripcionId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', padding: '0.15rem 0' }}>
            <span>{l.asistenteNombre} <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.68rem' }}>{l.categoria === 'nino' ? '· infantil' : ''}</span></span>
            <span>{fmtEur(l.precioNetoCent)}</span>
          </div>
        ))}
        {gastosGestion > 0 && (   /* sin recargo: la comisión de Stripe la asume la Falla */
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'rgba(255,255,255,0.45)', marginTop: '0.4rem' }}>
            <span>Gastos de gestión</span><span>{fmtEur(gastosGestion)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.4rem', borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: '0.3rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.55)' }}>Total a pagar (un solo cobro)</span>
          <span style={{ fontSize: '1.15rem', fontWeight: 800, color: GOLD }}>{fmtEur(totalConComision)}</span>
        </div>
      </div>

      {error && <ErrorBox msg={error} />}

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', padding: '0.85rem 1rem', background: accepted ? 'rgba(16,185,129,0.07)' : 'rgba(206,17,38,0.07)', border: `1.5px solid ${accepted ? 'rgba(16,185,129,0.35)' : 'rgba(206,17,38,0.3)'}`, borderRadius: 12, cursor: 'pointer' }}>
        <input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} style={{ width: 20, height: 20, marginTop: 2, flexShrink: 0, accentColor: GOLD }} />
        <span style={{ fontSize: '0.78rem', lineHeight: 1.5, color: 'rgba(255,255,255,0.75)' }}>
          <span style={{ display: 'block', marginBottom: '0.5rem', color: 'rgba(255,255,255,0.55)' }}>
            Para garantizar la correcta organización y compra de provisiones, las inscripciones a los eventos de pago son definitivas y no admiten devolución. ¡Gracias por tu comprensión y colaboración con la falla!
          </span>
          <strong style={{ color: 'white' }}>He revisado los asistentes y consiento que NO se realizarán devoluciones del importe pagado bajo ninguna circunstancia.</strong>
        </span>
      </label>

      {accepted && pr && (
        <PaymentRequestButtonElement options={{ paymentRequest: pr, style: { paymentRequestButton: { theme: 'dark', height: '48px' } } }} />
      )}

      {!showCard ? (
        <button type="button" onClick={() => setShowCard(true)} style={{ width: '100%', minHeight: 48, background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.14)', borderRadius: 12, color: 'rgba(255,255,255,0.78)', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer' }}>
          💳 Pagar con tarjeta
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <div style={{ padding: '0.75rem 0.9rem', background: 'rgba(255,255,255,0.05)', border: '1.5px solid rgba(255,255,255,0.12)', borderRadius: 12 }}>
            <CardElement options={{ style: { base: { fontSize: '15px', color: '#fff', '::placeholder': { color: 'rgba(255,255,255,0.35)' } }, invalid: { color: '#ff8080' } }, hidePostalCode: true }} />
          </div>
          <button type="button" onClick={payWithCard} disabled={!stripe || processing || !accepted}
            style={{ width: '100%', minHeight: 52, background: processing || !accepted ? 'rgba(212,175,55,0.4)' : `linear-gradient(135deg, ${GOLD}, #8a6f1a)`, border: 'none', borderRadius: 14, color: 'white', fontSize: '1rem', fontWeight: 800, cursor: processing || !accepted ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {processing ? <Loader2 size={18} style={{ animation: 'falla-spin 0.8s linear infinite' }} /> : `Pagar ${fmtEur(totalConComision)}`}
          </button>
        </div>
      )}
      <p style={{ margin: 0, fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', textAlign: 'center' }}>Las plazas quedan reservadas 15 minutos mientras completas el pago.</p>
    </div>
  )
}

// ─── Esperando la confirmación del webhook (pedidos/{id}.estado === 'pagado') ─
function Awaiting({ pedidoId, paymentIntentId, onConfirmed, onGiveUp }) {
  const [delayed, setDelayed] = useState(false)
  const cb = useRef(onConfirmed)
  useEffect(() => { cb.current = onConfirmed })
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'pedidos', pedidoId), snap => {
      if (snap.exists() && snap.data().estado === 'pagado') cb.current()
    }, () => {})
    const t = setTimeout(() => setDelayed(true), 40000)
    return () => { unsub(); clearTimeout(t) }
  }, [pedidoId])
  return (
    <div style={{ padding: '1.1rem 1rem', background: 'rgba(212,175,55,0.07)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: 14, textAlign: 'center' }}>
      <Loader2 size={26} color={GOLD} style={{ animation: 'falla-spin 0.8s linear infinite', marginBottom: 8 }} />
      <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800 }}>Procesando confirmación…</p>
      <p style={{ margin: '0.35rem 0 0', fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
        Estamos esperando la confirmación del banco. No cierres esta pantalla ni vuelvas a pagar.
      </p>
      {delayed && (
        <p style={{ margin: '0.75rem 0 0', fontSize: '0.76rem', color: '#fbbf24', lineHeight: 1.5 }}>
          ⚠️ Está tardando más de lo normal. Tu pago está registrado en Stripe (ID <span style={{ fontFamily: 'monospace' }}>{paymentIntentId}</span>) y la inscripción se confirmará sola en cuanto llegue. Si en unos minutos no aparece en «Check-in», contacta con la directiva con ese ID.
        </p>
      )}
      {delayed && (
        <button type="button" onClick={onGiveUp} style={{ marginTop: 12, width: '100%', minHeight: 44, background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 12, color: 'white', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          Entendido, lo compruebo más tarde
        </button>
      )}
    </div>
  )
}

// ─── Piezas de UI ────────────────────────────────────────────────────────────
const inputStyle = { width: '100%', padding: '0.7rem 0.9rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 11, color: 'white', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }

function SectionTitle({ icon, n, children }) {
  return (
    <p style={{ margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
      <span style={{ background: 'rgba(212,175,55,0.15)', color: GOLD, borderRadius: 6, padding: '1px 6px', fontSize: '0.62rem' }}>{n}</span>{icon}{children}
    </p>
  )
}
// Evento con coste sin cobro online: un fallero normal no puede dar de alta plazas sin pagar.
function LockedNotice() {
  return (
    <div style={{ padding: '0.7rem 0.85rem', background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 10, fontSize: '0.74rem', color: '#fbbf24', lineHeight: 1.45 }}>
      🔒 En este evento de pago las plazas de invitados y de falleros sin app sólo se pueden dar de alta con pago online. Para apuntarlos con pago en el casal, habla con la directiva.
    </div>
  )
}
function OutlineButton({ onClick, children }) {
  return (
    <button type="button" onClick={onClick} style={{ width: '100%', minHeight: 44, background: 'rgba(255,255,255,0.04)', border: '1.5px dashed rgba(212,175,55,0.4)', borderRadius: 12, color: GOLD, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit' }}>
      {children}
    </button>
  )
}
function ErrorBox({ msg }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.7rem 0.9rem', background: 'rgba(206,17,38,0.08)', border: '1px solid rgba(206,17,38,0.28)', borderRadius: 10, marginTop: '0.6rem' }}>
      <AlertCircle size={14} color={RED} style={{ flexShrink: 0, marginTop: 1 }} />
      <span style={{ color: '#ff8080', fontSize: '0.8rem', lineHeight: 1.4 }}>{msg}</span>
    </div>
  )
}
function PersonForm({ title, value, onChange, onCancel, onSubmit, warn }) {
  const set = (k, v) => onChange({ ...value, [k]: v })
  const ok = value.nombre.trim().length >= 2 && value.apellidos.trim().length >= 2
  const seg = (cat, label) => (
    <button type="button" onClick={() => set('categoria', cat)} style={{ flex: 1, minHeight: 40, background: value.categoria === cat ? GOLD : 'rgba(255,255,255,0.05)', color: value.categoria === cat ? '#111' : 'rgba(255,255,255,0.7)', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit' }}>{label}</button>
  )
  return (
    <div style={{ padding: '0.85rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 700, color: GOLD }}>{title}</p>
      <input autoFocus value={value.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Nombre" style={inputStyle} />
      <input value={value.apellidos} onChange={e => set('apellidos', e.target.value)} placeholder="Apellidos" style={inputStyle} />
      <div style={{ display: 'flex', gap: 6 }}>{seg('adulto', 'Adulto')}{seg('nino', 'Infantil (≤ 14)')}</div>
      {warn && <p style={{ margin: 0, fontSize: '0.72rem', color: '#fbbf24' }}>⚠️ {warn}</p>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" onClick={onCancel} style={{ flex: 1, minHeight: 42, background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 10, color: 'rgba(255,255,255,0.6)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
        <button type="button" onClick={onSubmit} disabled={!ok} style={{ flex: 2, minHeight: 42, background: ok ? GOLD : 'rgba(212,175,55,0.35)', border: 'none', borderRadius: 10, color: ok ? '#111' : 'rgba(255,255,255,0.5)', fontWeight: 800, cursor: ok ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>Añadir al grupo</button>
      </div>
    </div>
  )
}
