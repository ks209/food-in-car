/** @type {import('next').NextConfig} */

// Where the Express backend lives. The browser never talks to it directly — Next
// proxies /api/* here server-side so the dashboard can run over https (LAN/phone)
// without mixed-content issues. Override for LAN: BACKEND_ORIGIN=http://<host>:5000
//
// .env is gitignored, so it never reaches Vercel — fall back to the production API
// when building/running on Vercel (VERCEL=1 is set automatically), else localhost.
const BACKEND_ORIGIN =
  process.env.BACKEND_ORIGIN ||
  (process.env.VERCEL ? "https://api.carkhanaa.in" : "http://localhost:5000")

const nextConfig = {
  // "standalone" builds a self-contained Node server for LAN/self-hosting. Vercel
  // ships its own serverless output, where standalone is redundant and can break
  // the deploy — so only enable it when we're NOT building on Vercel.
  ...(process.env.VERCEL ? {} : { output: "standalone" }),
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${BACKEND_ORIGIN}/api/:path*` },
    ]
  },
}

export default nextConfig
