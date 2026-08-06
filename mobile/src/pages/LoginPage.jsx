import { useState } from "react"
import { useNavigate, useParams, Link } from "react-router-dom"
import { useAuth } from "../context/AuthContext"
import { useRestaurantTheme } from "../lib/theme"
import { useRestaurantBase } from "../lib/restaurantPath"

export default function LoginPage() {
  const { restaurantId } = useParams()
  const base = useRestaurantBase()
  useRestaurantTheme(restaurantId)
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState("login")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const [loginForm, setLoginForm] = useState({ phoneNumber: "", password: "" })
  const [registerForm, setRegisterForm] = useState({
    customerName: "", phoneNumber: "", username: "", password: "", vehicleNo: "",
  })

  const handleLogin = async (e) => {
    e.preventDefault()
    setError(""); setLoading(true)
    try {
      await login(loginForm.phoneNumber, loginForm.password)
      navigate(`${base}/orders`)
    } catch (err) {
      setError(err.response?.data?.message || "Login failed")
    } finally { setLoading(false) }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setError(""); setLoading(true)
    try {
      await register(registerForm)
      await login(registerForm.phoneNumber, registerForm.password)
      navigate(`${base}/orders`)
    } catch (err) {
      setError(err.response?.data?.message || "Registration failed")
    } finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ background: "var(--primary)", padding: "1.5rem 1rem", color: "white" }}>
        <Link to={base} style={{ color: "white", fontSize: "0.9rem", opacity: 0.9 }}>← Back to Menu</Link>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginTop: "0.5rem" }}>
          {mode === "login" ? "Sign In" : "Create Account"}
        </h1>
        <p style={{ opacity: 0.85, fontSize: "0.9rem" }}>
          {mode === "login" ? "Welcome back!" : "Join to start ordering"}
        </p>
      </div>

      {/* Mode Toggle */}
      <div style={{ display: "flex", margin: "1.5rem 1rem 0", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 4 }}>
        {["login", "register"].map(m => (
          <button key={m} onClick={() => { setMode(m); setError("") }}
            style={{ flex: 1, padding: "0.6rem", borderRadius: 7, fontWeight: 600, fontSize: "0.9rem", transition: "all 0.15s",
              background: mode === m ? "var(--surface-2)" : "transparent",
              color: mode === m ? "var(--primary)" : "var(--muted)",
              boxShadow: mode === m ? "var(--shadow)" : "none" }}>
            {m === "login" ? "Sign In" : "Register"}
          </button>
        ))}
      </div>

      <div style={{ padding: "1.5rem 1rem", flex: 1 }}>
        {error && (
          <div style={{ background: "rgba(248,113,113,0.15)", color: "var(--error)", padding: "0.75rem 1rem", borderRadius: 8, marginBottom: "1rem", fontSize: "0.9rem", border: "1px solid rgba(248,113,113,0.25)" }}>
            {error}
          </div>
        )}

        {mode === "login" ? (
          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", fontWeight: 600, marginBottom: "0.4rem", fontSize: "0.9rem" }}>Phone Number</label>
              <input className="input" type="tel" placeholder="Enter your phone number"
                value={loginForm.phoneNumber} onChange={e => setLoginForm({ ...loginForm, phoneNumber: e.target.value })} required />
            </div>
            <div>
              <label style={{ display: "block", fontWeight: 600, marginBottom: "0.4rem", fontSize: "0.9rem" }}>Password</label>
              <input className="input" type="password" placeholder="Enter your password"
                value={loginForm.password} onChange={e => setLoginForm({ ...loginForm, password: e.target.value })} required />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: "0.5rem" }}>
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", fontWeight: 600, marginBottom: "0.4rem", fontSize: "0.9rem" }}>Full Name</label>
              <input className="input" type="text" placeholder="Your full name"
                value={registerForm.customerName} onChange={e => setRegisterForm({ ...registerForm, customerName: e.target.value })} required />
            </div>
            <div>
              <label style={{ display: "block", fontWeight: 600, marginBottom: "0.4rem", fontSize: "0.9rem" }}>Phone Number</label>
              <input className="input" type="tel" placeholder="Your phone number"
                value={registerForm.phoneNumber} onChange={e => setRegisterForm({ ...registerForm, phoneNumber: e.target.value })} required />
            </div>
            <div>
              <label style={{ display: "block", fontWeight: 600, marginBottom: "0.4rem", fontSize: "0.9rem" }}>Username</label>
              <input className="input" type="text" placeholder="Choose a username"
                value={registerForm.username} onChange={e => setRegisterForm({ ...registerForm, username: e.target.value })} required />
            </div>
            <div>
              <label style={{ display: "block", fontWeight: 600, marginBottom: "0.4rem", fontSize: "0.9rem" }}>Password</label>
              <input className="input" type="password" placeholder="Create a password"
                value={registerForm.password} onChange={e => setRegisterForm({ ...registerForm, password: e.target.value })} required />
            </div>
            <div>
              <label style={{ display: "block", fontWeight: 600, marginBottom: "0.4rem", fontSize: "0.9rem" }}>Vehicle Number</label>
              <input className="input" type="text" placeholder="e.g. DL 4C AB 1234"
                value={registerForm.vehicleNo} onChange={e => setRegisterForm({ ...registerForm, vehicleNo: e.target.value })} required />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: "0.5rem" }}>
              {loading ? "Creating account..." : "Create Account"}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
