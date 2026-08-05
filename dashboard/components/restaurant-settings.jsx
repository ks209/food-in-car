"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Store, Car, Paintbrush, Power, AlertCircle, Timer, MapPin, CreditCard, ShieldCheck } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import axios from "axios"
import { API } from "@/lib/api"
import { QrDownloadCard } from "@/components/qr-download"

export function RestaurantSettings() {
  const [form, setForm] = useState(null)
  const [original, setOriginal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [savingKey, setSavingKey] = useState(null)
  const [cities, setCities] = useState([])
  const [phonepeConfigured, setPhonepeConfigured] = useState(false)

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
          deliveryEnabled: r.data.deliveryEnabled ?? true,
          isOpen: r.data.isOpen ?? true,
          slaWarnMinutes: r.data.slaWarnMinutes ?? 8,
          slaCritMinutes: r.data.slaCritMinutes ?? 15,
          latitude: r.data.latitude ?? "",
          longitude: r.data.longitude ?? "",
          cityId: r.data.cityId ?? "",
          phonepeMerchantId: r.data.phonepeMerchantId || "",
          phonepeSaltKey: "", // write-only — server never sends the real value back
          phonepeSaltIndex: r.data.phonepeSaltIndex || "1",
          phonepeSandbox: r.data.phonepeSandbox ?? true,
          username: r.data.username,
          domain: r.data.domain,
        }
        setForm(data)
        setOriginal(data)
        setPhonepeConfigured(r.data.phonepeConfigured)
      })
      .catch(() => toast.error("Failed to load settings"))
    axios.get(`${API}/api/city`).then((r) => setCities(r.data)).catch(() => {})
  }, [])

  const setField = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const dirty = original && JSON.stringify(form) !== JSON.stringify(original)

  // Warn on browser refresh/close/back with unsaved profile-field edits — the
  // toggles below no longer need this (they save the instant you flip them).
  useEffect(() => {
    const handler = (e) => { if (dirty) { e.preventDefault(); e.returnValue = "" } }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [dirty])

  // Switches (Shop status, Fulfilment) read as instant on/off actions to a user,
  // not form fields — stashing the flip behind a separate "Save changes" button
  // is exactly what led to changes going unsaved. These save themselves the
  // moment you flip them, with an optimistic update + rollback on failure.
  const saveInstant = async (key, value, successMessage) => {
    const previous = original[key]
    setField(key, value)
    setSavingKey(key)
    try {
      const res = await axios.put(`${API}/api/restaurant/me`, { [key]: value }, { withCredentials: true })
      const confirmed = res.data[key]
      setForm((f) => ({ ...f, [key]: confirmed }))
      setOriginal((o) => ({ ...o, [key]: confirmed }))
      toast.success(successMessage)
    } catch (err) {
      setField(key, previous)
      toast.error(err?.response?.data?.message || "Failed to update")
    } finally {
      setSavingKey(null)
    }
  }

  // Shop status + fulfilment save themselves instantly (see saveInstant) — this
  // bar covers the profile text fields plus the SLA minute inputs (typing a
  // number needs an explicit save, unlike a switch flip).
  const handleSave = async () => {
    if (!slaValid) { toast.error("The warning threshold must be less than the critical threshold"); return }
    if (!locationValid) { toast.error("Set both latitude and longitude, or leave both blank"); return }
    setSaving(true)
    try {
      const payload = {
        name: form.name,
        phone: form.phone,
        address: form.address,
        logoUrl: form.logoUrl,
        slaWarnMinutes: Number(form.slaWarnMinutes),
        slaCritMinutes: Number(form.slaCritMinutes),
        latitude: form.latitude === "" ? null : Number(form.latitude),
        longitude: form.longitude === "" ? null : Number(form.longitude),
        cityId: form.cityId === "" ? null : Number(form.cityId),
        phonepeMerchantId: form.phonepeMerchantId,
        phonepeSaltIndex: form.phonepeSaltIndex,
        phonepeSandbox: form.phonepeSandbox,
        // Omit entirely when blank — the backend treats "not present" as
        // "leave the saved key alone", vs. an empty string which it'd reject.
        ...(form.phonepeSaltKey ? { phonepeSaltKey: form.phonepeSaltKey } : {}),
      }
      const res = await axios.put(`${API}/api/restaurant/me`, payload, { withCredentials: true })
      // Sync to `form` itself, not the numeric-coerced `payload` — the inputs
      // leave form values as strings (e.g. "18.5204"), and merging payload's
      // coerced numbers into `original` made the dirty check's JSON.stringify
      // comparison see a permanent string-vs-number mismatch, so the "unsaved
      // changes" bar never cleared after saving. The salt key field always
      // clears back to blank afterward — it's write-only, like a password field.
      setOriginal({ ...form, phonepeSaltKey: "" })
      setField("phonepeSaltKey", "")
      setPhonepeConfigured(res.data.phonepeConfigured)
      toast.success("Settings saved")
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to save settings")
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
  const slaValid = Number(form.slaWarnMinutes) >= 1 && Number(form.slaCritMinutes) >= 1 && Number(form.slaWarnMinutes) < Number(form.slaCritMinutes)
  const latSet = form.latitude !== ""
  const lngSet = form.longitude !== ""
  const locationValid = latSet === lngSet && (!latSet || (Number(form.latitude) >= -90 && Number(form.latitude) <= 90 && Number(form.longitude) >= -180 && Number(form.longitude) <= 180))

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
                <Power className="h-4 w-4" /> Shop status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <Label className="text-sm">{form.isOpen ? "Open for orders" : "Closed"}</Label>
                  <p className="text-xs text-muted-foreground">
                    When closed, customers see “Restaurant is currently closed” and can’t place new orders. The dashboard stays accessible so you can finish existing orders.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                  {savingKey === "isOpen" && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  <Switch
                    checked={form.isOpen}
                    onCheckedChange={(v) => saveInstant("isOpen", v, v ? "Shop is now open for orders" : "Shop is now closed")}
                    disabled={savingKey === "isOpen"}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-2">
                <Car className="h-4 w-4" /> Fulfilment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <Label className="text-sm">Pickup</Label>
                  <p className="text-xs text-muted-foreground">
                    Customers can choose “Pickup” and skip the vehicle number.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                  {savingKey === "pickupEnabled" && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  <Switch
                    checked={form.pickupEnabled}
                    onCheckedChange={(v) => saveInstant("pickupEnabled", v, v ? "Pickup enabled" : "Pickup disabled")}
                    disabled={savingKey === "pickupEnabled" || (form.pickupEnabled && !form.deliveryEnabled)}
                  />
                </div>
              </div>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <Label className="text-sm">Delivery in car</Label>
                  <p className="text-xs text-muted-foreground">
                    Customers can order to their parked car with a vehicle number.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                  {savingKey === "deliveryEnabled" && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  <Switch
                    checked={form.deliveryEnabled}
                    onCheckedChange={(v) => saveInstant("deliveryEnabled", v, v ? "Delivery in car enabled" : "Delivery in car disabled")}
                    disabled={savingKey === "deliveryEnabled" || (form.deliveryEnabled && !form.pickupEnabled)}
                  />
                </div>
              </div>
              {!form.pickupEnabled && !form.deliveryEnabled && (
                <p className="text-xs text-red-500">At least one fulfilment option must stay enabled.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-2">
                <MapPin className="h-4 w-4" /> Location
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground -mt-1">
                Powers the mobile app's "nearby restaurants" homepage — customers see you sorted by distance. Leave blank to stay out of that list until set.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm">Latitude</Label>
                  <Input type="number" step="any" min={-90} max={90} value={form.latitude}
                    onChange={(e) => setField("latitude", e.target.value)} placeholder="19.0760" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Longitude</Label>
                  <Input type="number" step="any" min={-180} max={180} value={form.longitude}
                    onChange={(e) => setField("longitude", e.target.value)} placeholder="72.8777" />
                </div>
              </div>
              {!locationValid && (
                <p className="text-xs text-red-500">Set both latitude and longitude, or leave both blank.</p>
              )}
              <div className="space-y-1.5">
                <Label className="text-sm">City</Label>
                <p className="text-xs text-muted-foreground">
                  Shown to customers who can't share their location, as an alternative to distance sorting.
                </p>
                <Select value={form.cityId ? String(form.cityId) : "none"} onValueChange={(v) => setField("cityId", v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="No city set" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No city set</SelectItem>
                    {cities.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}{c.state ? `, ${c.state}` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-2">
                <CreditCard className="h-4 w-4" /> Payments
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <p className="text-xs text-muted-foreground -mt-1">
                  Your PhonePe merchant credentials — customer checkout is PhonePe-only, and payments need to land in
                  your own merchant account, not shared with any other restaurant.
                </p>
                {phonepeConfigured ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 flex-shrink-0">
                    <ShieldCheck className="h-3.5 w-3.5" /> Configured
                  </span>
                ) : (
                  <span className="text-xs font-medium text-amber-600 flex-shrink-0">Not configured</span>
                )}
              </div>
              {!phonepeConfigured && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Without these, checkout still works for testing — orders place successfully but no real charge happens.
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm">Merchant ID</Label>
                  <Input value={form.phonepeMerchantId} onChange={(e) => setField("phonepeMerchantId", e.target.value)} placeholder="PGTESTPAYUAT" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Salt Key {phonepeConfigured ? "(leave blank to keep)" : ""}</Label>
                  <Input type="password" value={form.phonepeSaltKey} onChange={(e) => setField("phonepeSaltKey", e.target.value)} placeholder={phonepeConfigured ? "••••••••" : "Salt key"} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Salt Index</Label>
                  <Input value={form.phonepeSaltIndex} onChange={(e) => setField("phonepeSaltIndex", e.target.value)} placeholder="1" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Environment</Label>
                  <div className="flex items-center gap-2 h-9">
                    <Switch checked={!form.phonepeSandbox} onCheckedChange={(v) => setField("phonepeSandbox", !v)} />
                    <span className="text-sm text-muted-foreground">{form.phonepeSandbox ? "Sandbox (test)" : "Production (live)"}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-2">
                <Timer className="h-4 w-4" /> Kitchen SLA
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground -mt-1">
                How long an order can sit in "Preparing" before Kitchen Display and Analytics flag it as slow or over SLA.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm">Warning after</Label>
                  <div className="relative">
                    <Input type="number" min={1} value={form.slaWarnMinutes}
                      onChange={(e) => setField("slaWarnMinutes", e.target.value)} className="pr-12" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">min</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Over SLA after</Label>
                  <div className="relative">
                    <Input type="number" min={1} value={form.slaCritMinutes}
                      onChange={(e) => setField("slaCritMinutes", e.target.value)} className="pr-12" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">min</span>
                  </div>
                </div>
              </div>
              {!slaValid && (
                <p className="text-xs text-red-500">The warning threshold must be less than the critical threshold.</p>
              )}
            </CardContent>
          </Card>

          <QrDownloadCard />

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

      {/* Save bar — only ever covers the Profile text fields now (Shop status /
          Fulfilment save themselves). Only rendered at all once dirty, and
          visually loud (amber, icon, non-muted copy) instead of a thin muted
          line — that quiet default was exactly why edits kept going unsaved. */}
      {dirty && (
        <div className="sticky bottom-4 mt-6 mx-auto max-w-2xl px-4 py-3 rounded-xl bg-amber-500 text-amber-950 shadow-lg shadow-amber-500/20 flex flex-wrap items-center justify-between gap-3 anim-fade-up">
          <span className="text-sm font-medium inline-flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4 flex-shrink-0" /> You have unsaved profile changes
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="bg-transparent border-amber-950/30 text-amber-950 hover:bg-amber-600/20" onClick={handleReset} disabled={saving}>
              Discard
            </Button>
            <Button size="sm" className="bg-amber-950 text-white hover:bg-amber-900 min-w-28" onClick={handleSave} disabled={saving || !slaValid || !locationValid}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
