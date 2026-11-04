// Cálculo de precios SERVER-SIDE. Única fuente de verdad del desglose adulto/niño.
//
// Regla de negocio (tesorería):
//   · edad ≤ 14 años cumplidos → tarifa NIÑO;  ≥ 15 años cumplidos → tarifa ADULTO.
//   · La edad sale SIEMPRE de falleros/{uid}.fechaNacimiento (lectura con Admin SDK).
//   · Hijo del censo (falleros/{parent}.hijos[i]): por su fechaNacimiento; sin fecha → niño.
//   · Fallero con app sin fecha de nacimiento → adulto (no se puede demostrar que es menor).
//   · Externo (type 'manual'): categoría DECLARADA por el fallero ('adulto' | 'nino'); se confía
//     en su buena fe (decisión de negocio). Es la única parte no verificable del desglose.
// El navegador sólo indica QUIÉN va (type + uid / categoría del externo); jamás cuántos adultos/niños.
//
// El prefijo `_` evita que Vercel exponga este fichero como endpoint.

export const CHILD_MAX_AGE  = 14
export const MAX_COMPANIONS = 30

export class PricingError extends Error {
  constructor(message) { super(message); this.status = 400 }
}

// Fecha de hoy en Madrid (YYYY-MM-DD): la edad no debe depender de la zona horaria del servidor.
export function madridToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

// Años cumplidos a fecha `today`. null si la fecha falta o es inválida.
export function ageYears(dob, today = madridToday()) {
  if (typeof dob !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null
  const [by, bm, bd] = dob.split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)
  let age = ty - by
  if (tm < bm || (tm === bm && td < bd)) age--
  return age >= 0 && age < 130 ? age : null
}

const isChildAge = age => age <= CHILD_MAX_AGE

// companions: [{ type: 'censo_app' | 'censo_hijo' | 'manual', uid? }]
// Devuelve { adultCount, childCount } incluyendo al titular (payerUid).
export async function computeBreakdown(db, payerUid, companions) {
  if (!Array.isArray(companions)) throw new PricingError('companions debe ser una lista')
  if (companions.length > MAX_COMPANIONS) throw new PricingError('Demasiados acompañantes')

  const list = []
  const seen = new Set([payerUid])
  const ids  = new Set([payerUid])
  for (const c of companions) {
    const type = c?.type
    if (type === 'manual') {
      // externo_adulto / externo_nino. Sin categoría (clientes antiguos) → adulto.
      const categoria = c.categoria ?? 'adulto'
      if (categoria !== 'adulto' && categoria !== 'nino') throw new PricingError('Categoría de externo no válida')
      list.push({ type, categoria }); continue
    }
    if (type !== 'censo_app' && type !== 'censo_hijo') throw new PricingError('Tipo de acompañante no válido')
    const uid = typeof c.uid === 'string' ? c.uid : ''
    if (!uid || seen.has(uid)) throw new PricingError('Acompañante no válido o repetido')
    seen.add(uid)
    if (type === 'censo_app') {
      ids.add(uid); list.push({ type, uid })
    } else {
      const m = /^(.+)\|h(\d+)$/.exec(uid)       // id sintético: `${parentUid}|h${índice}`
      if (!m) throw new PricingError('Hijo del censo no válido')
      ids.add(m[1]); list.push({ type, uid, parent: m[1], idx: Number(m[2]) })
    }
  }

  const snaps = await db.getAll(...[...ids].map(id => db.collection('falleros').doc(id)))
  const docs  = new Map(snaps.map(s => [s.id, s.exists ? s.data() : null]))
  const today = madridToday()

  let adultCount = 0, childCount = 0

  const payer = docs.get(payerUid)
  if (!payer) throw new PricingError('Tu perfil de fallero no existe')
  const payerAge = ageYears(payer.fechaNacimiento, today)
  if (payerAge != null && isChildAge(payerAge)) childCount++; else adultCount++

  for (const c of list) {
    if (c.type === 'manual') { if (c.categoria === 'nino') childCount++; else adultCount++; continue }
    if (c.type === 'censo_app') {
      const d = docs.get(c.uid)
      if (!d) throw new PricingError('Fallero acompañante no encontrado')
      const age = ageYears(d.fechaNacimiento, today)
      if (age != null && isChildAge(age)) childCount++; else adultCount++
      continue
    }
    const h = docs.get(c.parent)?.hijos?.[c.idx]
    if (h == null) throw new PricingError('Hijo del censo no encontrado')
    const age = ageYears(typeof h === 'object' ? h.fechaNacimiento : null, today)
    if (age == null || isChildAge(age)) childCount++; else adultCount++
  }

  return { adultCount, childCount }
}

export const netCents = (adultCount, childCount, precio, precioNino) =>
  Math.round((adultCount * precio + childCount * (precioNino ?? precio)) * 100)

// Acompañantes de una inscripción ya guardada → mismo formato que computeBreakdown.
export function companionsFromInscription(ins) {
  return [...(ins.acompañantesAdultos ?? []), ...(ins.acompañantesNinos ?? [])]
    .map(c => ({ type: c?.tipoRegistro, uid: c?.uid ?? null, categoria: c?.categoria ?? undefined }))
}
