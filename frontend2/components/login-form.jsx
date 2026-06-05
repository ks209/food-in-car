"use client"

import React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import axios from "axios"

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

    const data = await axios.post("http://localhost:5000"+"/api/restaurant/login",{username, password},{withCredentials: true})
      if (data.status === 200) {
        toast("Login successful")
        router.push("/dashboard")
      } else {
        toast("Login failed")
      }
      setIsLoading(false)
  }

  return (
    <Card className="shadow-lg border-0">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold text-center text-gray-700">Sign In</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username" className="text-gray-700 font-medium">
              Username
            </Label>
            <Input
              id="username"
              type="username"
              placeholder="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-gray-700 font-medium">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <Button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5"
            disabled={isLoading}
          >
            {isLoading ? "Signing in..." : "Sign In"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
