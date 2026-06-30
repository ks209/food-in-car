/** @type {import('next').NextConfig} */

// Where the Express backend lives. The browser never talks to it directly — Next
// proxies /api/* here server-side so the dashboard can run over https (LAN/phone)
// without mixed-content issues. Override for LAN: BACKEND_ORIGIN=http://<host>:5000
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN || "http://localhost:5000"

const nextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${BACKEND_ORIGIN}/api/:path*` },
    ]
  },
}

export default nextConfig
