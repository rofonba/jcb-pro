import { useState, useEffect } from 'react'
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import Countdown from './Countdown'
import EventList from './EventList'
import Profile from './Profile'
import {
  Bell, Users, CalendarDays, Newspaper,
  Home, User, Flame, ChevronRight,
} from 'lucide-react'

const GOLD = '#D4AF37'
const RED  = '#CE1126'
const CARD = '#141414'

// ─── Announcement feed card ───────────────────────────────────────────────────
function AnnouncementCard({ ann }) {
  const date = ann.createdAt?.toDate?.()
    ? ann.createdAt.toDate().toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
    : '—'

  return (
    <div style={{
      background: CARD,
      border: `1px solid ${ann.importante ? 'rgba(206,17,38,0.35)' : 'rgba(212,175,55,0.1)'}`,
      borderRadius: '14px', padding: '0.85rem 1rem',
      marginBottom: '0.65rem',
      borderLeft: ann.importante ? `3px solid ${RED}` : `3px solid rgba(212,175,55,0.3)`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.3rem' }}>
        <span style={{ fontSize: '0.6rem', fontWeight: '800', letterSpacing: '0.1em', textTransform: 'uppercase', color: ann.importante ? '#ff8080' : 'rgba(212,175,55,0.7)' }}>
          {ann.importante ? '⚡ IMPORTANTE' : ann.categoria?.toUpperCase() || 'AVISO'}
        </span>
        <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.25)', whiteSpace: 'nowrap', flexShrink: 0 }}>{date}</span>
      </div>
      <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: '600', color: 'white', lineHeight: 1.35 }}>
        {ann.titulo}
      </p>
      {ann.cuerpo && (
        <p style={{ margin: '0.3rem 0 0', fontSize: '0.76rem', color: 'rgba(255,255,255,0.45)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {ann.cuerpo}
        </p>
      )}
    </div>
  )
}

// ─── Quick Access tile ────────────────────────────────────────────────────────
function QuickTile({ emoji, label, color, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        background: CARD,
        border: `1px solid rgba(212,175,55,0.12)`,
        borderRadius: '18px',
        padding: '1.1rem 0.5rem',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem',
        cursor: 'pointer', minHeight: 'auto',
        transition: 'border-color 0.15s, transform 0.12s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(212,175,55,0.35)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(212,175,55,0.12)'; e.currentTarget.style.transform = 'translateY(0)' }}
      onTouchStart={e => { e.currentTarget.style.borderColor = 'rgba(212,175,55,0.35)' }}
      onTouchEnd={e => { e.currentTarget.style.borderColor = 'rgba(212,175,55,0.12)' }}
    >
      <div style={{
        width: '48px', height: '48px',
        background: `${color}18`,
        border: `1px solid ${color}30`,
        borderRadius: '14px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1.5rem',
      }}>
        {emoji}
      </div>
      <span style={{
        fontSize: '0.7rem', fontWeight: '700', color: 'rgba(255,255,255,0.7)',
        textAlign: 'center', lineHeight: 1.2, letterSpacing: '0.02em',
      }}>
        {label}
      </span>
    </button>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton({ h = 70 }) {
  return (
    <div style={{ background: '#1a1a1a', borderRadius: '14px', height: h, marginBottom: '0.65rem', animation: 'falla-pulse 1.6s ease-in-out infinite' }} />
  )
}

// ─── Bottom nav ───────────────────────────────────────────────────────────────
const NAV = [
  { key: 'home',     Icon: Home,         label: 'Inicio' },
  { key: 'eventos',  Icon: CalendarDays, label: 'Eventos' },
  { key: 'noticias', Icon: Newspaper,    label: 'Noticias' },
  { key: 'falleros', Icon: Users,        label: 'Falleros' },
  { key: 'perfil',   Icon: User,         label: 'Perfil' },
]

function BottomNav({ active, onChange }) {
  return (
    <nav style={{
      background: 'rgba(10,10,10,0.97)',
      backdropFilter: 'blur(24px)',
      borderTop: `1px solid rgba(212,175,55,0.1)`,
      padding: `0.5rem 0 calc(0.5rem + env(safe-area-inset-bottom))`,
      display: 'flex',
    }}>
      {NAV.map(({ key, Icon, label }) => {
        const isActive = active === key
        return (
          <button key={key} onClick={() => onChange(key)} style={{
            flex: 1, background: 'none', border: 'none',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem',
            padding: '0.5rem 0.25rem',
            color: isActive ? GOLD : 'rgba(255,255,255,0.28)',
            minHeight: 'auto', transition: 'color 0.2s ease',
          }}>
            <div
              key={isActive ? `${key}-on` : `${key}-off`}
              style={{ animation: isActive ? 'falla-navPop 0.32s ease-out' : 'none' }}
            >
              <Icon size={20} strokeWidth={isActive ? 2.2 : 1.6} />
            </div>
            <span style={{ fontSize: '0.6rem', fontWeight: isActive ? '700' : '400', letterSpacing: '0.02em', transition: 'font-weight 0.15s' }}>
              {label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}

// ─── Coming soon ─────────────────────────────────────────────────────────────
function ComingSoon({ emoji, label }) {
  return (
    <div style={{ textAlign: 'center', padding: '4rem 1.5rem', background: '#141414', border: '1px dashed rgba(212,175,55,0.12)', borderRadius: '18px' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>{emoji}</div>
      <h3 style={{ margin: '0 0 0.4rem', fontSize: '1rem', fontWeight: '700', color: 'rgba(255,255,255,0.55)' }}>{label}</h3>
      <p style={{ margin: 0, fontSize: '0.8rem', color: 'rgba(255,255,255,0.22)' }}>Próximamente disponible</p>
    </div>
  )
}

// ─── Home tab ────────────────────────────────────────────────────────────────
function HomeTab({ nombre, numFallero, announcements, loadingAnns, onNavigate }) {
  return (
    <>
      {/* Welcome */}
      <div style={{ marginBottom: '1.5rem' }}>
        <p style={{ margin: 0, color: 'rgba(255,255,255,0.35)', fontSize: '0.82rem' }}>
          Benvingut 👋
        </p>
        <h2 style={{ margin: '0.15rem 0 0.5rem', fontSize: '1.5rem', fontWeight: '900', lineHeight: 1.15 }}>
          {nombre}
        </h2>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
          padding: '0.22rem 0.7rem',
          background: 'rgba(212,175,55,0.1)',
          border: '1px solid rgba(212,175,55,0.25)',
          borderRadius: '100px',
        }}>
          <Flame size={10} color={GOLD} fill={GOLD} />
          <span style={{ fontSize: '0.68rem', color: GOLD, fontWeight: '700', letterSpacing: '0.06em' }}>
            Nº FALLERO {String(numFallero).padStart(3, '0')}
          </span>
        </span>
      </div>

      {/* Countdown hero */}
      <div style={{ marginBottom: '1.5rem' }}>
        <Countdown />
      </div>

      {/* Acceso rápido */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.78rem', fontWeight: '700', color: 'rgba(255,255,255,0.55)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Acceso Rápido
        </h3>
        <div style={{ display: 'flex', gap: '0.65rem' }}>
          <QuickTile emoji="🗓️" label="Apuntarse a Eventos"  color={RED}  onClick={() => onNavigate('eventos')}  />
          <QuickTile emoji="👥" label="Ver Censo"           color={GOLD} onClick={() => onNavigate('falleros')} />
          <QuickTile emoji="📢" label="Noticias"            color="#6366f1" onClick={() => onNavigate('noticias')} />
        </div>
      </div>

      {/* Announcement feed */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '0.78rem', fontWeight: '700', color: 'rgba(255,255,255,0.55)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Últimos avisos
          </h3>
          <button
            onClick={() => onNavigate('noticias')}
            style={{ background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: '0.2rem', color: GOLD, fontSize: '0.75rem', fontWeight: '600', minHeight: 'auto', minWidth: 'auto', cursor: 'pointer', padding: 0 }}
          >
            Ver todos <ChevronRight size={14} />
          </button>
        </div>

        {loadingAnns ? (
          <>{[1, 2, 3].map(i => <Skeleton key={i} />)}</>
        ) : announcements.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem 1rem', background: '#141414', border: '1px dashed rgba(212,175,55,0.1)', borderRadius: '14px' }}>
            <Newspaper size={28} color="rgba(255,255,255,0.12)" style={{ margin: '0 auto 0.6rem', display: 'block' }} />
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.22)', fontSize: '0.82rem' }}>
              Sin avisos recientes
            </p>
          </div>
        ) : (
          announcements.map(ann => <AnnouncementCard key={ann.id} ann={ann} />)
        )}
      </div>
    </>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user, fallero } = useAuth()
  const [announcements, setAnnouncements] = useState([])
  const [loadingAnns, setLoadingAnns]     = useState(true)
  const [activeTab, setActiveTab]         = useState('home')

  // Real-time announcements feed
  useEffect(() => {
    const q = query(collection(db, 'anuncios'), orderBy('createdAt', 'desc'), limit(5))
    const unsub = onSnapshot(q,
      snap => { setAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoadingAnns(false) },
      () => setLoadingAnns(false),
    )
    return unsub
  }, [])

  const nombre     = fallero ? `${fallero.nombre} ${fallero.apellidos}` : user?.displayName || user?.email?.split('@')[0] || 'Fallero'
  const numFallero = fallero?.numero ?? '—'

  return (
    <div style={{ minHeight: '100dvh', background: '#0a0a0a', color: 'white', display: 'flex', flexDirection: 'column' }}>
      {/* Top luxury line */}
      <div style={{ height: '2px', background: `linear-gradient(90deg, transparent, ${GOLD}, #F5D06A, ${GOLD}, transparent)` }} />

      {/* Header */}
      <header style={{
        padding: '0.85rem 1.25rem',
        background: 'rgba(10,10,10,0.92)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(212,175,55,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div style={{
            width: '36px', height: '36px',
            background: `linear-gradient(145deg, ${GOLD} 0%, ${RED} 70%)`,
            borderRadius: '10px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1rem',
            boxShadow: `0 2px 12px rgba(206,17,38,0.45)`,
          }}>
            🔥
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: '900', color: GOLD, lineHeight: 1, letterSpacing: '0.02em' }}>
              Falla Joaquín Costa
            </div>
            <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.22em', textTransform: 'uppercase' }}>
              Burriana
            </div>
          </div>
        </div>
        <button
          onClick={() => setActiveTab('perfil')}
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(212,175,55,0.15)',
            borderRadius: '10px', padding: '0.45rem',
            color: activeTab === 'perfil' ? GOLD : 'rgba(255,255,255,0.4)',
            display: 'flex', alignItems: 'center',
            minHeight: 'auto', minWidth: 'auto',
          }}
        >
          <Bell size={17} />
        </button>
      </header>

      {/* Content */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }}>
        {activeTab === 'home' && (
          <HomeTab
            nombre={nombre}
            numFallero={numFallero}
            announcements={announcements}
            loadingAnns={loadingAnns}
            onNavigate={setActiveTab}
          />
        )}
        {activeTab === 'eventos'  && <EventList />}
        {activeTab === 'noticias' && <ComingSoon emoji="📢" label="Noticias" />}
        {activeTab === 'falleros' && <ComingSoon emoji="👥" label="Directorio de Falleros" />}
        {activeTab === 'perfil'   && <Profile />}
      </main>

      <BottomNav active={activeTab} onChange={setActiveTab} />
    </div>
  )
}
