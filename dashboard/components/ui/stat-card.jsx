import { Info } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { ChangeBadge } from "@/components/ui/change-badge"
import { Sparkline } from "@/components/ui/sparkline"

// The one KPI tile used by both Overview and Analytics, so a number means the
// same thing and looks the same wherever it appears.
//
// `current`/`previous` drive the delta badge and are deliberately separate from
// `value` — `value` is the formatted display string ("₹12,400"), the other two
// are the raw comparable numbers. `sub` should say what the baseline IS; a delta
// whose baseline you have to guess at is worse than no delta.
export function StatCard({
  title, value, icon: Icon, tint = "brand", sub, tooltip,
  current, previous, invert = false, mode = "pct",
  trend, compact = false, delay = 0,
}) {
  const pad = compact ? "p-3" : "p-5"

  return (
    <Card className="border-0 shadow-sm py-0 h-full overflow-hidden anim-fade-up" style={{ animationDelay: `${delay}ms` }} title={tooltip}>
      <CardContent className={`${pad} flex flex-col h-full`}>
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1">
            {title}
            {tooltip && <Info className="h-3 w-3 text-slate-400 flex-shrink-0" />}
          </p>
          {Icon && (
            <div className={`p-1 rounded-lg ${tint}-bg-subtle flex-shrink-0`}>
              <Icon className={`h-3.5 w-3.5 ${tint}-text`} />
            </div>
          )}
        </div>

        <div className={`flex items-baseline gap-2 flex-wrap ${compact ? "mt-1" : "mt-2"}`}>
          <p className={`${compact ? "text-xl" : "text-2xl"} font-bold text-slate-900`}>{value}</p>
          <ChangeBadge current={current} previous={previous} invert={invert} mode={mode} />
        </div>

        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}

        {trend && trend.length > 1 && (
          // Bleeds to the card edges — a sparkline inset by the card padding
          // reads as a tiny chart; edge-to-edge it reads as the tile's texture.
          <div className={`mt-auto ${compact ? "-mx-3 -mb-3 pt-2" : "-mx-5 -mb-5 pt-3"}`}>
            <Sparkline data={trend} height={compact ? 26 : 32} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
