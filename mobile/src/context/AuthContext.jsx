import { createContext, useContext, useEffect, useState } from "react"
import { userApi } from "../api"

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

  const login = async (phoneNumber, password) => {
    const res = await userApi.login({ phoneNumber, password })
    setUser(res.data.user)
    return res.data.user
  }

  const register = async (data) => {
    const res = await userApi.register(data)
    return res.data
  }

  const logout = async () => {
    await userApi.logout().catch(() => {})
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
