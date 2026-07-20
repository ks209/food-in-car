"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Loader2, Store, Car, Paintbrush } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import axios from "axios"
import { API } from "@/lib/api"

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
          logoUrl: r.data.logoUrl || "",
          pickupEnabled: r.data.pickupEnabled ?? false,
          username: r.data.username,
          domain: r.data.domain,
        }
        setForm(data)
        setOriginal(data)
      })
      .catch(() => toast.error("Failed to load settings"))
  }, [])

  const setField = (k, v) => setForm((p) => ({ ...p, [k]: v }))

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
          logoUrl: form.logoUrl,
          pickupEnabled: form.pickupEnabled,
        },
        { withCredentials: true }
      )
      setOriginal(form)
      toast.success("Settings saved")
    } catch {
      toast.error("Failed to save settings")
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => setForm(original)

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
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Restaurant settings</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Update your profile and contact details.
          </p>
        </div>
        <Link href="/dashboard/customize" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 flex-shrink-0 pt-1">
          <Paintbrush className="h-3.5 w-3.5" /> Colors, fonts & branding →
        </Link>
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
                <Car className="h-4 w-4" /> Fulfilment
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <Label className="text-sm">Allow pickup orders</Label>
                  <p className="text-xs text-muted-foreground">
                    When on, customers can choose “Pickup” and skip the vehicle number. When off, a vehicle number is required on every order.
                  </p>
                </div>
                <Switch
                  checked={form.pickupEnabled}
                  onCheckedChange={(v) => setField("pickupEnabled", v)}
                  className="mt-0.5 flex-shrink-0"
                />
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
