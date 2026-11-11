// Distintivos (recompensas) del censo: el Excel los trae como "AAAA-BUN.TIPO", p. ej. "2024-BUN.OR".
const TIPOS = {
  'BUN.COURE':     "Bunyol de Coure",
  'BUN.ARGENT':    "Bunyol d'Argent",
  'BUN.OR':        "Bunyol d'Or",
  'BUN.FULLES':    "Bunyol d'Or amb Fulles de Llorer",
  'BUN.BRILLANTS': "Bunyol d'Or amb Fulles de Llorer i Brillants",
}

// → { label: "Bunyol d'Or", year: "2024" } · si el formato no se reconoce, se muestra tal cual
export function formatDistintivo(raw) {
  if (!raw) return null
  const m = /^(\d{4})\s*-\s*(.+)$/.exec(String(raw).trim())
  const code = (m ? m[2] : String(raw)).trim().toUpperCase()
  return { label: TIPOS[code] ?? (m ? m[2] : String(raw)), year: m ? m[1] : null }
}
