// Familia de un fallero = UNIÓN de dos vías (vínculo automático y bidireccional):
//   1) los uids de su propio array `familiaUids`;
//   2) quienes le han añadido a él (falleros con su uid en `familiaUids`).
// Basta con que UNO de los dos añada al otro para que ambos se vean como familia.
//
// Privacidad: los datos de los familiares se leen del `directorio` (copia reducida).
// De `falleros` sólo se consulta "quién me ha añadido" (lo permiten las reglas) y de
// esos documentos sólo se usa uid / nombre / apellidos como respaldo.
import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase'

export function useFamilia(userId, ownUids = []) {
  const [addedMe, setAddedMe] = useState([])   // [{ uid, nombre, apellidos }] — me tienen en su lista
  const [fetched, setFetched] = useState({})   // uid → ficha del directorio (o null si no existe)

  // Vía 2: quién me ha añadido (tiempo real)
  useEffect(() => {
    if (!userId) return
    const q = query(collection(db, 'falleros'), where('familiaUids', 'array-contains', userId))
    return onSnapshot(q,
      snap => setAddedMe(snap.docs
        .filter(d => d.id !== userId)
        .map(d => ({ uid: d.id, nombre: d.data().nombre ?? '', apellidos: d.data().apellidos ?? '' }))),
      err => console.warn('[familia] consulta inversa', err?.code ?? err))
  }, [userId])

  const ownKey   = ownUids.join(',')
  const addedKey = addedMe.map(f => f.uid).join(',')

  // Unión sin duplicados (y nunca yo mismo)
  const familiaUids = useMemo(
    () => [...new Set([...ownUids, ...addedMe.map(f => f.uid)])].filter(uid => uid && uid !== userId),
    [ownKey, addedKey, userId], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const familiaKey = familiaUids.join(',')

  // Datos de cada familiar desde el directorio (sólo los que aún no tenemos)
  useEffect(() => {
    const missing = familiaUids.filter(uid => !(uid in fetched))
    if (missing.length === 0) return
    let cancelled = false
    Promise.all(missing.map(uid =>
      getDoc(doc(db, 'directorio', uid))
        .then(d => [uid, d.exists() ? { uid, ...d.data() } : null])
        .catch(() => [uid, null])))
      .then(entries => { if (!cancelled) setFetched(prev => ({ ...prev, ...Object.fromEntries(entries) })) })
    return () => { cancelled = true }
  }, [familiaKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const addedMeUids = useMemo(() => new Set(addedMe.map(f => f.uid)), [addedKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const members = useMemo(() => familiaUids
    .map(uid => fetched[uid] ?? addedMe.find(f => f.uid === uid) ?? null)
    .filter(Boolean),
  [familiaKey, fetched, addedKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const loading = familiaUids.some(uid => !(uid in fetched))

  return { familiaUids, members, addedMeUids, loading }
}
