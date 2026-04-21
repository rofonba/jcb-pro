import { useState, useEffect, useMemo } from 'react'
import {
  collection, query, orderBy, limit, onSnapshot, where, Timestamp,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import Countdown from './Countdown'
import EventList from './EventList'
import Profile from './Profile'
import Navigation from './Navigation'
import {
  Bell, CalendarDays, Newspaper, ChevronRight,
  Flame, MapPin, ClipboardList, Users,
} from 'lucide-react'

const GOLD  = '#D4AF37'
const RED   = '#CE1126'
const CARD  = '#141414'
const CARD2 = '#1a1a1a'

const EVENT_TYPES = {
  comida:  { emoji: '🍽️', color: GOLD    },
  cena:    { emoji: '🌙', color: '#6366f1' },
  acto:    { emoji: '🎭', color: RED      },
  reunion: { emoji: '📋', color: '#6B7280' },
  otro:    { emoji: '📌', color: '#10b981' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtShort(f) {
  if (!f) return '—'
  const d = f?.toDate ? f.toDate() : new Date(f)
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
}
function fmtTime(f) {
  if (!f) return ''
  const d = f?.toDate ? f.toDate() : new Date(f)
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton({ h = 70, mb = '0.65rem' }) {
  return (
    <div style={{
      background: CARD2, borderRadius: '14px', height: h, marginBottom: mb,
      animation: 'falla-pulse 1.6s ease-in-out infinite',
    }} />
  )
}

// ─── Announcement card ────────────────────────────────────────────────────────
function AnnouncementCard({ ann, compact = false }) {
  const isUrgent = ann.esUrgente || ann.importante
  const date = ann.createdAt?.toDate?.()
    ? ann.createdAt.toDate().toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
    : '—'

  return (
    <div style={{
      background: isUrgent ? 'rgba(206,17,38,0.08)' : CARD,
      border: `1px solid ${isUrgent ? 'rgba(206,17,38,0.3)' : 'rgba(212,175,55,0.1)'}`,
      borderLeft: `3px solid ${isUrgent ? RED : 'rgba(212,175,55,0.3)'}`,
      borderRadius: '14px', padding: compact ? '0.7rem 0.9rem' : '0.85rem 1rem',
      marginBottom: '0.65rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.25rem' }}>
        <span style={{ fontSize: '0.58rem', fontWeight: '800', letterSpacing: '0.1em', textTransform: 'uppercase', color: isUrgent ? '#ff8080' : 'rgba(212,175,55,0.7)' }}>
          {isUrgent ? '⚡ URGENTE' : ann.categoria?.toUpperCase() || 'AVISO'}
        </span>
        <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.22)', whiteSpace: 'nowrap', flexShrink: 0 }}>{date}</span>
      </div>
      <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: '600', color: 'white', lineHeight: 1.35 }}>
        {ann.titulo}
      </p>
      {ann.cuerpo && !compact && (
        <p style={{ margin: '0.3rem 0 0', fontSize: '0.76rem', color: 'rgba(255,255,255,0.45)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {ann.cuerpo}
        </p>
      )}
    </div>
  )
}

// ─── Upcoming event mini-card (horizontal scroll) ────────────────────────────
function EventMiniCard({ event }) {
  const t = EVENT_TYPES[event.tipo] ?? EVENT_TYPES.otro
  return (
    <div className="jcb-event-mini-card" style={{
      minWidth: '150px', maxWidth: '150px',
      background: CARD,
      border: '1px solid rgba(212,175,55,0.12)',
      borderRadius: '16px', padding: '1rem 0.9rem',
      flexShrink: 0,
      cursor: 'pointer',
      transition: 'border-color 0.15s, transform 0.12s',
    }}>
      <div style={{
        width: '38px', height: '38px',
        background: `${t.color}18`,
        border: `1px solid ${t.color}28`,
        borderRadius: '11px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1.2rem', marginBottom: '0.6rem',
      }}>
        {t.emoji}
      </div>
      <p style={{ margin: '0 0 0.25rem', fontSize: '0.8rem', fontWeight: '700', color: 'white', lineHeight: 1.2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
        {event.titulo}
      </p>
      <p style={{ margin: 0, fontSize: '0.68rem', color: GOLD, fontWeight: '600' }}>
        {fmtShort(event.fecha)}
      </p>
      {event.ubicacion && (
        <p style={{ margin: '0.2rem 0 0', fontSize: '0.62rem', color: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
          <MapPin size={9} /> {event.ubicacion}
        </p>
      )}
    </div>
  )
}

// ─── Section title ────────────────────────────────────────────────────────────
function SectionTitle({ children, action, onAction }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
      <h3 style={{ margin: 0, fontSize: '0.72rem', fontWeight: '800', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
        {children}
      </h3>
      {action && (
        <button onClick={onAction} style={{
          background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: '0.2rem',
          color: GOLD, fontSize: '0.72rem', fontWeight: '600',
          minHeight: 'auto', minWidth: 'auto', cursor: 'pointer', padding: 0,
        }}>
          {action} <ChevronRight size={13} />
        </button>
      )}
    </div>
  )
}

// ─── Quick access tile ────────────────────────────────────────────────────────
function QuickTile({ emoji, label, color, onClick }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, background: CARD,
      border: '1px solid rgba(212,175,55,0.1)',
      borderRadius: '16px', padding: '1rem 0.4rem',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.55rem',
      cursor: 'pointer', minHeight: 'auto',
      transition: 'border-color 0.15s, transform 0.12s',
    }}
      onTouchStart={e => { e.currentTarget.style.borderColor = 'rgba(212,175,55,0.35)'; e.currentTarget.style.transform = 'scale(0.97)' }}
      onTouchEnd={e => { e.currentTarget.style.borderColor = 'rgba(212,175,55,0.1)'; e.currentTarget.style.transform = 'scale(1)' }}
    >
      <div style={{
        width: '44px', height: '44px',
        background: `${color}18`, border: `1px solid ${color}28`,
        borderRadius: '13px',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem',
      }}>
        {emoji}
      </div>
      <span style={{ fontSize: '0.65rem', fontWeight: '700', color: 'rgba(255,255,255,0.65)', textAlign: 'center', lineHeight: 1.2, letterSpacing: '0.01em' }}>
        {label}
      </span>
    </button>
  )
}

// ─── ComingSoon ───────────────────────────────────────────────────────────────
function ComingSoon({ emoji, label }) {
  return (
    <div style={{ textAlign: 'center', padding: '4rem 1.5rem', background: CARD, border: '1px dashed rgba(212,175,55,0.12)', borderRadius: '18px' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>{emoji}</div>
      <h3 style={{ margin: '0 0 0.4rem', fontSize: '1rem', fontWeight: '700', color: 'rgba(255,255,255,0.5)' }}>{label}</h3>
      <p style={{ margin: 0, fontSize: '0.8rem', color: 'rgba(255,255,255,0.2)' }}>Próximamente disponible</p>
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ icon: Icon, text }) {
  return (
    <div style={{ textAlign: 'center', padding: '1.5rem', background: CARD, border: '1px dashed rgba(212,175,55,0.1)', borderRadius: '14px' }}>
      <Icon size={26} color="rgba(255,255,255,0.1)" style={{ margin: '0 auto 0.5rem', display: 'block' }} />
      <p style={{ margin: 0, color: 'rgba(255,255,255,0.2)', fontSize: '0.8rem' }}>{text}</p>
    </div>
  )
}

// ─── Avisos tab (full list) ───────────────────────────────────────────────────
function AvisosTab({ announcements, loading }) {
  return (
    <>
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: '900' }}>Avisos</h2>
        <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'rgba(255,255,255,0.35)' }}>Comunicaciones de la Falla</p>
      </div>
      {loading
        ? [1, 2, 3, 4].map(i => <Skeleton key={i} h={80} />)
        : announcements.length === 0
          ? <EmptyState icon={Newspaper} text="Sin avisos recientes" />
          : announcements.map(ann => <AnnouncementCard key={ann.id} ann={ann} />)
      }
    </>
  )
}

// ─── Inscripciones tab ────────────────────────────────────────────────────────
function InscripcionesTab({ onNavigate }) {
  return (
    <>
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: '900' }}>Inscripciones</h2>
        <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'rgba(255,255,255,0.35)' }}>Tus apuntados y los de tu familia</p>
      </div>
      <button
        onClick={() => onNavigate('eventos')}
        style={{
          width: '100%', padding: '1rem 1.25rem',
          background: `linear-gradient(135deg, ${RED} 0%, #8a0a1a 100%)`,
          border: 'none', borderRadius: '16px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.65rem',
          color: 'white', fontSize: '0.9rem', fontWeight: '700',
          cursor: 'pointer', marginBottom: '1.5rem',
          boxShadow: `0 6px 20px rgba(206,17,38,0.35)`,
        }}
      >
        <CalendarDays size={18} />
        Apuntarse a un Evento
      </button>
      <ComingSoon emoji="📋" label="Historial de inscripciones" />
    </>
  )
}

// ─── Home tab ─────────────────────────────────────────────────────────────────
function HomeTab({ nombre, numFallero, isAdmin, announcements, loadingAnns, upcomingEvents, loadingEvents, onNavigate }) {
  const featuredAnn = useMemo(() =>
    announcements.find(a => a.esUrgente || a.importante) || null,
  [announcements])

  const recentAnns = useMemo(() =>
    announcements.filter(a => a !== featuredAnn).slice(0, 3),
  [announcements, featuredAnn])

  return (
    <>
      {/* ── Welcome ── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <p style={{ margin: 0, color: 'rgba(255,255,255,0.32)', fontSize: '0.8rem' }}>Benvingut 👋</p>
        <h2 style={{ margin: '0.1rem 0 0.5rem', fontSize: '1.45rem', fontWeight: '900', lineHeight: 1.15 }}>
          {nombre}
          {isAdmin && (
            <span style={{ marginLeft: '0.5rem', fontSize: '0.65rem', fontWeight: '700', color: GOLD, background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.25)', borderRadius: '6px', padding: '0.15rem 0.45rem', verticalAlign: 'middle', letterSpacing: '0.06em' }}>
              👑 ADMIN
            </span>
          )}
        </h2>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
          padding: '0.2rem 0.65rem',
          background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)',
          borderRadius: '100px',
        }}>
          <Flame size={9} color={GOLD} fill={GOLD} />
          <span style={{ fontSize: '0.65rem', color: GOLD, fontWeight: '700', letterSpacing: '0.06em' }}>
            Nº FALLERO {String(numFallero).padStart(3, '0')}
          </span>
        </span>
      </div>

      {/* ── Aviso Destacado ── */}
      {featuredAnn && (
        <div style={{ marginBottom: '1.5rem' }}>
          <SectionTitle>⚡ Aviso Destacado</SectionTitle>
          <AnnouncementCard ann={featuredAnn} />
        </div>
      )}

      {/* ── Próximos Actos ── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <SectionTitle action="Ver agenda" onAction={() => onNavigate('eventos')}>
          Próximos Actos
        </SectionTitle>
        {loadingEvents ? (
          <div style={{ display: 'flex', gap: '0.65rem', overflowX: 'auto' }} className="jcb-hscroll">
            {[1, 2, 3].map(i => (
              <div key={i} style={{ minWidth: '150px', background: CARD2, borderRadius: '16px', height: '130px', flexShrink: 0, animation: 'falla-pulse 1.6s ease-in-out infinite' }} />
            ))}
          </div>
        ) : upcomingEvents.length === 0 ? (
          <EmptyState icon={CalendarDays} text="No hay actos próximos" />
        ) : (
          <div style={{ display: 'flex', gap: '0.65rem', overflowX: 'auto', paddingBottom: '0.25rem' }} className="jcb-hscroll">
            {upcomingEvents.map(ev => (
              <EventMiniCard key={ev.id} event={ev} />
            ))}
          </div>
        )}
      </div>

      {/* ── CTA Inscribirse ── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <button
          onClick={() => onNavigate('eventos')}
          className="btn-shimmer"
          style={{
            width: '100%', padding: '1rem 1.25rem',
            background: `linear-gradient(135deg, #CE1126 0%, #a00d1e 100%)`,
            border: 'none', borderRadius: '16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            color: 'white', cursor: 'pointer',
            boxShadow: '0 6px 24px rgba(206,17,38,0.35)',
            transition: 'transform 0.12s, box-shadow 0.12s',
          }}
          onTouchStart={e => { e.currentTarget.style.transform = 'scale(0.98)'; e.currentTarget.style.boxShadow = '0 3px 12px rgba(206,17,38,0.25)' }}
          onTouchEnd={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 6px 24px rgba(206,17,38,0.35)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '10px', width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CalendarDays size={18} />
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '0.92rem', fontWeight: '800', letterSpacing: '0.01em' }}>Apuntarse a un Evento</div>
              <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.6)', marginTop: '0.1rem' }}>Ver agenda completa</div>
            </div>
          </div>
          <ChevronRight size={20} style={{ opacity: 0.7 }} />
        </button>
      </div>

      {/* ── Cuenta Atrás ── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <Countdown />
      </div>

      {/* ── Acceso Rápido ── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <SectionTitle>Acceso Rápido</SectionTitle>
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <QuickTile emoji="📢" label="Avisos"         color="#6366f1"  onClick={() => onNavigate('avisos')}        />
          <QuickTile emoji="📋" label="Inscripciones" color={GOLD}     onClick={() => onNavigate('inscripciones')} />
          <QuickTile emoji="👤" label="Mi Perfil"     color="#10b981"  onClick={() => onNavigate('perfil')}        />
        </div>
      </div>

      {/* ── Últimos Avisos ── */}
      <div>
        <SectionTitle action="Ver todos" onAction={() => onNavigate('avisos')}>
          Últimos Avisos
        </SectionTitle>
        {loadingAnns
          ? [1, 2].map(i => <Skeleton key={i} />)
          : recentAnns.length === 0
            ? <EmptyState icon={Newspaper} text="Sin avisos recientes" />
            : recentAnns.map(ann => <AnnouncementCard key={ann.id} ann={ann} compact />)
        }
      </div>
    </>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user, fallero } = useAuth()
  const [announcements, setAnnouncements]   = useState([])
  const [loadingAnns, setLoadingAnns]       = useState(true)
  const [upcomingEvents, setUpcomingEvents] = useState([])
  const [loadingEvents, setLoadingEvents]   = useState(true)
  const [activeTab, setActiveTab]           = useState('home')

  // Real-time: últimos 10 avisos
  useEffect(() => {
    const q = query(collection(db, 'anuncios'), orderBy('createdAt', 'desc'), limit(10))
    return onSnapshot(q,
      snap => { setAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoadingAnns(false) },
      () => setLoadingAnns(false),
    )
  }, [])

  // Real-time: próximos 4 eventos (ordenados por fecha)
  useEffect(() => {
    const now = Timestamp.now()
    const q = query(
      collection(db, 'eventos'),
      where('fecha', '>=', now),
      orderBy('fecha'),
      limit(4),
    )
    return onSnapshot(q,
      snap => { setUpcomingEvents(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoadingEvents(false) },
      () => setLoadingEvents(false),
    )
  }, [])

  const nombre     = fallero ? `${fallero.nombre}${fallero.apellidos ? ' ' + fallero.apellidos : ''}` : user?.displayName || user?.email?.split('@')[0] || 'Fallero'
  const numFallero = fallero?.numero ?? '—'
  const isAdmin    = fallero?.rol === 'admin'
  const urgentCount = announcements.filter(a => a.esUrgente || a.importante).length

  return (
    <div style={{ minHeight: '100dvh', background: '#0a0a0a', color: 'white', display: 'flex', flexDirection: 'column' }}>

      {/* Top luxury line */}
      <div style={{ height: '2px', background: `linear-gradient(90deg, transparent, ${GOLD}, #F5D06A, ${GOLD}, transparent)`, flexShrink: 0 }} />

      {/* Header */}
      <header style={{
        padding: '0.8rem 1.25rem',
        background: 'rgba(10,10,10,0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(212,175,55,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 50, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{
            width: '34px', height: '34px',
            background: `linear-gradient(145deg, ${GOLD} 0%, ${RED} 70%)`,
            borderRadius: '9px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 2px 10px rgba(206,17,38,0.4)`,
          }}>
            <Flame size={17} color="white" strokeWidth={2} />
          </div>
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: '900', color: GOLD, lineHeight: 1, letterSpacing: '0.02em' }}>Falla Joaquín Costa</div>
            <div style={{ fontSize: '0.56rem', color: 'rgba(255,255,255,0.28)', letterSpacing: '0.22em', textTransform: 'uppercase' }}>Burriana</div>
          </div>
        </div>
        <button
          onClick={() => setActiveTab('avisos')}
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: `1px solid ${activeTab === 'avisos' ? 'rgba(212,175,55,0.4)' : 'rgba(212,175,55,0.12)'}`,
            borderRadius: '10px', padding: '0.4rem',
            color: activeTab === 'avisos' ? GOLD : 'rgba(255,255,255,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            minHeight: 'auto', minWidth: 'auto', position: 'relative',
            transition: 'color 0.2s, border-color 0.2s',
          }}
        >
          <Bell size={17} />
          {urgentCount > 0 && (
            <span style={{
              position: 'absolute', top: '-4px', right: '-4px',
              background: RED, width: '8px', height: '8px', borderRadius: '100%',
              border: '1.5px solid #0a0a0a',
            }} />
          )}
        </button>
      </header>

      {/* Content */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', overscrollBehavior: 'contain' }}>
        {activeTab === 'home' && (
          <HomeTab
            nombre={nombre}
            numFallero={numFallero}
            isAdmin={isAdmin}
            announcements={announcements}
            loadingAnns={loadingAnns}
            upcomingEvents={upcomingEvents}
            loadingEvents={loadingEvents}
            onNavigate={setActiveTab}
          />
        )}
        {activeTab === 'eventos'       && <EventList />}
        {activeTab === 'avisos'        && <AvisosTab announcements={announcements} loading={loadingAnns} />}
        {activeTab === 'inscripciones' && <InscripcionesTab onNavigate={setActiveTab} />}
        {activeTab === 'perfil'        && <Profile />}
      </main>

      <Navigation active={activeTab} onChange={setActiveTab} unreadAvisos={urgentCount} />
    </div>
  )
}
