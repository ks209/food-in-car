import { ArrowUp, ArrowDown, Minus } from "lucide-react"
import { cn } from "@/lib/utils"
import { pctChange, pointChange } from "@/lib/compare"

// `invert`: for metrics where going DOWN is the good direction (prep time,
// cancellation rate) — the arrow still shows the real trend, only the colour flips.
// `mode="pts"`: current/previous are themselves percentages, so the delta is
// reported in percentage points rather than as a relative change (see pointChange).
export function ChangeBadge({ current, previous, invert = false, mode = "pct", className }) {
  const raw = mode === "pts" ? pointChange(current, previous) : pctChange(current, previous)
  if (raw === null) return null

  const base = "inline-flex items-center gap-0.5 text-xs font-semibold"
  const suffix = mode === "pts" ? " pts" : "%"

  if (raw === Infinity) {
    return (
      <span className={cn(base, invert ? "text-red-500" : "text-emerald-600", className)}>
        <ArrowUp className="h-3 w-3" /> New
      </span>
    )
  }

  const rounded = Math.round(raw)
  if (rounded === 0) {
    return (
      <span className={cn(base, "text-slate-400", className)}>
        <Minus className="h-3 w-3" /> 0{suffix}
      </span>
    )
  }

  const positive = rounded > 0
  const good = invert ? !positive : positive
  const Icon = positive ? ArrowUp : ArrowDown
  return (
    <span className={cn(base, good ? "text-emerald-600" : "text-red-500", className)}>
      <Icon className="h-3 w-3" /> {Math.abs(rounded)}{suffix}
    </span>
  )
}
