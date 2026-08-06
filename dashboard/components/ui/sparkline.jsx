"use client"

import { useId } from "react"

// A bare trend line — no axes, no grid, no tooltip. Hand-rolled SVG rather than
// Recharts: these render one per KPI tile, and a ResponsiveContainer each would
// cost a ResizeObserver + layout pass apiece for ~30px of pixels.
//
// The viewBox is stretched to the container (preserveAspectRatio="none"), which
// would normally distort the stroke too — vectorEffect keeps it a constant width.
export function Sparkline({ data, color = "var(--brand, #f97316)", height = 30, className }) {
  // useId() contains ":" in React 18, which breaks a url(#id) reference
  const gradientId = `spark-${useId().replace(/:/g, "")}`

  const points = (data || []).filter((v) => typeof v === "number" && Number.isFinite(v))
  // One point can't make a line, and an all-flat series would divide by zero below
  if (points.length < 2) return <div style={{ height }} className={className} aria-hidden />

  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const W = 100
  const H = 100
  const stepX = W / (points.length - 1)

  const coords = points.map((v, i) => [i * stepX, H - ((v - min) / span) * H])
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ")
  const area = `${line} L${W} ${H} L0 ${H} Z`

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ height }}
      className={className ? `w-full ${className}` : "w-full"}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.75} vectorEffect="non-scaling-stroke"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
