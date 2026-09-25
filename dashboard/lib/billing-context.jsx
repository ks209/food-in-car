"use client"

import { createContext, useContext, useEffect, useRef, useState } from "react"
import axios from "axios"
import { API } from "@/lib/api"
import { getAllBills, putBill, pruneSyncedBills } from "@/lib/billing-db"

const BillingContext = createContext(null)

const SYNC_INTERVAL_MS = 20000
// Ceiling for the backoff when the API is unreachable
const MAX_SYNC_INTERVAL_MS = 5 * 60 * 1000

function genId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID()
  // Fallback for non-secure contexts (e.g. plain-http LAN access) where
  // crypto.randomUUID is unavailable — still unique enough for a client key.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function BillingProvider({ children }) {
  const [bills, setBills] = useState([])
  const [online, setOnline] = useState(true)
  const syncingRef = useRef(new Set()) // idempotencyKeys currently in flight — avoids double-POSTing the same bill

  useEffect(() => {
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine)
    getAllBills().then(setBills).catch(() => {})
  }, [])

  const updateBill = (key, patch) => {
    setBills((prev) => prev.map((b) => (b.idempotencyKey === key ? { ...b, ...patch } : b)))
  }

  const trySyncOne = async (bill) => {
    if (syncingRef.current.has(bill.idempotencyKey)) return
    syncingRef.current.add(bill.idempotencyKey)
    updateBill(bill.idempotencyKey, { status: "syncing" })
    try {
      const res = await axios.post(
        `${API}/api/order/pos`,
        {
          ...bill.payload,
          idempotencyKey: bill.idempotencyKey,
          // When the bill was actually rung up — not when it happened to
          // sync, which can be the next morning after an overnight outage.
          createdAt: new Date(bill.createdAt).toISOString(),
        },
        { withCredentials: true }
      )
      // The server re-prices from the live menu. If the menu changed during
      // the outage, the printed receipt and the recorded order disagree —
      // flag it rather than letting the books quietly differ.
      const charged = Number(bill.payload.totalAmount)
      const recorded = Number(res.data?.totalAmount)
      const mismatch = Number.isFinite(charged) && Number.isFinite(recorded) && Math.abs(charged - recorded) >= 0.5
        ? { printed: charged, recorded }
        : null
      const synced = { ...bill, status: "synced", syncedOrder: res.data, mismatch, error: null }
      await putBill(synced)
      updateBill(bill.idempotencyKey, synced)
    } catch (err) {
      if (err.response) {
        // Server rejected it outright (bad payload, etc.) — won't succeed on blind
        // retry, surface it and let staff decide (edit & resubmit, or retry manually).
        const failed = { status: "failed", error: err.response.data?.error || "Failed to sync bill" }
        await putBill({ ...bill, ...failed })
        updateBill(bill.idempotencyKey, failed)
      } else {
        // No response at all — offline or the request never landed. Leave it
        // "pending" so the next sync pass (online event / interval) retries it.
        const pending = { status: "pending" }
        await putBill({ ...bill, ...pending })
        updateBill(bill.idempotencyKey, pending)
      }
    } finally {
      syncingRef.current.delete(bill.idempotencyKey)
    }
  }

  // navigator.onLine only says whether a network interface exists — it reports
  // "online" on café Wi-Fi with no internet, or behind a captive portal. The
  // only honest test is whether the API answers; ANY HTTP reply counts, even a
  // 401, since that still proves we reached it.
  const apiReachable = async () => {
    try {
      await axios.get(`${API}/api/config`, { timeout: 5000, withCredentials: true })
      return true
    } catch (err) {
      return !!err.response
    }
  }

  const syncAll = async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) { setOnline(false); return false }
    const current = await getAllBills().catch(() => [])
    const toSync = current.filter((b) => b.status === "pending" && !syncingRef.current.has(b.idempotencyKey))

    const reachable = await apiReachable()
    setOnline(reachable)
    if (!reachable) return false

    for (const bill of toSync) {
      await trySyncOne(bill)
    }
    return true
  }

  useEffect(() => {
    let timer
    let delay = SYNC_INTERVAL_MS

    // Backs off while the connection is down (20s → up to 5 min) instead of
    // hammering a dead network every 20 seconds, and snaps back on success.
    const tick = async () => {
      const ok = await syncAll().catch(() => false)
      delay = ok ? SYNC_INTERVAL_MS : Math.min(delay * 2, MAX_SYNC_INTERVAL_MS)
      timer = setTimeout(tick, delay)
    }

    const onOnline = () => { clearTimeout(timer); delay = SYNC_INTERVAL_MS; tick() }
    const onOffline = () => setOnline(false)
    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)
    // Coming back to the tab is the moment staff most want an accurate badge.
    document.addEventListener("visibilitychange", () => { if (!document.hidden) onOnline() })

    tick()
    pruneSyncedBills().catch(() => {})

    return () => {
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Saves the bill to IndexedDB immediately (so billing works with zero connectivity),
  // then makes a best-effort sync attempt right away — the queue picks it up later if
  // that attempt fails or there's no connection at all.
  const createBill = async (payload) => {
    const bill = {
      idempotencyKey: genId(),
      status: "pending",
      createdAt: Date.now(),
      // Printed on the receipt straight away, so a customer always leaves with
      // a numbered bill even with no connection. The server's own order number
      // arrives later on sync; both are shown after that.
      localBillNo: nextLocalBillNo(),
      payload,
      syncedOrder: null,
      error: null,
    }
    await putBill(bill)
    setBills((prev) => [bill, ...prev])
    trySyncOne(bill)
    return bill
  }

  const retryBill = async (key) => {
    const bill = bills.find((b) => b.idempotencyKey === key)
    if (!bill) return
    const pending = { ...bill, status: "pending", error: null }
    await putBill(pending)
    updateBill(key, pending)
    trySyncOne(pending)
  }

  // A bill the server rejected (bad data) can be corrected and resubmitted —
  // retrying the same payload would just fail the same way. The idempotency
  // key is kept: if the original did land server-side after all, the retry
  // returns that order instead of creating a second one.
  const reviseBill = async (key, payload) => {
    const bill = bills.find((b) => b.idempotencyKey === key)
    if (!bill) return
    const revised = { ...bill, payload, status: "pending", error: null }
    await putBill(revised)
    updateBill(key, revised)
    trySyncOne(revised)
  }

  // Last resort if a device has to be wiped or replaced with bills still queued.
  const exportBillsCsv = () => {
    const rows = [["Local bill", "Created", "Status", "Order #", "Customer", "Phone", "Vehicle", "Payment", "Amount", "Items", "Error"]]
    for (const b of bills) {
      rows.push([
        b.localBillNo || "",
        new Date(b.createdAt).toISOString(),
        b.status,
        b.syncedOrder?.dailyOrderNumber ?? b.syncedOrder?.id ?? "",
        b.payload.guestName || "",
        b.payload.mobileNumber || "",
        b.payload.guestVehicle || "",
        b.payload.paymentMethod || "",
        b.payload.totalAmount ?? "",
        (b.payload.items || []).map((i) => `${i.quantity}x ${i.name}`).join(" | "),
        b.error || "",
      ])
    }
    const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
    const link = document.createElement("a")
    link.href = url
    link.download = `bills-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const pendingCount = bills.filter((b) => b.status === "pending" || b.status === "syncing").length
  const failedCount = bills.filter((b) => b.status === "failed").length
  const mismatchCount = bills.filter((b) => b.mismatch).length

  return (
    <BillingContext.Provider value={{
      bills, online, createBill, retryBill, reviseBill, exportBillsCsv,
      pendingCount, failedCount, mismatchCount,
    }}>
      {children}
    </BillingContext.Provider>
  )
}

// Bill numbers that exist before the server sees the bill. Prefixed per device
// so two terminals billing offline can't produce the same number.
function nextLocalBillNo() {
  try {
    let device = localStorage.getItem("billingDeviceId")
    if (!device) {
      device = Math.random().toString(36).slice(2, 4).toUpperCase()
      localStorage.setItem("billingDeviceId", device)
    }
    const seq = Number(localStorage.getItem("billingSeq") || 0) + 1
    localStorage.setItem("billingSeq", String(seq))
    return `${device}-${String(seq).padStart(4, "0")}`
  } catch {
    return null // storage blocked — the server number is all there'll be
  }
}

export const useBilling = () => useContext(BillingContext)
