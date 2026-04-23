import { Home, CalendarDays, Bell, BarChart2, User } from 'lucide-react'

const GOLD = '#D4AF37'

const NAV = [
  { key: 'home',        Icon: Home,        label: 'Inicio'    },
  { key: 'calendario',  Icon: CalendarDays, label: 'Calendario' },
  { key: 'avisos',      Icon: Bell,        label: 'Avisos'    },
  { key: 'votaciones',  Icon: BarChart2,   label: 'Votos'     },
  { key: 'perfil',      Icon: User,        label: 'Perfil'    },
]

const INACTIVE = 'rgba(255,255,255,0.38)'

export default function Navigation({ active, onChange, unreadAvisos = 0 }) {
  return (
    <nav style={{
      background: 'rgba(30,41,59,0.97)',       /* slate-800 */
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      borderTop: '1px solid rgba(255,255,255,0.08)',
      padding: '0.5rem 0 calc(0.5rem + env(safe-area-inset-bottom))',
      display: 'flex',
      position: 'sticky',
      bottom: 0,
      zIndex: 50,
    }}>
      {NAV.map(({ key, Icon, label }) => {
        const isActive = active === key
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            style={{
              flex: 1, background: 'none', border: 'none',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem',
              padding: '0.5rem 0.25rem',
              color: isActive ? GOLD : INACTIVE,
              minHeight: 'auto', transition: 'color 0.2s ease',
              position: 'relative',
            }}
          >
            <div
              key={isActive ? `${key}-on` : `${key}-off`}
              style={{ animation: isActive ? 'falla-navPop 0.32s ease-out' : 'none', position: 'relative' }}
            >
              <Icon size={22} strokeWidth={isActive ? 2.2 : 1.6} />
              {key === 'avisos' && unreadAvisos > 0 && (
                <span style={{
                  position: 'absolute', top: '-4px', right: '-6px',
                  background: '#CE1126', color: 'white',
                  fontSize: '0.5rem', fontWeight: '800',
                  borderRadius: '100px', padding: '1px 4px',
                  minWidth: '14px', textAlign: 'center',
                  lineHeight: 1.4,
                  boxShadow: '0 0 0 1.5px rgba(30,41,59,0.97)',   /* badge pop on dark bg */
                }}>
                  {unreadAvisos > 9 ? '9+' : unreadAvisos}
                </span>
              )}
            </div>
            <span style={{
              fontSize: '0.6rem',
              fontWeight: isActive ? '700' : '400',
              letterSpacing: '0.02em',
              transition: 'font-weight 0.15s',
            }}>
              {label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
