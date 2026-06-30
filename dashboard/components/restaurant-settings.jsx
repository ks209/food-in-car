"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Check, Loader2, Palette, Store } from "lucide-react"
import { toast } from "sonner"
import axios from "axios"
import { API } from "@/lib/api"

const PRESETS = [
  "#f97316", // orange
  "#ef4444", // red
  "#22c55e", // green
  "#3b82f6", // blue
  "#a855f7", // purple
  "#ec4899", // pink
  "#14b8a6", // teal
  "#eab308", // amber
]

const applyBrand = (hex) => {
  if (hex) document.documentElement.style.setProperty("--brand", hex)
}

export function RestaurantSettings() {
  const [form, setForm] = useState(null)
  const [original, setOriginal] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    axios
      .get(`${API}/api/restaurant/me`, { withCredentials: true })
      .then((r) => {
        const data = {
          name: r.data.name || "",
          phone: r.data.phone || "",
          address: r.data.address || "",
          themeColor: r.data.themeColor || "#f97316",
          logoUrl: r.data.logoUrl || "",
          username: r.data.username,
          domain: r.data.domain,
        }
        setForm(data)
        setOriginal(data)
      })
      .catch(() => toast.error("Failed to load settings"))
  }, [])

  const setField = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const setColor = (hex) => {
    setField("themeColor", hex)
    applyBrand(hex) // live preview
  }

  const dirty = original && JSON.stringify(form) !== JSON.stringify(original)

  const handleSave = async () => {
    setSaving(true)
    try {
      await axios.put(
        `${API}/api/restaurant/me`,
        {
          name: form.name,
          phone: form.phone,
          address: form.address,
          themeColor: form.themeColor,
          logoUrl: form.logoUrl,
        },
        { withCredentials: true }
      )
      setOriginal(form)
      applyBrand(form.themeColor)
      toast.success("Settings saved")
    } catch {
      toast.error("Failed to save settings")
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setForm(original)
    applyBrand(original.themeColor)
  }

  if (!form) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
      </div>
    )
  }

  const initial = (form.name || form.username || "R")[0].toUpperCase()

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h2 className="text-lg font-semibold tracking-tight">Restaurant settings</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Update your branding and contact details. Changes apply across your dashboard and customer menu.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-2">
                <Store className="h-4 w-4" /> Profile
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm">Display name</Label>
                <Input value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="Spice Garden" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm">Phone</Label>
                  <Input value={form.phone} onChange={(e) => setField("phone", e.target.value)} placeholder="+91 98765 43210" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm text-muted-foreground">Username</Label>
                  <Input value={form.username} disabled className="opacity-60" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Address</Label>
                <Input value={form.address} onChange={(e) => setField("address", e.target.value)} placeholder="123 Food Street" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Logo URL</Label>
                <Input value={form.logoUrl} onChange={(e) => setField("logoUrl", e.target.value)} placeholder="https://…/logo.png" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-2">
                <Palette className="h-4 w-4" /> Brand color
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2.5">
                {PRESETS.map((hex) => {
                  const active = form.themeColor?.toLowerCase() === hex.toLowerCase()
                  return (
                    <button
                      key={hex}
                      onClick={() => setColor(hex)}
                      className={`h-9 w-9 rounded-full flex items-center justify-center transition-transform hover:scale-110 ${active ? "ring-2 ring-offset-2 ring-offset-card" : ""}`}
                      style={{ backgroundColor: hex, "--tw-ring-color": hex }}
                      title={hex}
                    >
                      {active && <Check className="h-4 w-4 text-white" />}
                    </button>
                  )
                })}
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={form.themeColor}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-10 w-12 rounded-md bg-transparent border border-border cursor-pointer"
                />
                <Input
                  value={form.themeColor}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-36 font-mono uppercase"
                  maxLength={7}
                />
                <span className="text-xs text-muted-foreground">Pick a preset, use the picker, or type a hex.</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Live preview */}
        <div className="lg:col-span-1">
          <Card className="border-0 sticky top-24 anim-scale">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-500">Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                {form.logoUrl ? (
                  <img src={form.logoUrl} alt="" className="h-11 w-11 rounded-xl object-cover" />
                ) : (
                  <div className="h-11 w-11 rounded-xl flex items-center justify-center text-white font-bold brand-bg">
                    {initial}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-semibold truncate">{form.name || "Your restaurant"}</p>
                  <p className="text-xs text-muted-foreground truncate">{form.phone || "No phone set"}</p>
                </div>
              </div>

              <div className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Margherita Pizza</span>
                  <span className="font-semibold">₹249</span>
                </div>
                <Button className="w-full brand-bg text-white">Add to cart</Button>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="px-2 py-0.5 rounded-full text-xs font-medium text-white brand-bg">PREPARING</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium brand-bg-subtle brand-text">Featured</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Save bar */}
      <div className="sticky bottom-0 mt-6 -mx-8 px-8 py-4 bg-background/80 backdrop-blur-md border-t border-border flex items-center justify-end gap-3">
        {dirty && <span className="text-xs text-muted-foreground mr-auto">You have unsaved changes</span>}
        <Button variant="outline" onClick={handleReset} disabled={!dirty || saving}>
          Reset
        </Button>
        <Button className="brand-bg text-white min-w-28" onClick={handleSave} disabled={!dirty || saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
        </Button>
      </div>
    </div>
  )
}
