// Escáner QR de Control de Accesos (cámara trasera). Lee el pase permanente `JCB-USER:<uid>` y
// resuelve, dentro del evento seleccionado, las plazas pagadas de esa persona:
//   · propias (asistenteUid / uid / beneficiariosUids) → check-in automático
//   · invitados sin app a su cargo (pagadorUid sin asistenteUid, o delegados v1) → botones de un toque
// Casos: A acceso permitido · B titular + invitados · C ya había entrado · D sin entrada pagada.
// La lista manual de Control de Accesos sigue intacta como respaldo.
import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { X, Loader2, RefreshCw, DoorOpen } from 'lucide-react'
import { getPersons, getCheckInState, getDelegatedPersons, markCheckIn, markCheckInDocs } from '../utils/checkIn'
import { isPendingPayment } from '../utils/inscripciones'

const WHITE = '#FFFFFF'
const GREEN = '#16a34a'
const AMBER = '#d97706'
const RED   = '#dc2626'
const DARK  = '#0b0b0b'

const READER_ID = 'jcb-qr-reader'
const isEligible = (ins, event) => !isPendingPayment(ins) && (event?.pagoApp !== true || ins.pagado === true)
const toDate = f => (f?.toDate ? f.toDate() : f ? new Date(f) : null)
const fmtHour = d => d ? d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : ''
const vibrate = p => { try { navigator.vibrate?.(p) } catch { /* no soportado */ } }

// Plazas de un uid en el evento: { mine: [...], guests: [...] } con { ins, person, entered, at, pagadoPor }
function resolveUid(uid, inscriptions, event) {
  const mine = [], guests = []
  const row = (ins, person) => {
    const st = getCheckInState(ins, person.id)
    return { ins, person, entered: st.entered, at: st.at, pagadoPor: ins.pagadorNombre ?? ins.nombre ?? '—', key: `${ins.id}:${person.id}` }
  }
  for (const ins of inscriptions) {
    if (!isEligible(ins, event) || ins.esManual) continue
    if (ins.modelo === 2) {
      if (ins.asistenteUid === uid) mine.push(row(ins, getPersons(ins)[0]))
      else if (ins.pagadorUid === uid && !ins.asistenteUid) guests.push(row(ins, getPersons(ins)[0]))
      continue
    }
    const persons = getPersons(ins)
    if (ins.uid === uid) {
      mine.push(row(ins, persons[0]))
      for (const p of getDelegatedPersons(ins)) guests.push(row(ins, p))
    } else if (Array.isArray(ins.beneficiariosUids) && ins.beneficiariosUids.includes(uid)) {
      const p = persons.find(x => x.appUid === uid || x.id === uid)
      if (p) mine.push(row(ins, p))
    }
  }
  return { mine, guests }
}

const markRow = r => r.ins.modelo === 2 ? markCheckInDocs([r.ins.id]) : markCheckIn(r.ins.id, r.person)

export default function QrScanner({ event, inscriptions, onClose }) {
  const scannerRef = useRef(null)
  const insRef = useRef(inscriptions)
  useEffect(() => { insRef.current = inscriptions }, [inscriptions])

  const [camError, setCamError] = useState('')
  const [starting, setStarting] = useState(true)
  const [result, setResult]     = useState(null)   // { kind: 'A'|'B'|'C'|'D'|'X', uid, mine, guests, message }
  const [busyKey, setBusyKey]   = useState(null)
  const [actionErr, setActionErr] = useState('')
  const processing = useRef(false)

  const pause  = () => { try { scannerRef.current?.pause(true) } catch { /* no estaba escaneando */ } }
  const resume = () => { setResult(null); setActionErr(''); processing.current = false; try { scannerRef.current?.resume() } catch { /* ignorar */ } }

  // ── Lectura ──
  const onScan = async (text) => {
    if (processing.current) return
    processing.current = true
    pause()
    const m = /^JCB-USER:([A-Za-z0-9_-]{6,})$/.exec(String(text).trim())
    if (!m) { vibrate([100, 50, 100]); setResult({ kind: 'X', message: 'QR no reconocido. Debe ser el pase de fallero de la app.' }); return }
    const uid = m[1]
    const { mine, guests } = resolveUid(uid, insRef.current, event)

    if (!mine.length && !guests.length) { vibrate([100, 50, 100]); setResult({ kind: 'D', uid, mine, guests }); return }

    const pendingMine = mine.filter(r => !r.entered)
    if (!pendingMine.length) {
      // Caso C (o pagador que no asiste pero trae invitados): no se marca nada automáticamente
      vibrate([100, 50, 100])
      setResult({ kind: mine.length ? 'C' : 'B', uid, mine, guests })
      return
    }
    try {
      for (const r of pendingMine) await markRow(r)
      vibrate(200)
      const now = new Date()
      const marked = mine.map(r => pendingMine.includes(r) ? { ...r, entered: true, at: now } : r)
      setResult({ kind: guests.some(g => !g.entered) ? 'B' : 'A', uid, mine: marked, guests })
    } catch (err) {
      vibrate([100, 50, 100])
      setResult({ kind: 'X', uid, mine, guests, message: err?.message || 'No se pudo registrar el acceso.' })
    }
  }

  // ── Cámara ──
  useEffect(() => {
    const scanner = new Html5Qrcode(READER_ID, { verbose: false })
    scannerRef.current = scanner
    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1 },
      text => onScan(text),
      () => {},   // frames sin QR: silencio
    ).then(() => setStarting(false))
      .catch(err => { setStarting(false); setCamError(err?.message || 'No se pudo abrir la cámara. Revisa los permisos del navegador.') })
    return () => {
      const s = scannerRef.current; scannerRef.current = null
      if (!s) return
      Promise.resolve(s.isScanning ? s.stop() : null).catch(() => {}).finally(() => { try { s.clear() } catch { /* ya limpio */ } })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const admitGuest = async (g) => {
    setBusyKey(g.key); setActionErr('')
    try {
      await markRow(g)
      setResult(r => ({ ...r, guests: r.guests.map(x => x.key === g.key ? { ...x, entered: true, at: new Date() } : x) }))
      vibrate(120)
    } catch (err) { setActionErr(err?.message || 'No se pudo registrar al invitado.') }
    finally { setBusyKey(null) }
  }

  const color = result?.kind === 'A' || result?.kind === 'B' ? GREEN : result?.kind === 'C' ? AMBER : RED
  const first = result?.mine?.[0] ?? null
  const pendingGuests = result?.guests?.filter(g => !g.entered) ?? []
  const enteredGuests = result?.guests?.filter(g => g.entered) ?? []

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 130, background: DARK, color: WHITE, display: 'flex', flexDirection: 'column', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'calc(12px + env(safe-area-inset-top)) 16px 10px' }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)' }}>📷 Escáner de acceso</p>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 800, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{event.titulo}</p>
        </div>
        <button onClick={onClose} aria-label="Cerrar" style={{ width: 42, height: 42, minHeight: 'auto', minWidth: 'auto', borderRadius: 12, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: WHITE, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <X size={20} />
        </button>
      </header>

      {/* Visor (se mantiene montado; se oculta mientras se muestra un resultado) */}
      <div style={{ flex: result ? 0 : 1, display: result ? 'none' : 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 16px' }}>
        <div id={READER_ID} style={{ width: '100%', maxWidth: 420, borderRadius: 18, overflow: 'hidden', background: '#000' }} />
        {starting && <p style={{ marginTop: 14, fontSize: 13, color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: 8 }}><Loader2 size={16} style={{ animation: 'falla-spin 0.8s linear infinite' }} /> Abriendo la cámara trasera…</p>}
        {camError && <p style={{ marginTop: 14, fontSize: 13, color: '#fca5a5', textAlign: 'center' }}>⚠️ {camError}</p>}
        {!starting && !camError && <p style={{ marginTop: 14, fontSize: 13, color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>Apunta al QR del pase de fallero</p>}
      </div>

      {/* Resultado */}
      {result && (
        <div style={{ flex: 1, overflowY: 'auto', background: color, padding: '18px 20px calc(24px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', animation: 'falla-fadeIn 0.2s ease-out' }}>
          <div style={{ fontSize: 64, lineHeight: 1 }}>{result.kind === 'A' || result.kind === 'B' ? '✅' : result.kind === 'C' ? '⚠️' : '❌'}</div>
          <h2 style={{ margin: '10px 0 4px', fontSize: 30, fontWeight: 900, letterSpacing: '-0.01em', lineHeight: 1.1 }}>
            {result.kind === 'A' || result.kind === 'B' ? 'ACCESO PERMITIDO'
              : result.kind === 'C' ? 'ACCESO YA REGISTRADO'
              : result.kind === 'D' ? 'SIN ENTRADA PAGADA PARA ESTE EVENTO'
              : 'NO SE PUDO VALIDAR'}
          </h2>
          {result.message && <p style={{ margin: '4px 0 0', fontSize: 14, opacity: 0.9 }}>{result.message}</p>}

          {first && (
            <div style={{ marginTop: 14, width: '100%', maxWidth: 440, background: 'rgba(255,255,255,0.16)', borderRadius: 18, padding: '14px 16px' }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.8 }}>Persona</p>
              <p style={{ margin: '2px 0 6px', fontSize: 28, fontWeight: 900, lineHeight: 1.15 }}>{first.person.nombre}</p>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{event.titulo}</p>
              <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.9 }}>
                {first.person.isPayer || first.ins.uid === result.uid ? 'Pagó él/ella mismo/a' : `Pagado por ${first.pagadoPor}`}
                {result.kind === 'C' && first.at ? ` · entró a las ${fmtHour(toDate(first.at))}` : ''}
                {result.mine.length > 1 ? ` · ${result.mine.length} plazas a su nombre` : ''}
              </p>
            </div>
          )}
          {result.kind === 'D' && (
            <p style={{ margin: '10px 0 0', fontSize: 14, opacity: 0.9, maxWidth: 360 }}>Este fallero no tiene ninguna plaza pagada en «{event.titulo}». Puede inscribirse desde la app o pedir a la directiva un alta manual.</p>
          )}

          {(pendingGuests.length > 0 || enteredGuests.length > 0) && (
            <div style={{ marginTop: 14, width: '100%', maxWidth: 440, textAlign: 'left' }}>
              <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.85 }}>
                Invitados a su cargo · {pendingGuests.length} pendiente{pendingGuests.length === 1 ? '' : 's'}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {pendingGuests.map(g => (
                  <button key={g.key} onClick={() => admitGuest(g)} disabled={busyKey === g.key}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%', minHeight: 58, padding: '0 16px', background: WHITE, color: '#111', border: 'none', borderRadius: 14, fontSize: 17, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                    <span style={{ minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{g.person.nombre}</span>
                    <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, color: GREEN, fontSize: 14 }}>
                      {busyKey === g.key ? <Loader2 size={16} style={{ animation: 'falla-spin 0.8s linear infinite' }} /> : <><DoorOpen size={16} /> Dar acceso</>}
                    </span>
                  </button>
                ))}
                {enteredGuests.map(g => (
                  <div key={g.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', background: 'rgba(0,0,0,0.18)', borderRadius: 14, fontSize: 15, fontWeight: 700 }}>
                    <span>{g.person.nombre}</span><span>✓ dentro{g.at ? ` · ${fmtHour(toDate(g.at))}` : ''}</span>
                  </div>
                ))}
              </div>
              {actionErr && <p style={{ margin: '8px 0 0', fontSize: 13, background: 'rgba(0,0,0,0.3)', padding: '8px 10px', borderRadius: 10 }}>⚠️ {actionErr}</p>}
            </div>
          )}

          <div style={{ marginTop: 'auto', paddingTop: 20, width: '100%', maxWidth: 440, display: 'flex', gap: 10 }}>
            <button onClick={resume} style={{ flex: 2, minHeight: 56, background: WHITE, color: '#111', border: 'none', borderRadius: 14, fontSize: 16, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}>
              <RefreshCw size={18} /> Escanear otro
            </button>
            <button onClick={onClose} style={{ flex: 1, minHeight: 56, background: 'rgba(0,0,0,0.25)', color: WHITE, border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
