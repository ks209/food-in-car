"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import axios from "axios"
import { API } from "@/lib/api"

export function LoginForm() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    if (!username || !password) {
      toast.error("Please fill in all fields")
      setIsLoading(false)
      return
    }

    try {
      const data = await axios.post(
        `${API}/api/restaurant/login`,
        { username, password },
        { withCredentials: true }
      )
      if (data.status === 200) {
        toast.success("Signed in")
        router.push("/dashboard")
      } else {
        toast.error("Invalid credentials")
      }
    } catch {
      toast.error("Invalid credentials")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="username" className="text-slate-700 text-sm font-medium">
          Username
        </Label>
        <Input
          id="username"
          type="text"
          placeholder="your-restaurant"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          className="h-10 border-slate-200 focus-visible:ring-offset-0 focus-visible:ring-1"
          style={{ "--tw-ring-color": "var(--brand)" }}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password" className="text-slate-700 text-sm font-medium">
          Password
        </Label>
        <Input
          id="password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="h-10 border-slate-200"
        />
      </div>

      <Button
        type="submit"
        className="w-full h-10 font-medium brand-bg text-white mt-2"
        disabled={isLoading}
      >
        {isLoading ? "Signing in…" : "Sign In"}
      </Button>
    </form>
  )
}
