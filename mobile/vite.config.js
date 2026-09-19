import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  // 127.0.0.1 (not localhost) — Firebase phone-auth reCAPTCHA rejects localhost
  server: { host: "127.0.0.1", port: 5174, proxy: { "/api": "http://localhost:5000" } },
})
