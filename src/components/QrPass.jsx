// Pase Único Permanente de Fallero: tarjeta de alto contraste con el QR `JCB-USER:<uid>`.
// El QR no cambia nunca: identifica a la persona, y el escáner de Control de Accesos busca en
// Firestore las plazas pagadas vinculadas a ese uid en el evento (propias, pagadas por otro
// fallero, e invitados sin app a su cargo). Sin Apple/Google Wallet por ahora.
import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { X, Loader2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const GOLD  = '#B8860B'   // dorado oscuro: legible sobre blanco puro
const TEXT  = '#000000'
const TEXT2 = '#374151'
const GREEN = '#15803d'

const ROLE = { admin: '👑 Admin', directiva: '⭐ Directiva', fallero: '🔥 Fallero' }

const toDate = f => (f?.toDate ? f.toDate() : f ? new Date(f) : null)
const fmt = d => d ? d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }) : 'sin fecha'

const qrValueFor = uid => `JCB-USER:${uid}`

// Botón oficial "Añadir a Apple Wallet": pide el .pkpass firmado a /api/wallet-pass.
// Mientras Apple Developer no esté dado de alta, el endpoint responde 503 WALLET_NOT_CONFIGURED
// y aquí se muestra un aviso amable (sin errores técnicos).
function AppleWalletButton() {
  const { user } = useAuth()
  const [state, setState] = useState({ busy: false, msg: '', ok: false })
  const add = async () => {
    if (!user || state.busy) return
    setState({ busy: true, msg: '', ok: false })
    try {
      const idToken = await user.getIdToken()
      const res = await fetch('/api/wallet-pass', { headers: { Authorization: `Bearer ${idToken}` } })
      if (res.status === 503) {
        const j = await res.json().catch(() => ({}))
        setState({ busy: false, ok: false, msg: j.message || 'El pase oficial para Apple Wallet se activará próximamente.' }); return
      }
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || `HTTP ${res.status}`) }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = 'carnet-jcb.pkpass'; document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
      setState({ busy: false, ok: true, msg: 'Pase generado. Si no se abre solo, ábrelo desde Descargas para añadirlo a Wallet.' })
    } catch (err) {
      setState({ busy: false, ok: false, msg: 'No se pudo generar el pase ahora mismo. Inténtalo más tarde.' })
      console.warn('[wallet-pass]', err?.message)
    }
  }
  return (
    <div style={{ width: '100%', marginTop: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <button type="button" onClick={add} disabled={state.busy} aria-label="Añadir a Apple Wallet"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minHeight: 50, padding: '0 22px', background: '#000', color: '#fff', border: '1.5px solid #000', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: state.busy ? 'wait' : 'pointer', fontFamily: 'inherit', letterSpacing: '-0.01em' }}>
        {state.busy ? <Loader2 size={18} style={{ animation: 'falla-spin 0.8s linear infinite' }} /> : (
          <svg width="26" height="20" viewBox="0 0 26 20" aria-hidden="true">
            <rect x="1" y="1" width="24" height="18" rx="3" fill="#fff" />
            <rect x="1" y="6" width="24" height="3.4" fill="#4cd964" />
            <rect x="1" y="9.4" width="24" height="3.4" fill="#ffcc00" />
            <rect x="1" y="12.8" width="24" height="3.4" fill="#ff3b30" />
            <rect x="4" y="2.5" width="18" height="4" rx="1" fill="#007aff" />
          </svg>
        )}
        Añadir a Apple Wallet
      </button>
      {state.msg && (
        <p style={{ margin: 0, fontSize: 12, color: state.ok ? GREEN : TEXT2, textAlign: 'center', maxWidth: 320, lineHeight: 1.4 }}>
          {state.ok ? '✅ ' : '🕒 '}{state.msg}
        </p>
      )}
    </div>
  )
}

export default function QrPass({ uid, nombre, rol = 'fallero', numeroCenso = null, events = [], onClose }) {
  // Brillo máximo sugerido: no se puede forzar desde web; el fondo blanco puro y el QR grande ayudan.
  useEffect(() => {
    const prev = document.body.style.background
    document.body.style.background = '#fff'
    return () => { document.body.style.background = prev }
  }, [])

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 120, background: '#ffffff', overflowY: 'auto', color: TEXT }}>
      <div onClick={e => e.stopPropagation()} style={{ maxWidth: 480, margin: '0 auto', padding: 'calc(16px + env(safe-area-inset-top)) 22px calc(28px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: GOLD }}>🪪 Pase de fallero · JCB</span>
          <button onClick={onClose} aria-label="Cerrar" style={{ width: 40, height: 40, minHeight: 'auto', minWidth: 'auto', borderRadius: 12, border: '1.5px solid #e5e7eb', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: TEXT2 }}>
            <X size={18} />
          </button>
        </div>

        <h1 style={{ margin: '6px 0 2px', fontSize: 28, fontWeight: 900, textAlign: 'center', lineHeight: 1.15, letterSpacing: '-0.02em' }}>{nombre}</h1>
        <p style={{ margin: '0 0 18px', fontSize: 14, fontWeight: 700, color: TEXT2 }}>
          {ROLE[rol] ?? ROLE.fallero}{Number.isInteger(numeroCenso) ? ` · Nº ${String(numeroCenso).padStart(3, '0')}` : ''}
        </p>

        <div style={{ padding: 16, background: '#fff', border: '3px solid #000', borderRadius: 24 }}>
          <QRCodeSVG value={qrValueFor(uid)} size={260} level="M" bgColor="#ffffff" fgColor="#000000" includeMargin={false} />
        </div>
        <p style={{ margin: '12px 0 0', fontSize: 11, fontFamily: 'monospace', color: TEXT2, letterSpacing: '0.04em' }}>{qrValueFor(uid)}</p>
        <p style={{ margin: '4px 0 22px', fontSize: 12, color: TEXT2, textAlign: 'center', maxWidth: 320 }}>
          Enseña este QR en la puerta: es permanente y vale para todos tus eventos pagados.
        </p>

        <div style={{ width: '100%' }}>
          <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: TEXT2 }}>
            Entradas vinculadas a este QR · {events.length}
          </p>
          {events.length === 0 ? (
            <p style={{ margin: 0, fontSize: 14, color: TEXT2, padding: '14px 0', textAlign: 'center' }}>No tienes entradas pagadas para próximos eventos.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {events.map(ev => (
                <div key={ev.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 14px', border: '2px solid #111', borderRadius: 14 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{ev.titulo}</div>
                    <div style={{ fontSize: 12, color: TEXT2, textTransform: 'capitalize' }}>{fmt(toDate(ev.fecha))}{ev.pagadoPor ? ` · pagado por ${ev.pagadoPor}` : ''}</div>
                  </div>
                  <span style={{ flexShrink: 0, padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 900, color: '#fff', background: ev.entered ? TEXT2 : GREEN }}>
                    {ev.entered ? '✓ DENTRO' : '✓ PAGADO'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <AppleWalletButton />
      </div>
    </div>
  )
}
