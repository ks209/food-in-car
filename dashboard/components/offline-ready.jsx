"use client"

import { useEffect } from "react"

// Registers the offline shell (public/sw.js) and asks the browser not to evict
// our storage. Both matter only for offline billing: without the service
// worker the dashboard can't even load during an outage, and without
// persistent storage the browser may clear IndexedDB — taking unsynced bills
// with it — when the device is low on space.
export function OfflineReady() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Unsupported or blocked (e.g. plain-http LAN access) — the app still
        // works, it just won't survive a reload while offline.
      })
    }
    // Best-effort: Chrome grants this silently for installed/engaged sites.
    navigator.storage?.persist?.().catch(() => {})
  }, [])

  return null
}
