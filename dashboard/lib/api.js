// Dashboard API base.
//
// Defaults to "" (same-origin): the browser calls /api/* on the dashboard's own
// origin, and Next.js rewrites (see next.config.mjs) proxy that to the backend
// server-side. This lets the dashboard run over https on a phone/LAN (needed for
// the camera QR scanner) without mixed-content blocks or "localhost" pointing at
// the phone itself.
//
// For LAN/https use, set BACKEND_ORIGIN (server env) to the machine running the
// backend, e.g. BACKEND_ORIGIN=http://192.168.1.20:5000, and run `npm run dev:https`.
export const API = process.env.NEXT_PUBLIC_API_BASE || ""
