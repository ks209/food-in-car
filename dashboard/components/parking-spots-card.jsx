"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Loader2, SquareParking, Plus, Trash2, ChevronUp, ChevronDown, Pencil, Check, X } from "lucide-react"
import { toast } from "sonner"
import axios from "axios"
import { API } from "@/lib/api"

// Where "Deliver in Car" customers can say they're parked. Every action saves
// immediately (like the Shop status / Fulfilment switches) — there is nothing
// here for the page's "unsaved changes" bar to track.
export function ParkingSpotsCard({ deliveryEnabled }) {
  const [spots, setSpots] = useState(null)
  const [required, setRequired] = useState(true)
  const [newName, setNewName] = useState("")
  const [busy, setBusy] = useState(null) // "add" | "required" | "reorder" | `edit-${id}` | `delete-${id}`
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState("")

  const apply = (data) => { setSpots(data.spots); setRequired(data.required) }
  const errorMessage = (err, fallback) => err?.response?.data?.error || fallback

  useEffect(() => {
    axios.get(`${API}/api/parking`, { withCredentials: true })
      .then((r) => apply(r.data))
      .catch(() => { setSpots([]); toast.error("Failed to load parking spots") })
  }, [])

  const addSpot = async (e) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setBusy("add")
    try {
      const r = await axios.post(`${API}/api/parking`, { name }, { withCredentials: true })
      setSpots((s) => [...s, r.data])
      setNewName("")
    } catch (err) {
      toast.error(errorMessage(err, "Failed to add parking spot"))
    } finally {
      setBusy(null)
    }
  }

  const saveRename = async (id) => {
    const name = editName.trim()
    if (!name) return
    setBusy(`edit-${id}`)
    try {
      const r = await axios.put(`${API}/api/parking/${id}`, { name }, { withCredentials: true })
      setSpots((s) => s.map((spot) => (spot.id === id ? r.data : spot)))
      setEditingId(null)
    } catch (err) {
      toast.error(errorMessage(err, "Failed to rename parking spot"))
    } finally {
      setBusy(null)
    }
  }

  const removeSpot = async (spot) => {
    if (!window.confirm(`Remove "${spot.name}"? Past orders keep showing it.`)) return
    setBusy(`delete-${spot.id}`)
    try {
      await axios.delete(`${API}/api/parking/${spot.id}`, { withCredentials: true })
      setSpots((s) => s.filter((x) => x.id !== spot.id))
    } catch (err) {
      toast.error(errorMessage(err, "Failed to remove parking spot"))
    } finally {
      setBusy(null)
    }
  }

  const move = async (index, delta) => {
    const next = [...spots]
    const [moved] = next.splice(index, 1)
    next.splice(index + delta, 0, moved)
    const previous = spots
    setSpots(next)
    setBusy("reorder")
    try {
      const r = await axios.put(`${API}/api/parking/reorder`, { ids: next.map((s) => s.id) }, { withCredentials: true })
      apply(r.data)
    } catch (err) {
      setSpots(previous)
      toast.error(errorMessage(err, "Failed to reorder parking spots"))
    } finally {
      setBusy(null)
    }
  }

  const toggleRequired = async (value) => {
    setRequired(value)
    setBusy("required")
    try {
      const r = await axios.put(`${API}/api/parking/settings`, { required: value }, { withCredentials: true })
      apply(r.data)
      toast.success(value ? "Customers must pick a parking spot" : "Parking spot is now optional")
    } catch (err) {
      setRequired(!value)
      toast.error(errorMessage(err, "Failed to update"))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="border-0">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-2">
          <SquareParking className="h-4 w-4" /> Parking spots
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground -mt-1">
          Customers choosing “Deliver in Car” pick where they’re parked from this list. Leave it empty to not ask.
        </p>
        {!deliveryEnabled && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Delivery in car is turned off, so customers won’t see this list until you enable it above.
          </p>
        )}

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-0.5">
            <Label className="text-sm">Require a parking spot</Label>
            <p className="text-xs text-muted-foreground">
              {required
                ? "Customers can’t check out for in-car delivery without picking a spot."
                : "Customers can pick a spot, or skip it."}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
            {busy === "required" && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            <Switch checked={required} onCheckedChange={toggleRequired} disabled={busy === "required" || spots === null} />
          </div>
        </div>

        {spots === null ? (
          <div className="flex items-center text-sm text-muted-foreground py-2">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
          </div>
        ) : spots.length === 0 ? (
          <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border px-3 py-4 text-center">
            No parking spots yet — customers won’t be asked where they’re parked.
          </p>
        ) : (
          <ul className="rounded-lg border border-border divide-y divide-border">
            {spots.map((spot, i) => (
              <li key={spot.id} className="flex items-center gap-2 px-3 py-2">
                <div className="flex flex-col">
                  <button type="button" aria-label="Move up" className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    disabled={i === 0 || busy !== null} onClick={() => move(i, -1)}>
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" aria-label="Move down" className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    disabled={i === spots.length - 1 || busy !== null} onClick={() => move(i, 1)}>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>

                {editingId === spot.id ? (
                  <form className="flex flex-1 items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); saveRename(spot.id) }}>
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={60} autoFocus className="h-8 text-sm" />
                    <Button type="submit" size="sm" variant="ghost" className="h-8 w-8 p-0" disabled={busy === `edit-${spot.id}` || !editName.trim()} aria-label="Save">
                      {busy === `edit-${spot.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setEditingId(null)} aria-label="Cancel">
                      <X className="h-4 w-4" />
                    </Button>
                  </form>
                ) : (
                  <>
                    <span className="flex-1 text-sm truncate">{spot.name}</span>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" aria-label={`Rename ${spot.name}`}
                      onClick={() => { setEditingId(spot.id); setEditName(spot.name) }} disabled={busy !== null}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500 hover:text-red-600" aria-label={`Remove ${spot.name}`}
                      onClick={() => removeSpot(spot)} disabled={busy !== null}>
                      {busy === `delete-${spot.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={addSpot} className="flex gap-2">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={60}
            placeholder="e.g. Basement B2, Gate 3 – Row A" disabled={spots === null} />
          <Button type="submit" variant="outline" disabled={!newName.trim() || busy === "add" || spots === null} className="flex-shrink-0">
            {busy === "add" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1" /> Add</>}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
