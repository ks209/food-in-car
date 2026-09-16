"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Store, Car, Paintbrush, Power, AlertCircle, Timer, MapPin, CreditCard, ShieldCheck, Clock, Landmark, Scale } from "lucide-react"
import { formatTime12, parseTime } from "@/lib/business-day"
import Link from "next/link"
import { toast } from "sonner"
import axios from "axios"
import { API } from "@/lib/api"
import { QrDownloadCard } from "@/components/qr-download"
import { ParkingSpotsCard } from "@/components/parking-spots-card"
import { useRefreshRestaurant } from "@/lib/restaurant-context"

export function RestaurantSettings() {
  const refreshRestaurant = useRefreshRestaurant()
  const [form, setForm] = useState(null)
  const [original, setOriginal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [savingKey, setSavingKey] = useState(null)
  const [cities, setCities] = useState([])
  const [phonepeConfigured, setPhonepeConfigured] = useState(false)
  // Origin of the customer-facing ordering app, taken from the server-built
  // orderingUrl rather than guessed — the dashboard and the ordering app are
  // deployed on different hosts.
  const [publicOrigin, setPublicOrigin] = useState("")

  useEffect(() => {
    axios
      .get(`${API}/api/restaurant/me`, { withCredentials: true })
      .then((r) => {
        const data = {
          name: r.data.name || "",
          slug: r.data.slug || "",
          phone: r.data.phone || "",
          address: r.data.address || "",
          logoUrl: r.data.logoUrl || "",
          pickupEnabled: r.data.pickupEnabled ?? false,
          deliveryEnabled: r.data.deliveryEnabled ?? true,
          isOpen: r.data.isOpen ?? true,
          slaWarnMinutes: r.data.slaWarnMinutes ?? 8,
          slaCritMinutes: r.data.slaCritMinutes ?? 15,
          openingTime: r.data.openingTime || "",
          closingTime: r.data.closingTime || "",
          gstin: r.data.gstin || "",
          gstRate: String(r.data.gstRate ?? 0),
          fssaiLicense: r.data.fssaiLicense || "",
          legalName: r.data.legalName || "",
          supportEmail: r.data.supportEmail || "",
          supportPhone: r.data.supportPhone || "",
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
        try { setPublicOrigin(new URL(r.data.orderingUrl).origin) } catch { /* keep the placeholder */ }
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
    if (!slugValid) { toast.error("That web address isn't valid — use lowercase letters, numbers and hyphens"); return }
    if (!sellerValid) { toast.error("Check the Business & legal section — support email or phone isn't valid"); return }
    if (!taxValid) { toast.error("Check the Tax & compliance section — GSTIN, GST rate or FSSAI number isn't valid"); return }
    if (!hoursValid) { toast.error("Set both opening and closing time (and make them different), or leave both blank"); return }
    setSaving(true)
    try {
      const payload = {
        name: form.name,
        slug: form.slug,
        phone: form.phone,
        address: form.address,
        logoUrl: form.logoUrl,
        slaWarnMinutes: Number(form.slaWarnMinutes),
        slaCritMinutes: Number(form.slaCritMinutes),
        openingTime: form.openingTime || null,
        closingTime: form.closingTime || null,
        gstin: form.gstin,
        gstRate: Number(form.gstRate),
        fssaiLicense: form.fssaiLicense,
        legalName: form.legalName,
        supportEmail: form.supportEmail,
        supportPhone: form.supportPhone,
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
      // The ordering QR code below renders from the shared context's
      // orderingUrl — re-read it so a changed web address shows up immediately
      // instead of on the next page load.
      refreshRestaurant()
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
  // Mirrors validateSlug in backend/utils/slug.js — blank is allowed (means
  // "no vanity URL"), and an all-numeric slug is not, since the API reads a
  // numeric path segment as a restaurant id before it ever looks up a slug.
  const slugValid = form.slug === "" || (
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug) &&
    form.slug.length >= 2 && form.slug.length <= 50 &&
    !/^\d+$/.test(form.slug)
  )

  const slaValid = Number(form.slaWarnMinutes) >= 1 && Number(form.slaCritMinutes) >= 1 && Number(form.slaWarnMinutes) < Number(form.slaCritMinutes)
  const hoursValid = (form.openingTime === "" && form.closingTime === "") ||
    (parseTime(form.openingTime) !== null && parseTime(form.closingTime) !== null && form.openingTime !== form.closingTime)
  const closesAfterMidnight = hoursValid && form.openingTime !== "" && parseTime(form.closingTime) < parseTime(form.openingTime)
  // Mirrors backend/utils/gst.js validation.
  const gstinValid = form.gstin === "" || /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(form.gstin)
  const fssaiValid = form.fssaiLicense === "" || /^\d{14}$/.test(form.fssaiLicense)
  const gstNeedsGstin = Number(form.gstRate) > 0 && form.gstin === ""
  const taxValid = gstinValid && fssaiValid && !gstNeedsGstin
  // Mirrors the backend checks in routes/restaurant/restaurant.js.
  const supportEmailValid = form.supportEmail === "" || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.supportEmail)
  const supportPhoneValid = form.supportPhone === "" || /^\+?\d{10,13}$/.test(form.supportPhone.replace(/\s/g, ""))
  const sellerValid = supportEmailValid && supportPhoneValid
  const sellerComplete = !!form.legalName && !!form.supportEmail && !!form.supportPhone
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
              <div className="space-y-1.5">
                <Label className="text-sm">Web address</Label>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-muted-foreground flex-shrink-0">{publicOrigin || "…"}/</span>
                  <Input value={form.slug} onChange={(e) => setField("slug", e.target.value.toLowerCase())}
                    placeholder="spice-garden" className="flex-1" />
                </div>
                <p className="text-xs text-muted-foreground">
                  Your public ordering link and QR code. Lowercase letters, numbers and hyphens.
                  {" "}Leave blank to use the numeric address instead.
                </p>
                {!slugValid && (
                  <p className="text-xs text-red-500">
                    Use 2–50 lowercase letters, numbers and hyphens — and not numbers alone.
                  </p>
                )}
                {form.slug !== original?.slug && slugValid && (
                  <p className="text-xs text-amber-600">
                    Changing this breaks any QR code or link already printed with the old address.
                  </p>
                )}
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
                <Clock className="h-4 w-4" /> Opening hours
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground -mt-1">
                Customers can only order between these times, and your dashboard day follows them — order numbers
                and “Today” don’t reset at midnight while you’re still open. Leave both blank to always accept orders.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm">Opens at</Label>
                  <Input type="time" value={form.openingTime} onChange={(e) => setField("openingTime", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Closes at</Label>
                  <Input type="time" value={form.closingTime} onChange={(e) => setField("closingTime", e.target.value)} />
                </div>
              </div>
              {!hoursValid ? (
                <p className="text-xs text-red-500">Set both times (and make them different), or leave both blank.</p>
              ) : closesAfterMidnight ? (
                <p className="text-xs text-muted-foreground">
                  Closes after midnight — orders until {formatTime12(form.closingTime)} count towards the previous day.
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                After closing, Kitchen Display reminds you about any orders still open. The Shop status switch above can still close you early.
              </p>
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
                  <Label className="text-sm">Served in car</Label>
                  <p className="text-xs text-muted-foreground">
                    Customers can order to their parked car with a vehicle number.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                  {savingKey === "deliveryEnabled" && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  <Switch
                    checked={form.deliveryEnabled}
                    onCheckedChange={(v) => saveInstant("deliveryEnabled", v, v ? "Served in car enabled" : "Served in car disabled")}
                    disabled={savingKey === "deliveryEnabled" || (form.deliveryEnabled && !form.pickupEnabled)}
                  />
                </div>
              </div>
              {!form.pickupEnabled && !form.deliveryEnabled && (
                <p className="text-xs text-red-500">At least one fulfilment option must stay enabled.</p>
              )}
            </CardContent>
          </Card>

          <ParkingSpotsCard deliveryEnabled={form.deliveryEnabled} />

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
                <Scale className="h-4 w-4" /> Business &amp; legal
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground -mt-1">
                You are the seller for your orders — payments go to your own PhonePe account. These details appear on
                your Privacy, Terms and Refund pages, which payment gateways check during onboarding.
              </p>
              <div className="space-y-1.5">
                <Label className="text-sm">Registered business name</Label>
                <Input value={form.legalName} placeholder="e.g. Spice Garden Foods Pvt Ltd"
                  onChange={(e) => setField("legalName", e.target.value)} />
                <p className="text-xs text-muted-foreground">As on your GST/PhonePe registration. Leave blank to use your display name.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm">Support email</Label>
                  <Input type="email" value={form.supportEmail} placeholder="support@yourrestaurant.in"
                    onChange={(e) => setField("supportEmail", e.target.value.trim())} />
                  {!supportEmailValid && <p className="text-xs text-red-500">Enter a valid email address</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Support phone</Label>
                  <Input value={form.supportPhone} placeholder="+91 98200 11111"
                    onChange={(e) => setField("supportPhone", e.target.value.replace(/[^\d+ ]/g, ""))} />
                  {!supportPhoneValid && <p className="text-xs text-red-500">10-13 digits, optionally with +91</p>}
                </div>
              </div>
              {!sellerComplete && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Fill all three in before applying to PhonePe — your policy pages show a warning until then.
                </p>
              )}
              {publicOrigin && (
                <p className="text-xs text-muted-foreground">
                  Your policy pages:{" "}
                  <a href={`${publicOrigin}/${form.slug || ""}/legal/refunds`} target="_blank" rel="noreferrer" className="underline">
                    {publicOrigin}/{form.slug || "<web address>"}/legal/refunds
                  </a>{" "}(also /legal/terms and /legal/privacy)
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="border-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-2">
                <Landmark className="h-4 w-4" /> Tax &amp; compliance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground -mt-1">
                Shown on your menu and printed on every bill. GST is only charged when a GSTIN is set.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm">GSTIN</Label>
                  <Input value={form.gstin} maxLength={15} placeholder="27AAPFU0939F1ZV"
                    onChange={(e) => setField("gstin", e.target.value.toUpperCase().replace(/\s+/g, ""))} />
                  {!gstinValid && <p className="text-xs text-red-500">15 characters, e.g. 27AAPFU0939F1ZV</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">FSSAI licence number</Label>
                  <Input value={form.fssaiLicense} maxLength={14} inputMode="numeric" placeholder="14-digit number"
                    onChange={(e) => setField("fssaiLicense", e.target.value.replace(/\D/g, ""))} />
                  {!fssaiValid && <p className="text-xs text-red-500">Must be 14 digits</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">GST rate</Label>
                  <Select value={form.gstRate} onValueChange={(v) => setField("gstRate", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["0", "5", "12", "18"].map((r) => (
                        <SelectItem key={r} value={r}>{r === "0" ? "No GST" : `${r}%`}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {gstNeedsGstin && <p className="text-xs text-red-500">Add your GSTIN to charge GST</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Menu prices</Label>
                  {/* Not a choice any more — prices always include GST, so what a
                      customer sees on the menu is what they pay. */}
                  <div className="flex items-center h-9">
                    <span className="text-sm text-muted-foreground">Always include GST</span>
                  </div>
                </div>
              </div>
              {Number(form.gstRate) > 0 && form.gstin && (
                <p className="text-xs text-muted-foreground rounded-lg border border-border px-3 py-2">
                  Example: a ₹100 item — customer pays ₹100; the bill shows
                  {" "}₹{(100 / (1 + Number(form.gstRate) / 100)).toFixed(2)} + GST ₹{(100 - 100 / (1 + Number(form.gstRate) / 100)).toFixed(2)}.
                  {" "}Bills show it as CGST + SGST. Check the correct rate for your business with your accountant.
                </p>
              )}
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
            <AlertCircle className="h-4 w-4 flex-shrink-0" /> You have unsaved changes
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="bg-transparent border-amber-950/30 text-amber-950 hover:bg-amber-600/20" onClick={handleReset} disabled={saving}>
              Discard
            </Button>
            <Button size="sm" className="bg-amber-950 text-white hover:bg-amber-900 min-w-28" onClick={handleSave} disabled={saving || !slaValid || !locationValid || !slugValid || !hoursValid || !taxValid || !sellerValid}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
