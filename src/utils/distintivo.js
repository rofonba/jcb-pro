// Distintivos (recompensas) del censo: el Excel los trae como "AAAA-BUN.TIPO", p. ej. "2024-BUN.OR".
const TIPOS = {
  'BUN.COURE':     "Bunyol de Coure",
  'BUN.ARGENT':    "Bunyol d'Argent",
  'BUN.OR':        "Bunyol d'Or",
  'BUN.FULLES':    "Bunyol d'Or amb Fulles de Llorer",
  'BUN.BRILLANTS': "Bunyol d'Or i Brillants amb Fulles de Llorer",   // denominación del Reglamento Fallero
}

// ─── Recompensas por antigüedad (años en la falla) ──────────────────────────
// El Bunyol de Coure no tiene umbral definido: no participa en el cálculo.
export const BUNYOL_THRESHOLDS = [
  { code: 'BUN.ARGENT',    years: 7,  label: TIPOS['BUN.ARGENT'] },
  { code: 'BUN.OR',        years: 10, label: TIPOS['BUN.OR'] },
  { code: 'BUN.FULLES',    years: 20, label: TIPOS['BUN.FULLES'] },
  { code: 'BUN.BRILLANTS', years: 30, label: TIPOS['BUN.BRILLANTS'] },
]

function parseDistintivo(raw) {
  if (!raw) return null
  const m = /^(\d{4})\s*-\s*(.+)$/.exec(String(raw).trim())
  if (!m) return null
  return { year: Number(m[1]), code: m[2].trim().toUpperCase() }
}

// Año de alta DEDUCIDO del distintivo: el censo no trae antigüedad, pero sí el año en que se
// recibió la última recompensa ("2024-BUN.OR" → 10 años en 2024 → alta en 2014).
// null si no hay distintivo o su tipo no tiene umbral (p. ej. Coure).
export function altaYearFromDistintivo(raw) {
  const d = parseDistintivo(raw)
  const t = d && BUNYOL_THRESHOLDS.find(x => x.code === d.code)
  return t ? d.year - t.years : null
}

// Próxima recompensa para un fallero dado su año de alta.
// → { yearsInFalla, label, years, year, overdue } · null si ya tiene la máxima (30 años) o no hay dato.
//   overdue: el año calculado ya pasó y la recompensa no consta (bajas temporales, censo sin
//   actualizar…): la UI no debe prometer un año.
export function calculateNextBunyol(altaYear, currentYear = new Date().getFullYear()) {
  if (!Number.isInteger(altaYear) || altaYear > currentYear) return null
  const yearsInFalla = currentYear - altaYear
  // Primer umbral que aún no ha cruzado (si lo cumple este mismo año, es el de este año)
  const next = BUNYOL_THRESHOLDS.find(t => altaYear + t.years >= currentYear)
  if (!next) return null
  const year = altaYear + next.years
  return { yearsInFalla, label: next.label, years: next.years, year, overdue: false }
}

// Variante a partir del distintivo ACTUAL: el siguiente umbral es el posterior al que ya tiene
// (no el que "tocaría" por años), así nunca se le anuncia uno que ya posee.
export function nextBunyolFromDistintivo(raw, currentYear = new Date().getFullYear()) {
  const d = parseDistintivo(raw)
  const idx = d ? BUNYOL_THRESHOLDS.findIndex(x => x.code === d.code) : -1
  if (idx < 0 || idx === BUNYOL_THRESHOLDS.length - 1) return null   // sin dato o ya tiene Brillants
  const altaYear = d.year - BUNYOL_THRESHOLDS[idx].years
  const next = BUNYOL_THRESHOLDS[idx + 1]
  const year = altaYear + next.years
  return { yearsInFalla: currentYear - altaYear, label: next.label, years: next.years, year, overdue: year < currentYear }
}

// → { label: "Bunyol d'Or", year: "2024" } · si el formato no se reconoce, se muestra tal cual
export function formatDistintivo(raw) {
  if (!raw) return null
  const m = /^(\d{4})\s*-\s*(.+)$/.exec(String(raw).trim())
  const code = (m ? m[2] : String(raw)).trim().toUpperCase()
  return { label: TIPOS[code] ?? (m ? m[2] : String(raw)), year: m ? m[1] : null }
}
