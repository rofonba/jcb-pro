// Todas las inscripciones en las que participo, en vivo, unificando los dos modelos:
//   · clásico: uid == yo (titular) · beneficiariosUids contiene mi uid (me incluyó otro fallero)
//   · grupo:   asistenteUid == yo (mi plaza, la pague quien la pague) · pagadorUid == yo (plazas que pagué)
// Mismo criterio que UserWallet. Sin filtros de fecha ni de estado: eso lo decide cada vista.
import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase'

export function useMisInscripciones(uid) {
  const [parts, setParts] = useState({})
  const [loaded, setLoaded] = useState(0)

  useEffect(() => {
    if (!uid) return
    const col = collection(db, 'inscripciones')
    const qs = {
      uid:        query(col, where('uid', '==', uid)),
      asistente:  query(col, where('asistenteUid', '==', uid)),
      pagador:    query(col, where('pagadorUid', '==', uid)),
      benef:      query(col, where('beneficiariosUids', 'array-contains', uid)),
    }
    const unsubs = Object.entries(qs).map(([k, q]) => onSnapshot(q,
      snap => { setParts(p => ({ ...p, [k]: snap.docs.map(d => ({ id: d.id, ...d.data() })) })); setLoaded(n => n + 1) },
      () => setLoaded(n => n + 1)))
    // Al cambiar de usuario (o desmontar) se limpian los datos del anterior
    return () => { unsubs.forEach(u => u()); setParts({}); setLoaded(0) }
  }, [uid])

  const inscripciones = useMemo(() => {
    const byId = new Map()
    for (const list of Object.values(parts)) for (const i of list) byId.set(i.id, i)
    return [...byId.values()]
  }, [parts])

  return { inscripciones, loading: loaded < 4 }
}
