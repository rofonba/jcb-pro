// Avisos visibles = (createdAt >= hace 30 días) OR (pineado == true).
// Orden: fijados arriba; dentro de cada grupo, del más reciente al más antiguo.
//
// La OR se resuelve con DOS listeners (recientes + fijados) que se fusionan sin duplicados:
// así no hace falta índice compuesto ni la API `or()`, y los fijados antiguos nunca se pierden.
// Modelo del documento `anuncios/{id}`: { titulo, cuerpo, esUrgente, pineado: boolean, createdAt, … }
import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, orderBy, query, Timestamp, where } from 'firebase/firestore'
import { db } from '../firebase'

export const AVISOS_DIAS = 30
const DAY_MS = 24 * 60 * 60 * 1000

// createdAt → ms. Escritura local recién hecha (serverTimestamp pendiente) → ahora: va arriba.
const tsMs = a => a.createdAt?.toMillis?.() ?? (a.createdAt ? new Date(a.createdAt).getTime() : Date.now())

export function isAnuncioVisible(a, now = Date.now()) {
  return a.pineado === true || tsMs(a) >= now - AVISOS_DIAS * DAY_MS
}

export function sortAnuncios(list) {
  return [...list].sort((a, b) => {
    const pa = a.pineado === true ? 1 : 0, pb = b.pineado === true ? 1 : 0
    if (pa !== pb) return pb - pa
    return tsMs(b) - tsMs(a)
  })
}

export function useAnuncios() {
  const [recent, setRecent] = useState([])
  const [pinned, setPinned] = useState([])
  const [loaded, setLoaded] = useState({ recent: false, pinned: false })

  useEffect(() => {
    const cutoff = Timestamp.fromMillis(Date.now() - AVISOS_DIAS * DAY_MS)
    const done = key => setLoaded(l => (l[key] ? l : { ...l, [key]: true }))
    const toList = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }))
    const u1 = onSnapshot(
      query(collection(db, 'anuncios'), where('createdAt', '>=', cutoff), orderBy('createdAt', 'desc')),
      snap => { setRecent(toList(snap)); done('recent') },
      () => done('recent'))
    const u2 = onSnapshot(
      query(collection(db, 'anuncios'), where('pineado', '==', true)),
      snap => { setPinned(toList(snap)); done('pinned') },
      () => done('pinned'))
    return () => { u1(); u2() }
  }, [])

  const anuncios = useMemo(() => {
    const byId = new Map()
    for (const a of [...recent, ...pinned]) byId.set(a.id, a)   // el fijado gana (estado más reciente)
    // Filtro final en cliente: la app puede estar abierta días y el corte de la query no se mueve.
    return sortAnuncios([...byId.values()].filter(a => isAnuncioVisible(a)))
  }, [recent, pinned])

  return { anuncios, loading: !(loaded.recent && loaded.pinned) }
}
