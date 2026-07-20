import { cn } from "@/lib/utils"

// Colored dot on a tinted pill background — a middle ground between the flat
// muted-dot treatment and the old solid bg-X-50/text-X-700 per-status classes:
// still one consistent shape everywhere, but reads as colorful at a glance.
export function StatusDot({ color, children, className }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium", className)}
      style={{ backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
    >
      <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      {children}
    </span>
  )
}
