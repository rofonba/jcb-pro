// Política de Privacidad — vista PÚBLICA (sin login) en /privacidad.
// Requisito de publicación en App Store / Google Play: URL accesible con la política de datos.
// Mismo lenguaje visual que la pantalla de acceso (fondo oscuro, barra dorada, tarjeta de cristal).
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import logoFalla from '../assets/logo-falla.png'

const GOLD = '#C9A84C'
const CONTACT_EMAIL = 'mediosjcb@gmail.com'
const LAST_UPDATE = '16 de noviembre de 2026'

const H2 = ({ children }) => (
  <h2 style={{ fontSize: '0.95rem', fontWeight: 800, color: GOLD, margin: '1.6rem 0 0.5rem', letterSpacing: '0.01em' }}>
    {children}
  </h2>
)
const P = ({ children }) => (
  <p style={{ margin: '0 0 0.7rem', fontSize: '0.86rem', lineHeight: 1.65, color: 'rgba(255,255,255,0.72)' }}>{children}</p>
)
const UL = ({ items }) => (
  <ul style={{ margin: '0 0 0.7rem', paddingLeft: '1.1rem', fontSize: '0.86rem', lineHeight: 1.65, color: 'rgba(255,255,255,0.72)' }}>
    {items.map((it, i) => <li key={i} style={{ marginBottom: 4 }}>{it}</li>)}
  </ul>
)

export default function Privacy() {
  const goBack = () => {
    if (window.history.length > 1 && document.referrer.startsWith(window.location.origin)) window.history.back()
    else window.location.assign('/')
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(150deg, #080818 0%, #1c0509 55%, #0d0d20 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: 'calc(1.5rem + env(safe-area-inset-top)) 1.25rem calc(2rem + env(safe-area-inset-bottom))',
    }}>
      {/* Barra dorada superior (igual que en el acceso) */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, transparent 0%, #C9A84C 30%, #FFD700 50%, #C9A84C 70%, transparent 100%)' }} />

      <div style={{
        width: '100%', maxWidth: '560px',
        background: 'rgba(255,255,255,0.035)', backdropFilter: 'blur(24px)',
        border: '1px solid rgba(201,168,76,0.18)', borderRadius: '28px',
        padding: '2rem 1.5rem 2.25rem',
        boxShadow: '0 32px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)',
      }}>
        <button type="button" onClick={goBack}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'rgba(201,168,76,0.75)', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', padding: 0, minHeight: 'auto', minWidth: 'auto', marginBottom: '1.25rem' }}>
          <ArrowLeft size={15} /> Volver a la app
        </button>

        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <img src={logoFalla} alt="Falla Joaquín Costa" style={{ width: 64, height: 64, objectFit: 'contain', display: 'block', margin: '0 auto 0.75rem', filter: 'drop-shadow(0 6px 24px rgba(206,17,38,0.45))' }} />
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: GOLD, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            <ShieldCheck size={14} /> Política de Privacidad
          </div>
          <h1 style={{ margin: '0.5rem 0 0.25rem', fontSize: '1.35rem', fontWeight: 800, color: 'white', letterSpacing: '-0.01em' }}>
            Falla Joaquín Costa · Burriana
          </h1>
          <p style={{ margin: 0, fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)' }}>Última actualización: {LAST_UPDATE}</p>
        </div>

        <P>
          La aplicación <strong style={{ color: 'white' }}>JCB Falla</strong> es una herramienta de <strong style={{ color: 'white' }}>gestión interna</strong> de
          la Falla Joaquín Costa de Burriana (en adelante, «la Falla» o «la organización»), destinada exclusivamente a sus falleros y falleras y a
          las personas autorizadas por la comisión. Esta política explica qué datos tratamos, con qué finalidad y qué derechos tienes.
        </P>

        <H2>1. Responsable del tratamiento</H2>
        <P>
          Falla Joaquín Costa de Burriana (Castellón, España). Contacto para cualquier cuestión relativa a tus datos:{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: GOLD, textDecoration: 'none' }}>{CONTACT_EMAIL}</a>.
        </P>

        <H2>2. Datos que tratamos</H2>
        <UL items={[
          'Datos identificativos y de contacto: nombre, apellidos, correo electrónico y teléfono.',
          'Datos del censo fallero: número de censo, antigüedad y distintivos (recompensas) otorgados por la comisión.',
          'Fecha de nacimiento, propia y de los hijos/as que el fallero registre, utilizada únicamente para aplicar la tarifa de adulto o infantil en los actos.',
          'Vínculos familiares que el propio usuario establezca con otros miembros de la comisión.',
          'Inscripciones a actos y eventos, asistencia (control de acceso) y, en los actos de pago, el justificante del cobro.',
          'Identificador del dispositivo para notificaciones push, si el usuario las activa.',
        ]} />

        <H2>3. Finalidad</H2>
        <P>
          Tratamos los datos exclusivamente para la organización de la vida fallera: gestionar el censo, comunicar avisos de la comisión,
          organizar inscripciones y aforos de los actos, controlar el acceso a los mismos, gestionar las votaciones internas y cobrar las
          cuotas o actos de pago. No realizamos perfilado ni decisiones automatizadas con efectos jurídicos.
        </P>

        <H2>4. Base jurídica</H2>
        <P>
          El tratamiento se basa en la relación de pertenencia del usuario a la asociación fallera (ejecución de la relación asociativa y
          cumplimiento de sus estatutos) y, para las notificaciones push y los vínculos familiares, en el consentimiento del usuario,
          que puede retirar en cualquier momento desde la app.
        </P>

        <H2>5. Dónde y cómo se guardan los datos</H2>
        <P>
          Los datos se almacenan de forma segura en la plataforma <strong style={{ color: 'white' }}>Firebase (Google Cloud)</strong>, con
          cifrado en tránsito y en reposo, autenticación de usuarios y reglas de seguridad que limitan el acceso: cada fallero sólo puede
          ver y editar su propia información, y los datos del censo y de cobro sólo los gestiona la directiva. Google actúa como encargado
          del tratamiento conforme a sus condiciones de servicio y a las cláusulas contractuales tipo de la UE.
        </P>
        <P>
          Los pagos de los actos se procesan a través de <strong style={{ color: 'white' }}>Stripe</strong>. La Falla nunca almacena los
          datos de tu tarjeta: Stripe los trata directamente como entidad de pago certificada PCI-DSS.
        </P>

        <H2>6. Con quién se comparten</H2>
        <P>
          <strong style={{ color: 'white' }}>No cedemos ni vendemos tus datos a terceros con fines comerciales ni publicitarios.</strong> Sólo
          acceden a ellos los proveedores tecnológicos imprescindibles para que la app funcione (Google Firebase para el almacenamiento y las
          notificaciones, Stripe para los cobros y Vercel para el alojamiento), siempre en calidad de encargados del tratamiento, y las
          autoridades cuando una obligación legal lo exija.
        </P>
        <P>
          Dentro de la app, el resto de falleros sólo puede ver tu nombre, apellidos y número de fallero en el buscador de acompañantes,
          y las personas que tú mismo vincules como familia pueden ver tu ficha para gestionar inscripciones conjuntas.
        </P>

        <H2>7. Conservación</H2>
        <P>
          Conservamos los datos mientras seas miembro de la Falla y, tras la baja, durante los plazos necesarios para atender
          responsabilidades legales o contables (en particular, los justificantes de pago). Después se eliminan o anonimizan.
        </P>

        <H2>8. Tus derechos</H2>
        <P>
          Puedes ejercer en cualquier momento tus derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad.
          En particular, <strong style={{ color: 'white' }}>tienes derecho a solicitar la eliminación completa de tu cuenta y de tus datos</strong>{' '}
          escribiendo a{' '}
          <a href={`mailto:${CONTACT_EMAIL}?subject=Solicitud%20de%20eliminaci%C3%B3n%20de%20datos%20(app%20JCB%20Falla)`} style={{ color: GOLD, textDecoration: 'none' }}>{CONTACT_EMAIL}</a>{' '}
          desde el correo con el que te registraste, o dirigiéndote a cualquier miembro de la directiva. Atenderemos la solicitud en un plazo
          máximo de un mes. Si consideras que no hemos tratado tus datos correctamente, puedes reclamar ante la Agencia Española de Protección
          de Datos (<a href="https://www.aepd.es" target="_blank" rel="noreferrer" style={{ color: GOLD, textDecoration: 'none' }}>www.aepd.es</a>).
        </P>

        <H2>9. Menores</H2>
        <P>
          La app está dirigida a personas mayores de 14 años. Los datos de los falleros infantiles (nombre y fecha de nacimiento) los
          registran sus padres, madres o tutores, que son quienes gestionan sus inscripciones.
        </P>

        <H2>10. Cambios en esta política</H2>
        <P>
          Si modificamos esta política, publicaremos la nueva versión en esta misma dirección y, cuando el cambio sea relevante, lo
          comunicaremos mediante un aviso en la app.
        </P>

        <p style={{ marginTop: '1.75rem', marginBottom: 0, textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: '0.65rem', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Falla Joaquín Costa · Burriana · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
