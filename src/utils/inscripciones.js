// Inscripciones de pago online: mientras el webhook de Stripe no confirma el cobro,
// la inscripción está "pendiente" (estadoPago: 'pendiente', sin pagado:true).

// Una reserva pendiente sólo protege el aforo este tiempo; pasado, se considera abandonada.
export const PENDING_TTL_MS = 15 * 60 * 1000

export const isPendingPayment = (ins) => ins?.pagado !== true && ins?.estadoPago === 'pendiente'

// ¿Cuenta para el aforo al RESERVAR? Confirmadas + pendientes recientes (no abandonadas).
export function countsForCapacity(ins) {
  if (!isPendingPayment(ins)) return true
  const t = ins.createdAt?.toMillis?.()
  return t == null || Date.now() - t <= PENDING_TTL_MS   // t == null: escritura local aún sin servidor
}

// Reserva de pago ABANDONADA: pendiente (v1 `uid` o v2 `pagadorUid`) con más de PENDING_TTL_MS.
// Ya no ocupa plaza; se puede borrar sin más (el dueño/pagador tiene permiso en las reglas).
export function isStalePending(ins, now = Date.now()) {
  if (!isPendingPayment(ins)) return false
  const t = ins.createdAt?.toMillis?.()
  return t != null && now - t > PENDING_TTL_MS
}
