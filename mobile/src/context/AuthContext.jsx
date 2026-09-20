import { createContext, useContext, useEffect, useState } from "react"
import { signOut } from "firebase/auth"
import { userApi } from "../api"
import { auth } from "../lib/firebase"

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    userApi.me()
      .then(r => setUser(r.data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  // Password login/register — disabled along with their backend routes
  // (routes/user/user.js); phoneLogin below is the only sign-in path.
  // const login = async (phoneNumber, password) => {
  //   const res = await userApi.login({ phoneNumber, password })
  //   setUser(res.data.user)
  //   return res.data.user
  // }

  // Exchange a Firebase phone-auth ID token for our session. Returns
  // { needsProfile: true } for a first-time number until a name is supplied.
  const phoneLogin = async (idToken, profile = {}) => {
    const res = await userApi.firebaseLogin({ idToken, ...profile })
    if (res.data.user) setUser(res.data.user)
    return res.data
  }

  const updateProfile = async (data) => {
    const res = await userApi.updateMe(data)
    setUser(res.data)
    return res.data
  }

  // const register = async (data) => {
  //   const res = await userApi.register(data)
  //   return res.data
  // }

  const logout = async () => {
    await userApi.logout().catch(() => {})
    await signOut(auth).catch(() => {})
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, phoneLogin, updateProfile, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
