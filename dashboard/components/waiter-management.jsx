"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { UserPlus, QrCode, Copy, Power } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { toast } from "sonner"
import axios from "axios"

import { API } from "@/lib/api"

export function WaiterManagement() {
  const [waiters, setWaiters] = useState([])
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [tokenInfo, setTokenInfo] = useState(null) // { waiter, scanUrl }

  const fetchWaiters = async () => {
    setLoading(true)
    try {
      const res = await axios.get(`${API}/api/waiter`, { withCredentials: true })
      setWaiters(res.data)
    } catch {
      toast.error("Failed to load waiters")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchWaiters() }, [])

  const createWaiter = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    try {
      await axios.post(`${API}/api/waiter`, { name: name.trim(), phone: phone.trim() }, { withCredentials: true })
      toast.success("Waiter added")
      setName(""); setPhone("")
      fetchWaiters()
    } catch {
      toast.error("Failed to add waiter")
    }
  }

  const toggleActive = async (w) => {
    try {
      await axios.put(`${API}/api/waiter/${w.id}`, { isActive: !w.isActive }, { withCredentials: true })
      fetchWaiters()
    } catch {
      toast.error("Failed to update waiter")
    }
  }

  const generateToken = async (w) => {
    try {
      const res = await axios.post(`${API}/api/waiter/${w.id}/token`, {}, { withCredentials: true })
      setTokenInfo(res.data)
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to generate link")
    }
  }

  const copyLink = () => {
    navigator.clipboard?.writeText(tokenInfo.scanUrl)
    toast.success("Scan link copied")
  }

  return (
    <div className="max-w-2xl space-y-5">
      {/* Add waiter */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-5">
          <form onSubmit={createWaiter} className="flex flex-col sm:flex-row gap-2">
            <Input placeholder="Waiter name" value={name} onChange={(e) => setName(e.target.value)} className="bg-white" />
            <Input placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} className="bg-white sm:max-w-[180px]" />
            <Button type="submit" className="brand-bg text-white">
              <UserPlus className="h-4 w-4 mr-2" /> Add waiter
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Waiter list */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          {loading && waiters.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-10">Loading…</p>
          ) : waiters.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-10">No waiters yet — add one above.</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {waiters.map((w) => (
                <div key={w.id} className="flex items-center justify-between px-5 py-4">
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {w.name}
                      {!w.isActive && <span className="ml-2 text-xs text-red-500">(inactive)</span>}
                    </p>
                    <p className="text-xs text-slate-400">
                      {w.phone ? `${w.phone} · ` : ""}{w.deliveredCount} delivered
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!w.isActive}
                      onClick={() => generateToken(w)}>
                      <QrCode className="h-3.5 w-3.5 mr-1" /> Scan link
                    </Button>
                    <Button size="sm" variant="ghost" className={`h-8 text-xs ${w.isActive ? "text-red-500" : "text-emerald-600"}`}
                      onClick={() => toggleActive(w)}>
                      <Power className="h-3.5 w-3.5 mr-1" /> {w.isActive ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scan link dialog */}
      <Dialog open={!!tokenInfo} onOpenChange={(o) => !o && setTokenInfo(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Scan link · {tokenInfo?.waiter?.name}</DialogTitle></DialogHeader>
          {tokenInfo && (
            <div className="space-y-4 text-center">
              <p className="text-xs text-slate-500">
                Have the waiter open this on their phone. Valid for 24 hours.
              </p>
              <div className="flex justify-center">
                <div className="p-3 bg-white rounded-xl border">
                  <QRCodeSVG value={tokenInfo.scanUrl} size={180} level="M" />
                </div>
              </div>
              <div className="flex gap-2">
                <Input readOnly value={tokenInfo.scanUrl} className="text-xs" />
                <Button onClick={copyLink} className="brand-bg text-white flex-shrink-0">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
