import { useState, useEffect, useMemo } from 'react'
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import CalendarView from './CalendarView'
import Profile from './Profile'
import Navigation from './Navigation'
import AdminMetrics from './AdminMetrics'
import { Bell, Flame, Shield } from 'lucide-react'

const LAST_READ_KEY = 'jcb_last_read_avisos'
const getLastRead   = () => parseInt(localStorage.getItem(LAST_READ_KEY) || '0', 10)
const markAvisosRead = () => localStorage.setItem(LAST_READ_KEY, Date.now().toString())

const GOLD  = '#D4AF37'
const BG    = '#F9FAFB'
const WHITE = '#FFFFFF'
const TEXT  = '#111827'
const TEXT2 = '#6B7280'
const MUTED = '#9CA3AF'
const BORDER = '#F3F4F6'

// ─── Primitives ───────────────────────────────────────────────────────────────

function Card({ children, urgent = false, style = {} }) {
  return (
    <div style={{
      background: WHITE, borderRadius: 20, padding: '18px 20px',
      border: `1.5px solid ${urgent ? GOLD : BORDER}`,
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
      ...style,
    }}>
      {children}
    </div>
  )
}

function SkeletonCard({ height = 90 }) {
  return (
    <div style={{
      background: '#E5E7EB', borderRadius: 20, height,
      animation: 'falla-pulse 1.6s ease-in-out infinite',
    }} />
  )
}

function EmptyState({ icon, message }) {
  return (
    <div style={{ textAlign: 'center', padding: '52px 24px' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
      <p style={{ color: MUTED, fontSize: 14, margin: 0 }}>{message}</p>
    </div>
  )
}

function GridButton({ icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: WHITE, border: `1.5px solid ${BORDER}`, borderRadius: 24,
        padding: '28px 16px', display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 10, cursor: 'pointer',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        transition: 'transform 0.12s, box-shadow 0.12s', minHeight: 'auto',
      }}
      onTouchStart={e => { e.currentTarget.style.transform = 'scale(0.95)'; e.currentTarget.style.boxShadow = `0 0 0 2px ${GOLD}50` }}
      onTouchEnd={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)' }}
    >
      <span style={{ fontSize: 32 }}>{icon}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>{label}</span>
    </button>
  )
}

// ─── Mini Countdown ───────────────────────────────────────────────────────────

const PLANTA = new Date('2027-03-14T20:00:00')
function getDaysLeft() { return Math.max(0, Math.floor((PLANTA - new Date()) / 86400000)) }

function MiniCountdown() {
  const [days, setDays] = useState(getDaysLeft)
  useEffect(() => {
    const id = setInterval(() => setDays(getDaysLeft()), 60000)
    return () => clearInterval(id)
  }, [])
  return (
    <Card>
      <div style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 12 }}>
          <Flame size={12} color={GOLD} fill={GOLD} />
          <span style={{ fontSize: 10, fontWeight: 700, color: GOLD, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
            Fallas 2027 · Burriana
          </span>
          <Flame size={12} color={GOLD} fill={GOLD} />
        </div>
        <div style={{ fontSize: 68, fontWeight: 900, lineHeight: 1, letterSpacing: '-0.04em', color: GOLD }}>
          {days}
        </div>
        <div style={{ fontSize: 14, color: TEXT2, marginTop: 8, fontWeight: 500 }}>
          {days === 1 ? 'día restante' : 'días restantes para Fallas'}
        </div>
        <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>
          La Plantà · 14 de marzo · 20:00 h
        </div>
      </div>
    </Card>
  )
}

// ─── Announcement card ────────────────────────────────────────────────────────

function AnnCard({ ann }) {
  const isUrgent = ann.esUrgente || ann.importante
  const date = ann.createdAt?.toDate?.()
    ? ann.createdAt.toDate().toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
    : null
  return (
    <Card urgent={isUrgent}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: TEXT, margin: 0, flex: 1, lineHeight: 1.35 }}>
          {ann.titulo}
        </h3>
        {isUrgent && (
          <span style={{
            background: GOLD, color: '#fff', fontSize: 9, fontWeight: 800,
            padding: '3px 8px', borderRadius: 20, flexShrink: 0, letterSpacing: '0.05em',
          }}>
            URGENTE
          </span>
        )}
      </div>
      {ann.cuerpo && (
        <p style={{
          fontSize: 13, color: TEXT2, margin: '0 0 8px',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {ann.cuerpo}
        </p>
      )}
      {date && <p style={{ fontSize: 11, color: MUTED, margin: 0 }}>{date}</p>}
    </Card>
  )
}

// ─── Admin shortcuts ──────────────────────────────────────────────────────────

function AdminShortcuts({ onNavigate, onMetrics }) {
  const shortcuts = [
    { icon: '➕', label: 'Crear Evento', action: () => onNavigate('calendario') },
    { icon: '📋', label: 'Inscritos',    action: () => onNavigate('perfil')     },
    { icon: '📊', label: 'Métricas',     action: onMetrics                      },
  ]
  return (
    <div style={{
      background: `${GOLD}0c`,
      border: `1.5px solid ${GOLD}30`,
      borderRadius: 20, padding: '16px 20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Shield size={14} color={GOLD} />
        <span style={{ fontSize: 12, fontWeight: 700, color: GOLD, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Herramientas Admin
        </span>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        {shortcuts.map(({ icon, label, action }) => (
          <button
            key={label}
            onClick={action}
            style={{
              flex: 1, background: WHITE, border: `1.5px solid ${GOLD}30`,
              borderRadius: 14, padding: '12px 8px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              cursor: 'pointer', minHeight: 'auto',
              fontSize: 22, transition: 'border-color 0.15s',
            }}
            onTouchStart={e => e.currentTarget.style.borderColor = GOLD}
            onTouchEnd={e => e.currentTarget.style.borderColor = `${GOLD}30`}
          >
            <span>{icon}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: TEXT }}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Home Tab ─────────────────────────────────────────────────────────────────

function HomeTab({ nombre, numFallero, isAdmin, announcements, loadingAnns, onNavigate, onMetrics }) {
  const featuredAnn = useMemo(() =>
    announcements.find(a => a.esUrgente || a.importante) || announcements[0] || null,
  [announcements])

  const firstName = nombre.split(' ')[0]

  return (
    <div style={{ padding: '28px 20px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Greeting */}
      <div>
        <p style={{ fontSize: 13, color: TEXT2, margin: '0 0 5px' }}>
          {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <h1 style={{ fontSize: 30, fontWeight: 700, color: TEXT, margin: 0, lineHeight: 1.15 }}>
          ¡Hola, {firstName}! 👋
        </h1>
        {isAdmin && (
          <span style={{
            display: 'inline-block', marginTop: 10,
            background: `${GOLD}14`, border: `1.5px solid ${GOLD}40`,
            borderRadius: 20, padding: '3px 12px',
            fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: '0.08em',
          }}>
            👑 ADMIN · Nº {String(numFallero).padStart(3, '0')}
          </span>
        )}
      </div>

      {/* Featured announcement */}
      {loadingAnns
        ? <SkeletonCard height={104} />
        : featuredAnn && (
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: GOLD, letterSpacing: '0.14em', textTransform: 'uppercase', margin: '0 0 8px', paddingLeft: 4 }}>
              {(featuredAnn.esUrgente || featuredAnn.importante) ? '⚡ AVISO URGENTE' : '📌 AVISO DEL DÍA'}
            </p>
            <AnnCard ann={featuredAnn} />
          </div>
        )
      }

      {/* Quick access 2×2 */}
      <div>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TEXT, margin: '0 0 14px', letterSpacing: '-0.01em' }}>
          Acceso Rápido
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <GridButton icon="📅" label="Calendario"  onClick={() => onNavigate('calendario')} />
          <GridButton icon="📢" label="Avisos"      onClick={() => onNavigate('avisos')} />
          <GridButton icon="📝" label="Apuntarse"   onClick={() => onNavigate('calendario')} />
          <GridButton icon="👤" label="Mi Perfil"   onClick={() => onNavigate('perfil')} />
        </div>
      </div>

      {/* Admin shortcuts */}
      {isAdmin && <AdminShortcuts onNavigate={onNavigate} onMetrics={onMetrics} />}

      {/* Countdown */}
      <MiniCountdown />
    </div>
  )
}

// ─── Avisos Tab ───────────────────────────────────────────────────────────────

function AvisosTab({ announcements, loading }) {
  return (
    <div style={{ padding: '24px 20px' }}>
      <h2 style={{ fontSize: 26, fontWeight: 700, color: TEXT, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Avisos</h2>
      <p style={{ fontSize: 13, color: TEXT2, margin: '0 0 20px' }}>Comunicaciones de la Falla</p>
      {loading
        ? <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{[1,2,3].map(i => <SkeletonCard key={i} />)}</div>
        : announcements.length === 0
          ? <EmptyState icon="📭" message="Sin avisos recientes" />
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {announcements.map(a => <AnnCard key={a.id} ann={a} />)}
            </div>
      }
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user, fallero } = useAuth()
  const [announcements, setAnnouncements] = useState([])
  const [loadingAnns, setLoadingAnns]     = useState(true)
  const [activeTab, setActiveTab]         = useState('home')
  const [lastReadTs, setLastReadTs]       = useState(getLastRead)
  const [showMetrics, setShowMetrics]     = useState(false)

  useEffect(() => {
    const q = query(collection(db, 'anuncios'), orderBy('createdAt', 'desc'), limit(10))
    return onSnapshot(q,
      snap => { setAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoadingAnns(false) },
      () => setLoadingAnns(false),
    )
  }, [])

  const handleTabChange = (tab) => {
    if (tab === 'avisos') {
      markAvisosRead()
      setLastReadTs(Date.now())
    }
    setActiveTab(tab)
  }

  const nombre     = fallero ? `${fallero.nombre}${fallero.apellidos ? ' ' + fallero.apellidos : ''}` : user?.displayName || user?.email?.split('@')[0] || 'Fallero'
  const numFallero = fallero?.numero ?? '—'
  const isAdmin    = fallero?.rol === 'admin'

  const unreadCount = useMemo(() =>
    announcements.filter(a => (a.createdAt?.toMillis?.() ?? 0) > lastReadTs).length,
  [announcements, lastReadTs])

  return (
    <div style={{
      minHeight: '100dvh', background: BG, color: TEXT,
      display: 'flex', flexDirection: 'column',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>

      {/* Header */}
      <header style={{
        padding: '12px 20px',
        background: 'rgba(249,250,251,0.96)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${BORDER}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 50, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, background: GOLD, borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Flame size={18} color="white" strokeWidth={2.2} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: TEXT, lineHeight: 1, letterSpacing: '-0.01em' }}>
              Falla Joaquín Costa
            </div>
            <div style={{ fontSize: 10, color: MUTED, letterSpacing: '0.18em', textTransform: 'uppercase', marginTop: 2 }}>
              Burriana
            </div>
          </div>
        </div>
        <button
          onClick={() => handleTabChange('avisos')}
          style={{
            background: activeTab === 'avisos' ? `${GOLD}14` : 'transparent',
            border: `1.5px solid ${activeTab === 'avisos' ? `${GOLD}55` : BORDER}`,
            borderRadius: 10, padding: '8px',
            color: activeTab === 'avisos' ? GOLD : MUTED,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            minHeight: 'auto', minWidth: 'auto', position: 'relative',
            transition: 'all 0.2s', cursor: 'pointer',
          }}
        >
          <Bell size={17} />
          {unreadCount > 0 && activeTab !== 'avisos' && (
            <span style={{
              position: 'absolute', top: -4, right: -4,
              background: GOLD, borderRadius: '100%',
              minWidth: 16, height: 16, padding: '0 3px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `2px solid ${BG}`,
              fontSize: 9, fontWeight: 800, color: 'white',
            }}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </header>

      {/* Content */}
      <main style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain' }}>
        {activeTab === 'home'       && (
          <HomeTab
            nombre={nombre}
            numFallero={numFallero}
            isAdmin={isAdmin}
            announcements={announcements}
            loadingAnns={loadingAnns}
            onNavigate={handleTabChange}
            onMetrics={() => setShowMetrics(true)}
          />
        )}
        {activeTab === 'calendario' && <CalendarView />}
        {activeTab === 'avisos'     && <AvisosTab announcements={announcements} loading={loadingAnns} />}
        {activeTab === 'perfil'     && <Profile />}
      </main>

      <Navigation active={activeTab} onChange={handleTabChange} unreadAvisos={unreadCount} />

      {showMetrics && isAdmin && (
        <AdminMetrics onClose={() => setShowMetrics(false)} />
      )}
    </div>
  )
}
