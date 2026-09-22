import { useEffect, useState } from 'react'
import './index.css'
import Shell from './components/Shell.jsx'
import Admin from './Pages/Admin.jsx'
import Venues from './Pages/Venues.jsx'
import Transfer from './Pages/Transfer.jsx'
import VenueAnalytics from './Pages/VenueAnalytics.jsx'
import Login from './Pages/Login.jsx'
import { support } from './api'

function App() {
  const [authed, setAuthed] = useState(false)
  const [checking, setChecking] = useState(true)
  // No router in this app — one string decides which page Shell wraps.
  const [page, setPage] = useState('restaurants')
  // Non-null means the Places tab is showing one place's analytics instead of
  // the list. Kept here rather than inside Venues so switching tabs in the
  // sidebar always lands on the list, never a stale analytics view.
  const [analyticsVenueId, setAnalyticsVenueId] = useState(null)

  useEffect(() => {
    support.me()
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false))
      .finally(() => setChecking(false))
  }, [])

  const handleLogout = async () => {
    await support.logout().catch(() => {})
    setAuthed(false)
    // Next sign-in starts on the default page rather than wherever the previous
    // session happened to leave off.
    setPage('restaurants')
  }

  if (checking) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
        Loading…
      </div>
    )
  }

  if (!authed) return <Login onSuccess={() => setAuthed(true)} />

  const navigate = (next) => { setAnalyticsVenueId(null); setPage(next) }

  return (
    <Shell page={page} onNavigate={navigate} onLogout={handleLogout}>
      {page === 'places'
        ? (analyticsVenueId
          ? <VenueAnalytics venueId={analyticsVenueId} onBack={() => setAnalyticsVenueId(null)} />
          : <Venues onOpenAnalytics={setAnalyticsVenueId} />)
        : page === 'transfer'
          ? <Transfer />
          : <Admin />}
    </Shell>
  )
}

export default App
