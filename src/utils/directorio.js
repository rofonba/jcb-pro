// Directorio: copia reducida y NO sensible de `falleros` que pueden leer todos los usuarios
// autenticados (buscador de acompañantes). Sólo contiene lo imprescindible:
//   uid · nombre · apellidos · numeroFallero · fechaNacimiento · hijos[{ nombre, fechaNacimiento }]
// (la fecha de nacimiento es necesaria para aplicar la tarifa niño/adulto por edad)
// NUNCA: email, teléfono, rol, tokens, familiaUids…
import { doc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'

export function buildDirectorioEntry(uid, f) {
  return {
    uid,
    nombre:        f.nombre ?? '',
    apellidos:     f.apellidos ?? '',
    // Debe coincidir exactamente con falleros/{uid}.numeroFallero (lo exigen las reglas)
    numeroFallero: f.numeroFallero ?? null,
    // Debe coincidir con falleros/{uid}.fechaNacimiento ('' si no hay; lo exigen las reglas)
    fechaNacimiento: f.fechaNacimiento ?? '',
    // OJO: no filtrar ni reordenar. El índice debe coincidir con falleros.hijos[i]
    // (el id `${uid}|h${i}` lo usa el servidor para calcular el precio).
    hijos: (Array.isArray(f.hijos) ? f.hijos : []).map(h => ({
      nombre:          (typeof h === 'string' ? h : h?.nombre) ?? '',
      fechaNacimiento: (typeof h === 'object' ? h?.fechaNacimiento : null) ?? null,
    })),
  }
}

// Sincronización "best effort": el perfil principal manda; si el directorio falla
// (red, reglas) no se rompe el registro ni la edición del perfil.
export async function syncDirectorio(uid, falleroData) {
  try {
    await setDoc(doc(db, 'directorio', uid), buildDirectorioEntry(uid, falleroData))
  } catch (err) {
    console.warn('[directorio] no se pudo sincronizar', err?.code ?? err)
  }
}
