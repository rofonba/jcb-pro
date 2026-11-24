// Comprobación test/live: Stripe responde "No such payment_intent: pi_…" cuando el PaymentIntent se creó
// con una STRIPE_SECRET_KEY de un modo (sk_test_ / sk_live_) y el navegador confirma con una
// VITE_STRIPE_PUBLISHABLE_KEY del otro (pk_test_ / pk_live_). El servidor devuelve `livemode`; aquí
// se contrasta ANTES de confirmar para dar un error claro en vez del críptico de Stripe.
export const STRIPE_PK = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? ''

export function checkStripeMode(livemode) {
  if (typeof livemode !== 'boolean') return null
  if (!STRIPE_PK) return 'Falta VITE_STRIPE_PUBLISHABLE_KEY en el build del frontend (Vercel → Environment Variables → redeploy).'
  const pkLive = STRIPE_PK.startsWith('pk_live_')
  if (pkLive === livemode) return null
  return `Claves de Stripe de modos distintos: el servidor usa STRIPE_SECRET_KEY de ${livemode ? 'LIVE' : 'TEST'} ` +
    `y la app se compiló con VITE_STRIPE_PUBLISHABLE_KEY de ${pkLive ? 'LIVE' : 'TEST'}. ` +
    `Alinea ambas en Vercel y vuelve a desplegar (las VITE_* se incrustan al compilar).`
}
