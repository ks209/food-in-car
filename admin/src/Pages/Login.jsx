import React, { useState } from 'react'
import { support } from '../api'

const Login = ({ onSuccess }) => {
  const [details, setDetails] = useState({ username: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function handleChange(e) {
    setDetails((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const { username, password } = details
    if (!username || !password) { setError('Please fill in all fields'); return }
    setLoading(true)
    setError('')
    try {
      const res = await support.login(details)
      if (res.data.code === 200) {
        onSuccess?.()
      } else {
        setError('Invalid credentials')
      }
    } catch {
      setError('Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-shell">
      {/* Left panel */}
      <div className="login-left">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="logo-badge">F</div>
          <span style={{ color: 'var(--text)', fontWeight: 600, fontSize: 15 }}>FoodInCar Admin</span>
        </div>
        <div>
          <p className="login-tagline">
            Manage your restaurants with <strong>precision</strong> and ease.
          </p>
          <p className="login-footer" style={{ marginTop: 12 }}>Support portal · FoodInCar SaaS</p>
        </div>
        <div className="login-footer">© {new Date().getFullYear()} FoodInCar</div>
      </div>

      {/* Right panel */}
      <div className="login-right">
        <div className="login-form-box">
          <h2>Welcome back</h2>
          <p>Sign in to the admin portal</p>

          {error && (
            <div style={{ background: 'rgba(248,113,113,0.14)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)', padding: '8px 12px', borderRadius: 7, fontSize: 13, marginBottom: 14 }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label>Username</label>
              <input
                name="username"
                type="text"
                value={details.username}
                onChange={handleChange}
                placeholder="admin"
                autoFocus
              />
            </div>
            <div className="field">
              <label>Password</label>
              <input
                name="password"
                type="password"
                value={details.password}
                onChange={handleChange}
                placeholder="••••••••"
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default Login
