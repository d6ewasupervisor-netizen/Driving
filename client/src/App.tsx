import { AuthProvider, useAuth } from '@/lib/authContext'
import { useState } from 'react'
import ZombieRoadWarrior from '@/components/ZombieRoadWarrior'
import { useGameStore } from '@/stores/gameStore'

type AppView = 'dashboard' | 'game'

function LoginForm() {
  const { signIn, error } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await signIn(email, password)
    } catch {
      // Error handled by context
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ 
      maxWidth: 420, 
      margin: '80px auto', 
      padding: 40,
      background: 'rgba(22, 33, 62, 0.8)',
      borderRadius: 16,
      boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
    }}>
      <h1>🧟 Ali's Aigoo Apocalypse</h1>
      <h2>Survivor Login</h2>
      {error && <p style={{ color: '#ff6b6b', background: 'rgba(255,107,107,0.1)', padding: 10, borderRadius: 8 }}>{error}</p>}
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
        <div style={{ marginBottom: 20 }}>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
        <button type="submit" disabled={loading} style={{ width: '100%', padding: '14px 20px' }}>
          {loading ? '🔄 Signing in...' : '🚗 Start Driving'}
        </button>
      </form>
      <p style={{ marginTop: 24, fontSize: 13, color: '#888', textAlign: 'center' }}>
        Test: ali@aigoo.game / ZombieDriver2024!
      </p>
    </div>
  )
}

function Dashboard({ onPlayGame }: { onPlayGame: () => void }) {
  const { user, signOut } = useAuth()

  return (
    <div style={{ 
      maxWidth: 600, 
      margin: '50px auto', 
      padding: 40,
      background: 'rgba(22, 33, 62, 0.8)',
      borderRadius: 16,
      boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
    }}>
      <h1>🧟 Ali's Aigoo Apocalypse</h1>
      <h2>Welcome back, {user?.displayName}!</h2>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <span style={{ 
          background: user?.role === 'player' ? '#e94560' : '#4ecdc4', 
          padding: '4px 12px', 
          borderRadius: 20,
          fontSize: 14
        }}>
          {user?.role === 'player' ? '🎮 Player' : '👁️ Parent'}
        </span>
      </div>
      
      {/* Play Game Button - prominently displayed */}
      {user?.role === 'player' && (
        <button 
          onClick={onPlayGame}
          style={{ 
            width: '100%',
            padding: '20px 30px', 
            fontSize: 18,
            fontWeight: 'bold',
            background: 'linear-gradient(135deg, #EC4899 0%, #FFB6C1 100%)',
            border: '3px solid #000',
            borderRadius: 12,
            cursor: 'pointer',
            boxShadow: '4px 4px 0 #000',
            marginBottom: 20
          }}
        >
          🚗 PLAY K-POP ROAD WARRIOR
        </button>
      )}
      
      {user?.customClaims?.journey && (
        <div style={{ 
          marginTop: 20, 
          padding: 20, 
          background: 'rgba(233, 69, 96, 0.1)', 
          borderRadius: 12,
          border: '1px solid rgba(233, 69, 96, 0.3)'
        }}>
          <h3 style={{ margin: '0 0 15px 0', color: '#e94560' }}>🗺️ Your Journey</h3>
          <p style={{ margin: '8px 0' }}>📍 From: <strong>{user.customClaims.journey.startLocation}</strong></p>
          <p style={{ margin: '8px 0' }}>🏁 To: <strong>{user.customClaims.journey.destination}</strong></p>
          <p style={{ margin: '8px 0' }}>🛣️ Total: <strong>{user.customClaims.journey.totalMiles} miles</strong></p>
        </div>
      )}
      <button onClick={signOut} style={{ marginTop: 30, padding: '14px 30px' }}>
        🚪 Sign Out
      </button>
    </div>
  )
}

function AppContent() {
  const { isAuthenticated, loading, user } = useAuth()
  const [view, setView] = useState<AppView>('dashboard')

  if (loading) {
    return <div style={{ textAlign: 'center', marginTop: 100 }}>Loading...</div>
  }

  if (!isAuthenticated) {
    return <LoginForm />
  }

  // If playing the game, show the game fullscreen
  if (view === 'game' && user?.role === 'player') {
    return <ZombieRoadWarrior onExit={() => setView('dashboard')} />
  }

  return <Dashboard onPlayGame={() => {
    useGameStore.getState().setPhase('driving')
    setView('game')
  }} />
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
