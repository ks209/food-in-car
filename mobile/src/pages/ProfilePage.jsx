import { useEffect, useState } from "react"
import { useParams, Link, Navigate } from "react-router-dom"
import { Car, Plus, X } from "lucide-react"
import { useAuth } from "../context/AuthContext"
import { useRestaurantTheme } from "../lib/theme"
import { useRestaurantBase } from "../lib/restaurantPath"

const labelStyle = { display: "block", fontWeight: 600, marginBottom: "0.4rem", fontSize: "0.9rem" }

export default function ProfilePage() {
  const { restaurantId } = useParams()
  const base = useRestaurantBase()
  useRestaurantTheme(restaurantId)
  const { user, loading: authLoading, updateProfile } = useAuth()

  const [name, setName] = useState("")
  const [vehicles, setVehicles] = useState([])
  const [newVehicle, setNewVehicle] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!user) return
    setName(user.customerName || "")
    setVehicles(user.vehicles || [])
  }, [user])

  if (authLoading) {
    return <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}><div className="spinner" /></div>
  }
  if (!user) return <Navigate to={`${base}/login`} replace />

  const addVehicle = () => {
    const v = newVehicle.trim().toUpperCase()
    if (!v) return
    if (!vehicles.includes(v)) setVehicles([...vehicles, v])
    setNewVehicle("")
    setSaved(false)
  }

  const removeVehicle = (v) => {
    setVehicles(vehicles.filter(x => x !== v))
    setSaved(false)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setError(""); setSaved(false); setSaving(true)
    try {
      // Include a typed-but-not-added vehicle rather than silently dropping it
      const pending = newVehicle.trim().toUpperCase()
      const list = pending && !vehicles.includes(pending) ? [...vehicles, pending] : vehicles
      await updateProfile({ customerName: name, vehicles: list })
      setNewVehicle("")
      setSaved(true)
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't save your profile")
    } finally { setSaving(false) }
  }

  return (
    <div className="page" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, var(--primary), var(--primary-dark))", padding: "1.5rem 1.25rem 1.75rem", color: "white" }}>
        <Link to={base || "/"} style={{ color: "rgba(255,255,255,0.85)", fontSize: "0.85rem" }}>← {base ? "Back to Menu" : "Back"}</Link>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 800, marginTop: "0.6rem" }}>Edit Profile</h1>
        <p style={{ opacity: 0.85, fontSize: "0.88rem" }}>+91 {user.phoneNumber}</p>
      </div>

      <form onSubmit={handleSave} style={{ padding: "1.25rem 1rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        {error && (
          <div style={{ background: "rgba(248,113,113,0.15)", color: "var(--error)", padding: "0.75rem 1rem", borderRadius: 8, fontSize: "0.9rem", border: "1px solid rgba(248,113,113,0.25)" }}>
            {error}
          </div>
        )}

        <div>
          <label style={labelStyle}>Full Name</label>
          <input className="input" type="text" placeholder="Your full name" value={name}
            onChange={e => { setName(e.target.value); setSaved(false) }} required />
        </div>

        <div>
          <label style={labelStyle}>My Vehicles</label>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "0.6rem" }}>
            {vehicles.length === 0 && (
              <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>No vehicles saved yet.</p>
            )}
            {vehicles.map(v => (
              <div key={v} className="card" style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.65rem 0.85rem" }}>
                <Car size={16} color="var(--muted)" />
                <span style={{ flex: 1, fontWeight: 600, letterSpacing: "0.04em" }}>{v}</span>
                <button type="button" onClick={() => removeVehicle(v)} aria-label={`Remove ${v}`}
                  style={{ background: "none", color: "var(--muted)", display: "flex", padding: 4 }}>
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input className="input" type="text" placeholder="e.g. DL 4C AB 1234" value={newVehicle}
              onChange={e => setNewVehicle(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addVehicle() } }} />
            <button type="button" className="btn btn-outline btn-sm" onClick={addVehicle} disabled={!newVehicle.trim()}
              style={{ flexShrink: 0 }}>
              <Plus size={14} /> Add
            </button>
          </div>
        </div>

        <button className="btn btn-primary" type="submit" disabled={saving || !name.trim()}>
          {saving ? "Saving..." : "Save Changes"}
        </button>
        {saved && <p style={{ textAlign: "center", color: "var(--success)", fontSize: "0.88rem", fontWeight: 600 }}>Profile updated</p>}
      </form>
    </div>
  )
}
