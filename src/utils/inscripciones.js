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
