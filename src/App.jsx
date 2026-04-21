import { useAuth } from './contexts/AuthContext'
import Login from './components/Login'
import Dashboard from './components/Dashboard'

function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(150deg, #080818, #1c0509)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: '44px', height: '44px',
        border: '3px solid rgba(201,168,76,0.15)',
        borderTopColor: '#C9A84C',
        borderRadius: '50%',
        animation: 'falla-spin 0.75s linear infinite',
      }} />
    </div>
  )
}

export default function App() {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  return user ? <Dashboard /> : <Login />
}
