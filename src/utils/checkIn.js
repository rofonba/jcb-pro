import { doc, runTransaction, serverTimestamp, deleteField } from 'firebase/firestore'
import { db } from '../firebase'

// Control de acceso individual.
//
// Cada inscripción pagada tiene un mapa `checkInEstado`:
//   { [personId]: { checkIn: true, checkInAt: Timestamp } }
// personId: uid del pagador; para acompañantes, su uid si lo tienen (falleros e hijos
// del censo) o `ext_<índice>` si no (invitados manuales).

// Todas las personas cubiertas por una inscripción: titular + acompañantes.
export function getPersons(ins) {
  // Modelo de grupo (v2): UN documento por persona. Su "titular" es el pagador (puede ser otro doc).
  if (ins.modelo === 2) {
    const tipo = ins.tipo === 'invitado' ? 'manual'
      : ins.tipo === 'hijo' ? 'censo_hijo'
      : ins.asistenteUid ? 'censo_app' : 'censo_sinapp'
    return [{
      id: ins.asistenteKey ?? ins.id ?? 'asistente',
      nombre: ins.asistenteNombre || ins.nombre || 'Fallero',
      tipo, appUid: ins.asistenteUid ?? null,
      isPayer: !!ins.asistenteUid && ins.asistenteUid === ins.pagadorUid,
      docId: ins.id ?? null, v2: true,
    }]
  }
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

// ¿Es un invitado externo (de fuera del censo)? Internos = titular, fallero con app, hijos del censo.
export function isExternalPerson(person, ins) {
  return person.tipo === 'manual' || ins.esManual === true
}

// Personas de la inscripción por las que el TITULAR puede hacer el check-in (no tienen app:
// externos e hijos del censo). Lo fija el webhook al confirmar el pago (checkInDelegadoIds).
export function getDelegatedPersons(ins) {
  const ids = new Set(ins.checkInDelegadoIds ?? [])
  return getPersons(ins).filter(p => !p.isPayer && ids.has(p.id))
}

// Marca la entrada de una o varias personas de UNA inscripción en una sola transacción
// (relee y no pisa a quien ya entró). Lo usan: lista de puerta (staff), Control de Accesos
// (staff) y Fast Track (titular + sus invitados).
export async function markCheckInGroup(inscriptionId, persons) {
  if (!persons.length) throw new Error('No hay nadie seleccionado.')
  await runTransaction(db, async (tx) => {
    const ref  = doc(db, 'inscripciones', inscriptionId)
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('La inscripción ya no existe.')
    const data = snap.data()
    if (data.modelo === 2) {   // v2: un check-in por documento
      if (data.checkIn === true) throw new Error(`${persons[0]?.nombre ?? 'Esta persona'} ya ha entrado.`)
      tx.update(ref, { checkIn: true, checkInAt: serverTimestamp() })
      return
    }
    const upd  = {}
    for (const p of persons) {
      if (!getCheckInState(data, p.id).entered) {
        upd[`checkInEstado.${p.id}`] = { checkIn: true, checkInAt: serverTimestamp() }
      }
    }
    if (!Object.keys(upd).length) {
      throw new Error(persons.length === 1 ? `${persons[0].nombre} ya ha entrado.` : 'Ya han entrado todos.')
    }
    tx.update(ref, upd)
  })
}

export const markCheckIn = (inscriptionId, person) => markCheckInGroup(inscriptionId, [person])

// v2: marca la entrada de VARIOS documentos (yo + mis invitados sin app) en una sola transacción.
export async function markCheckInDocs(docIds) {
  const ids = [...new Set(docIds.filter(Boolean))]
  if (!ids.length) throw new Error('No hay nadie seleccionado.')
  await runTransaction(db, async (tx) => {
    const refs  = ids.map(id => doc(db, 'inscripciones', id))
    const snaps = await Promise.all(refs.map(r => tx.get(r)))
    let n = 0
    snaps.forEach((s, i) => {
      if (!s.exists() || s.data().checkIn === true) return
      tx.update(refs[i], { checkIn: true, checkInAt: serverTimestamp() }); n++
    })
    if (!n) throw new Error(ids.length === 1 ? 'Ya ha entrado.' : 'Ya han entrado todos.')
  })
}

// Deshacer la entrada de una persona (sólo staff: las reglas no lo permiten a nadie más).
export async function undoCheckIn(inscriptionId, person) {
  await runTransaction(db, async (tx) => {
    const ref  = doc(db, 'inscripciones', inscriptionId)
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('La inscripción ya no existe.')
    const data = snap.data()
    if (data.modelo === 2) { tx.update(ref, { checkIn: false, checkInAt: deleteField() }); return }
    const upd  = {}
    // Datos antiguos con checkIn global: se desglosa a individual antes de anular a uno.
    if (data.checkIn === true) {
      upd.checkIn = deleteField(); upd.checkInAt = deleteField()
      for (const p of getPersons(data)) {
        if (p.id !== person.id && !data.checkInEstado?.[p.id]?.checkIn) {
          upd[`checkInEstado.${p.id}`] = { checkIn: true, checkInAt: data.checkInAt ?? serverTimestamp() }
        }
      }
    }
    upd[`checkInEstado.${person.id}`] = deleteField()
    tx.update(ref, upd)
  })
}
