// Control de acceso individual.
//
// Cada inscripción pagada tiene un mapa `checkInEstado`:
//   { [personId]: { checkIn: true, checkInAt: Timestamp } }
// personId: uid del pagador; para acompañantes, su uid si lo tienen (falleros e hijos
// del censo) o `ext_<índice>` si no (invitados manuales).

// Todas las personas cubiertas por una inscripción: titular + acompañantes.
export function getPersons(ins) {
  const payer = { id: ins.uid, nombre: ins.nombre ?? 'Fallero', tipo: 'pagador', appUid: ins.uid, isPayer: true }
  const comps = Array.isArray(ins.beneficiarios)
    ? ins.beneficiarios
    : [...(ins.acompañantesAdultos ?? []), ...(ins.acompañantesNinos ?? [])]
  const others = comps.map((c, i) => {
    const tipo = c.tipo ?? c.tipoRegistro ?? null
    return {
      id:     c.id ?? c.uid ?? `ext_${i}`,
      nombre: c.nombre || 'Acompañante',
      tipo,
      appUid: tipo === 'censo_app' ? (c.uid ?? null) : null,
      isPayer: false,
    }
  })
  return [payer, ...others]
}

// Estado de una persona. Compatibilidad: inscripciones antiguas con `checkIn: true`
// global cuentan como "todos dentro".
export function getCheckInState(ins, personId) {
  const e = ins.checkInEstado?.[personId]
  if (e?.checkIn === true) return { entered: true, at: e.checkInAt ?? null }
  if (ins.checkIn === true) return { entered: true, at: ins.checkInAt ?? null }
  return { entered: false, at: null }
}
