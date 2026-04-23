import { getAuth } from 'firebase/auth'

export async function enviarNotificacionFCM(titulo, cuerpo) {
  const user = getAuth().currentUser
  if (!user) throw new Error('No autenticado')

  const idToken = await user.getIdToken()

  const res = await fetch('/api/sendPush', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify({ title: titulo, body: cuerpo }),
  })

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}))
    throw new Error(payload.error || `HTTP ${res.status}`)
  }
  return await res.json() // { sent, failed }
}
