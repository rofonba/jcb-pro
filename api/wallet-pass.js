// Pase oficial de Apple Wallet (.pkpass) del carnet de fallero.
//
// GET/POST /api/wallet-pass  (Authorization: Bearer <Firebase ID token>)
//   → 200 application/vnd.apple.pkpass  (carnet-jcb.pkpass)
//   → 503 { code: 'WALLET_NOT_CONFIGURED' } si aún no hay certificados de Apple Developer en Vercel
//
// Variables de entorno (Vercel) necesarias para firmar:
//   APPLE_PASS_TYPE_ID          pass.es.fallajcb.carnet  (Pass Type ID creado en Apple Developer)
//   APPLE_TEAM_ID               ABCDE12345               (Team ID de la cuenta de desarrollador)
//   APPLE_PASS_CERT_P12_BASE64  certificado del Pass Type ID exportado como .p12, en base64
//   APPLE_PASS_CERT_PASSWORD    contraseña de ese .p12
//   APPLE_WWDR_PEM_BASE64       certificado Apple WWDR G4 (.pem) en base64
//
// El QR del pase es el mismo pase permanente de la app: JCB-USER:<uid>.

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app'
import { getAuth }      from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { PKPass }       from 'passkit-generator'
import forge            from 'node-forge'
import zlib             from 'node:zlib'

const REQUIRED = ['APPLE_PASS_TYPE_ID', 'APPLE_TEAM_ID', 'APPLE_PASS_CERT_P12_BASE64', 'APPLE_PASS_CERT_PASSWORD', 'APPLE_WWDR_PEM_BASE64']

function adminApp() {
  if (getApps().length) return getApp()
  return initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  })
}

// ── PNG sólido generado al vuelo (icon.png es obligatorio en un .pkpass) ─────────────────────
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
const crc32 = buf => { let c = 0xFFFFFFFF; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0 }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td  = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function solidPng(size, [r, g, b]) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0   // 8 bit, RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [r, g, b]).flat())])
  const raw = Buffer.concat(Array.from({ length: size }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ])
}

// .p12 (base64) → { signerCert, signerKey } en PEM
function pemFromP12(p12b64, password) {
  const der = forge.util.decode64(p12b64)
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der), false, password)
  const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0]
  const keyBag  = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]
    ?? p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0]
  if (!certBag?.cert || !keyBag?.key) throw new Error('El .p12 no contiene certificado y clave privada')
  return { signerCert: forge.pki.certificateToPem(certBag.cert), signerKey: forge.pki.privateKeyToPem(keyBag.key) }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // ── 1. Auth ──
  const bearer = req.headers.authorization
  if (!bearer?.startsWith('Bearer ')) return res.status(401).json({ error: 'Sin token' })
  let decoded
  try { decoded = await getAuth(adminApp()).verifyIdToken(bearer.slice(7)) }
  catch { return res.status(401).json({ error: 'Token inválido' }) }

  // ── 2. ¿Wallet configurado? ──
  const missing = REQUIRED.filter(k => !process.env[k])
  if (missing.length) {
    return res.status(503).json({ code: 'WALLET_NOT_CONFIGURED', message: 'El pase oficial para Apple Wallet se activará próximamente.', missing })
  }

  // ── 3. Datos del fallero ──
  const snap = await getFirestore(adminApp()).collection('falleros').doc(decoded.uid).get()
  if (!snap.exists) return res.status(404).json({ error: 'Perfil de fallero no encontrado' })
  const f = snap.data()
  const nombre = `${f.nombre ?? ''} ${f.apellidos ?? ''}`.trim() || 'Fallero/a'
  const rol = f.rol === 'admin' ? 'Administrador' : f.rol === 'directiva' ? 'Directiva' : 'Fallero/a'
  const censo = Number.isInteger(f.numeroCenso) ? String(f.numeroCenso).padStart(3, '0') : '—'

  // ── 4. pass.json (colores corporativos: fondo negro carnet, texto dorado, rojo falla) ──
  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: process.env.APPLE_PASS_TYPE_ID,
    teamIdentifier:     process.env.APPLE_TEAM_ID,
    serialNumber:       decoded.uid,
    organizationName:   'Falla Joaquín Costa · Burriana',
    description:        'Carnet de fallero · Falla Joaquín Costa',
    logoText:           'Falla Joaquín Costa',
    backgroundColor:    'rgb(15, 15, 15)',
    foregroundColor:    'rgb(255, 255, 255)',
    labelColor:         'rgb(212, 175, 55)',
    barcodes: [{ format: 'PKBarcodeFormatQR', message: `JCB-USER:${decoded.uid}`, messageEncoding: 'iso-8859-1', altText: `Nº ${censo}` }],
    generic: {
      headerFields:    [{ key: 'censo', label: 'Nº CENSO', value: censo }],
      primaryFields:   [{ key: 'nombre', label: 'FALLERO/A', value: nombre }],
      secondaryFields: [{ key: 'rol', label: 'ROL', value: rol }, ...(f.distintivo ? [{ key: 'dist', label: 'DISTINTIVO', value: String(f.distintivo) }] : [])],
      auxiliaryFields: [{ key: 'falla', label: 'COMISIÓN', value: 'Burriana · Valencia' }],
      backFields: [
        { key: 'uso', label: 'Uso', value: 'Enseña el QR en la puerta de los actos: es tu pase permanente y vale para todas tus entradas pagadas.' },
        { key: 'id', label: 'Identificador', value: `JCB-USER:${decoded.uid}` },
      ],
    },
  }

  // ── 5. Firma y zip ──
  try {
    const { signerCert, signerKey } = pemFromP12(process.env.APPLE_PASS_CERT_P12_BASE64, process.env.APPLE_PASS_CERT_PASSWORD)
    const wwdr = Buffer.from(process.env.APPLE_WWDR_PEM_BASE64, 'base64').toString('utf8')
    const red  = [206, 17, 38]
    const pass = new PKPass({
      'pass.json':   Buffer.from(JSON.stringify(passJson)),
      'icon.png':    solidPng(29, red), 'icon@2x.png': solidPng(58, red), 'icon@3x.png': solidPng(87, red),
      'logo.png':    solidPng(50, red), 'logo@2x.png': solidPng(100, red),
    }, { wwdr, signerCert, signerKey })
    const buf = pass.getAsBuffer()
    res.setHeader('Content-Type', 'application/vnd.apple.pkpass')
    res.setHeader('Content-Disposition', 'attachment; filename="carnet-jcb.pkpass"')
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).send(buf)
  } catch (err) {
    console.error('[wallet-pass]', err)
    return res.status(500).json({ error: 'No se pudo generar el pase: ' + err.message })
  }
}
