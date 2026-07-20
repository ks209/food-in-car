import { cn } from "@/lib/utils"

// Colored dot + neutral-text label — replaces solid colorful pill badges
// (bg-X-50 text-X-700) with a quieter, more Linear/Stripe-like indicator.
export function StatusDot({ color, children, className }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium text-foreground/80", className)}>
      <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      {children}
    </span>
  )
}
