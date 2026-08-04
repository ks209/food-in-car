"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Check, Loader2, Palette, Type, Square, Image as ImageIcon } from "lucide-react"
import { toast } from "sonner"
import axios from "axios"
import { API } from "@/lib/api"

const PRESETS = ["#f97316", "#ef4444", "#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#14b8a6", "#eab308"]

// Deliberately distinct registers — no two entries should look alike at a
// glance. ("Outfit" used to sit here alongside Manrope; dropped for being
// nearly indistinguishable from it.)
const FONTS = [
  { key: "manrope", label: "Manrope", stack: "'Manrope', sans-serif" },
  { key: "inter", label: "Inter", stack: "'Inter', sans-serif" },
  { key: "poppins", label: "Poppins", stack: "'Poppins', sans-serif" },
  { key: "playfair", label: "Playfair", stack: "'Playfair Display', serif" },
  { key: "spacegrotesk", label: "Space Grotesk", stack: "'Space Grotesk', sans-serif" },
  { key: "fraunces", label: "Fraunces", stack: "'Fraunces', serif" },
]

// React 19 hoists <link> tags rendered anywhere in the tree into <head> (deduped
// by href) — scoping the Google Fonts request to this page instead of loading
// it site-wide from the root layout for a preview only this page uses.
const FONTS_STYLESHEET_HREF =
  "https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Inter:wght@400;500;600;700&family=Poppins:wght@400;500;600;700;800&family=Playfair+Display:wght@500;600;700;800&family=Space+Grotesk:wght@500;600;700&family=Fraunces:wght@500;600;700&display=swap"

function ColorPicker({ label, value, onChange }) {
  return (
    <div className="space-y-3">
      <Label className="text-sm">{label}</Label>
      <div className="flex flex-wrap gap-2.5">
        {PRESETS.map((hex) => {
          const active = value?.toLowerCase() === hex.toLowerCase()
          return (
            <button
              key={hex}
              onClick={() => onChange(hex)}
              className={`h-8 w-8 rounded-full flex items-center justify-center transition-transform hover:scale-110 ${active ? "ring-2 ring-offset-2 ring-offset-card" : ""}`}
              style={{ backgroundColor: hex, "--tw-ring-color": hex }}
              title={hex}
            >
              {active && <Check className="h-3.5 w-3.5 text-white" />}
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-11 rounded-md bg-transparent border border-border cursor-pointer"
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="w-32 font-mono uppercase text-sm" maxLength={7} />
      </div>
    </div>
  )
}

export function CustomizeUI() {
  const [form, setForm] = useState(null)
  const [original, setOriginal] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    axios
      .get(`${API}/api/restaurant/me`, { withCredentials: true })
      .then((r) => {
        const data = {
          themeColor: r.data.themeColor || "#f97316",
          secondaryColor: r.data.secondaryColor || "#7c3aed",
          accentColor: r.data.accentColor || "#f59e0b",
          fontFamily: r.data.fontFamily || "manrope",
          cardStyle: r.data.cardStyle || "rounded",
          coverUrl: r.data.coverUrl || "",
        }
        setForm(data)
        setOriginal(data)
      })
      .catch(() => toast.error("Failed to load customization settings"))
  }, [])

  const setField = (k, v) => setForm((p) => ({ ...p, [k]: v }))
  const dirty = original && JSON.stringify(form) !== JSON.stringify(original)

  const handleSave = async () => {
    setSaving(true)
    try {
      await axios.put(`${API}/api/restaurant/me`, form, { withCredentials: true })
      setOriginal(form)
      toast.success("Customization saved")
    } catch {
      toast.error("Failed to save")
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => setForm(original)

  // Hoisted into <head> by React 19; requested once whether or not `form` has
  // loaded yet, so the "Aa" cards below render in their real typeface from the
  // first paint instead of a system-font fallback.
  const fontLinks = (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={FONTS_STYLESHEET_HREF} />
    </>
  )

  if (!form) {
    return (
      <>
        {fontLinks}
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      </>
    )
  }

  const activeFont = FONTS.find((f) => f.key === form.fontFamily) || FONTS[0]
  const previewRadius = form.cardStyle === "sharp" ? "4px" : "16px"

  return (
    <div className="max-w-5xl">
      {fontLinks}
      <div className="mb-6">
        <h2 className="text-lg font-semibold tracking-tight">Customize your UI</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Brand the customer-facing mobile menu — colors, font, card style, and hero image.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-2">
                <Palette className="h-4 w-4" /> Colors
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <ColorPicker label="Primary" value={form.themeColor} onChange={(v) => setField("themeColor", v)} />
              <ColorPicker label="Secondary" value={form.secondaryColor} onChange={(v) => setField("secondaryColor", v)} />
              <ColorPicker label="Accent" value={form.accentColor} onChange={(v) => setField("accentColor", v)} />
            </CardContent>
          </Card>

          <Card className="border-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-2">
                <Type className="h-4 w-4" /> Font
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {FONTS.map((f) => {
                  const active = form.fontFamily === f.key
                  return (
                    <button
                      key={f.key}
                      onClick={() => setField("fontFamily", f.key)}
                      className={`rounded-lg border p-3 text-left transition-colors ${active ? "border-primary bg-accent" : "border-border hover:bg-accent/50"}`}
                    >
                      <p className="text-xl" style={{ fontFamily: f.stack }}>Aa</p>
                      <p className="text-xs text-muted-foreground mt-1">{f.label}</p>
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="border-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-2">
                <Square className="h-4 w-4" /> Card style
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2.5 max-w-xs">
                {[{ key: "rounded", label: "Rounded", radius: "14px" }, { key: "sharp", label: "Sharp", radius: "3px" }].map((s) => {
                  const active = form.cardStyle === s.key
                  return (
                    <button
                      key={s.key}
                      onClick={() => setField("cardStyle", s.key)}
                      className={`rounded-lg border p-3 flex flex-col items-center gap-2 transition-colors ${active ? "border-primary bg-accent" : "border-border hover:bg-accent/50"}`}
                    >
                      <div className="h-8 w-14 bg-slate-300 dark:bg-slate-600" style={{ borderRadius: s.radius }} />
                      <p className="text-xs text-muted-foreground">{s.label}</p>
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="border-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-2">
                <ImageIcon className="h-4 w-4" /> Hero image
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              <Label className="text-sm">Cover image URL</Label>
              <Input value={form.coverUrl} onChange={(e) => setField("coverUrl", e.target.value)} placeholder="https://…/cover.jpg" />
              <p className="text-xs text-muted-foreground">Shown behind your logo at the top of the mobile menu page.</p>
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
              <div
                className="h-20 -mx-6 -mt-2 mb-2 bg-cover bg-center flex items-end p-3"
                style={{
                  backgroundImage: form.coverUrl
                    ? `linear-gradient(rgba(0,0,0,0.15), rgba(0,0,0,0.35)), url(${form.coverUrl})`
                    : `linear-gradient(135deg, ${form.themeColor}, ${form.secondaryColor})`,
                }}
              >
                <span className="text-white font-semibold text-sm" style={{ fontFamily: activeFont.stack }}>Your Restaurant</span>
              </div>

              <div className="border p-3 space-y-2" style={{ borderRadius: previewRadius, borderColor: "var(--border)" }}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground" style={{ fontFamily: activeFont.stack }}>Margherita Pizza</span>
                  <span className="font-semibold">₹249</span>
                </div>
                <Button className="w-full text-white" style={{ backgroundColor: form.themeColor, borderRadius: previewRadius }}>
                  Add to cart
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: form.secondaryColor, borderRadius: previewRadius }}>Popular</span>
                <span className="px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: form.accentColor, borderRadius: previewRadius }}>New</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Save bar */}
      <div className="sticky bottom-0 mt-6 -mx-4 sm:-mx-8 px-4 sm:px-8 py-4 bg-background/80 backdrop-blur-md border-t border-border flex flex-wrap items-center justify-end gap-3">
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
