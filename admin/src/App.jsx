import { useEffect, useState } from 'react'
import './index.css'
import Admin from './Pages/Admin.jsx'
import Login from './Pages/Login.jsx'
import { support } from './api'

function App() {
  const [authed, setAuthed] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    support.me()
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false))
      .finally(() => setChecking(false))
  }, [])

  const handleLogout = async () => {
    await support.logout().catch(() => {})
    setAuthed(false)
  }

  if (checking) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
        Loading…
      </div>
    )
  }

  return authed
    ? <Admin onLogout={handleLogout} />
    : <Login onSuccess={() => setAuthed(true)} />
}

export default App
