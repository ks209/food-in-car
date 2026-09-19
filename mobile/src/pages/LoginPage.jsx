import { useEffect, useRef, useState } from "react"
import { useNavigate, useParams, Link } from "react-router-dom"
import { RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth"
import { useAuth } from "../context/AuthContext"
import { auth } from "../lib/firebase"
import { useRestaurantTheme } from "../lib/theme"
import { useRestaurantBase } from "../lib/restaurantPath"

const RESEND_SECONDS = 30

const FIREBASE_ERRORS = {
  "auth/invalid-phone-number": "That phone number doesn't look right",
  "auth/too-many-requests": "Too many attempts. Please try again later",
  "auth/quota-exceeded": "SMS limit reached. Please try again later",
  "auth/invalid-verification-code": "Incorrect OTP. Please check and try again",
  "auth/code-expired": "OTP expired. Please request a new one",
  "auth/captcha-check-failed": "Verification failed. Please try again",
  "auth/network-request-failed": "Network error. Check your connection",
}
const errorMessage = (err, fallback) =>
  FIREBASE_ERRORS[err?.code] || err?.response?.data?.message || (err?.code ? `${fallback} (${err.code})` : fallback)

const labelStyle = { display: "block", fontWeight: 600, marginBottom: "0.4rem", fontSize: "0.9rem" }

export default function LoginPage() {
  const { restaurantId } = useParams()
  const base = useRestaurantBase()
  useRestaurantTheme(restaurantId)
  const { phoneLogin } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState("phone") // phone -> otp -> profile (first-time only)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [phone, setPhone] = useState("")
  const [code, setCode] = useState("")
  const [profile, setProfile] = useState({ customerName: "", vehicleNo: "" })
  const [resendIn, setResendIn] = useState(0)

  const confirmationRef = useRef(null)
  const idTokenRef = useRef(null)
  const verifierRef = useRef(null)
  const captchaHostRef = useRef(null)

  const phoneValid = /^\d{10}$/.test(phone.trim())

  useEffect(() => () => verifierRef.current?.clear(), [])

  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [resendIn])

  // Invisible reCAPTCHA. Each verifier gets a fresh child element because a
  // cleared widget can't be re-rendered into the same node.
  const getVerifier = () => {
    if (!verifierRef.current) {
      const el = document.createElement("div")
      captchaHostRef.current.replaceChildren(el)
      verifierRef.current = new RecaptchaVerifier(auth, el, { size: "invisible" })
    }
    return verifierRef.current
  }

  const resetVerifier = () => {
    verifierRef.current?.clear()
    verifierRef.current = null
  }

  const sendOtp = async () => {
    setError(""); setLoading(true)
    resetVerifier() // a solved token is single-use, so resends need a fresh widget
    try {
      confirmationRef.current = await signInWithPhoneNumber(auth, `+91${phone.trim()}`, getVerifier())
      setCode("")
      setStep("otp")
      setResendIn(RESEND_SECONDS)
    } catch (err) {
      resetVerifier()
      setError(errorMessage(err, "Couldn't send OTP. Please try again"))
    } finally { setLoading(false) }
  }

  const finish = async (extra) => {
    const data = await phoneLogin(idTokenRef.current, extra)
    if (data.needsProfile) setStep("profile")
    else navigate(`${base}/orders`)
  }

  const handlePhone = (e) => {
    e.preventDefault()
    if (phoneValid) sendOtp()
  }

  const handleOtp = async (e) => {
    e.preventDefault()
    setError(""); setLoading(true)
    try {
      const result = await confirmationRef.current.confirm(code.trim())
      idTokenRef.current = await result.user.getIdToken()
      await finish()
    } catch (err) {
      setError(errorMessage(err, "Verification failed"))
    } finally { setLoading(false) }
  }

  const handleProfile = async (e) => {
    e.preventDefault()
    setError(""); setLoading(true)
    try {
      await finish(profile)
    } catch (err) {
      setError(errorMessage(err, "Couldn't create your account"))
    } finally { setLoading(false) }
  }

  const titles = {
    phone: ["Sign In", "Enter your mobile number to continue"],
    otp: ["Verify OTP", `Code sent to +91 ${phone}`],
    profile: ["Almost there", "Tell us a bit about yourself"],
  }

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ background: "var(--primary)", padding: "1.5rem 1rem", color: "white" }}>
        <Link to={base || "/"} style={{ color: "white", fontSize: "0.9rem", opacity: 0.9 }}>← {base ? "Back to Menu" : "Back"}</Link>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginTop: "0.5rem" }}>{titles[step][0]}</h1>
        <p style={{ opacity: 0.85, fontSize: "0.9rem" }}>{titles[step][1]}</p>
      </div>

      <div style={{ padding: "1.5rem 1rem", flex: 1 }}>
        {error && (
          <div style={{ background: "rgba(248,113,113,0.15)", color: "var(--error)", padding: "0.75rem 1rem", borderRadius: 8, marginBottom: "1rem", fontSize: "0.9rem", border: "1px solid rgba(248,113,113,0.25)" }}>
            {error}
          </div>
        )}

        {step === "phone" && (
          <form onSubmit={handlePhone} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label style={labelStyle}>Phone Number</label>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <span style={{ fontWeight: 600, color: "var(--muted)" }}>+91</span>
                <input className="input" type="tel" inputMode="numeric" maxLength={10} autoComplete="tel-national"
                  placeholder="10-digit mobile number" value={phone}
                  onChange={e => setPhone(e.target.value.replace(/\D/g, ""))} required />
              </div>
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading || !phoneValid} style={{ marginTop: "0.5rem" }}>
              {loading ? "Sending OTP..." : "Send OTP"}
            </button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={handleOtp} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label style={labelStyle}>OTP</label>
              <input className="input" type="text" inputMode="numeric" maxLength={6} autoComplete="one-time-code" autoFocus
                placeholder="6-digit code" value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ""))} required
                style={{ letterSpacing: "0.3em", fontSize: "1.2rem" }} />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading || code.length !== 6} style={{ marginTop: "0.5rem" }}>
              {loading ? "Verifying..." : "Verify & Continue"}
            </button>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem" }}>
              <button type="button" onClick={() => { setStep("phone"); setError("") }}
                style={{ color: "var(--muted)", background: "none" }}>
                Change number
              </button>
              <button type="button" onClick={sendOtp} disabled={loading || resendIn > 0}
                style={{ color: resendIn > 0 ? "var(--muted)" : "var(--primary)", background: "none", fontWeight: 600 }}>
                {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend OTP"}
              </button>
            </div>
          </form>
        )}

        {step === "profile" && (
          <form onSubmit={handleProfile} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label style={labelStyle}>Full Name</label>
              <input className="input" type="text" placeholder="Your full name" autoFocus
                value={profile.customerName} onChange={e => setProfile({ ...profile, customerName: e.target.value })} required />
            </div>
            <div>
              <label style={labelStyle}>Vehicle Number <span style={{ fontWeight: 400, color: "var(--muted)" }}>(optional)</span></label>
              <input className="input" type="text" placeholder="e.g. DL 4C AB 1234"
                value={profile.vehicleNo} onChange={e => setProfile({ ...profile, vehicleNo: e.target.value })} />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: "0.5rem" }}>
              {loading ? "Creating account..." : "Create Account"}
            </button>
          </form>
        )}

        {/* Invisible reCAPTCHA mounts here */}
        <div ref={captchaHostRef} />
      </div>
    </div>
  )
}
