"use client"

import { createContext, useContext, useEffect, useRef, useState } from "react"
import axios from "axios"
import { API } from "@/lib/api"
import { getAllBills, putBill } from "@/lib/billing-db"

const BillingContext = createContext(null)

const SYNC_INTERVAL_MS = 20000

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
        { ...bill.payload, idempotencyKey: bill.idempotencyKey },
        { withCredentials: true }
      )
      const synced = { ...bill, status: "synced", syncedOrder: res.data, error: null }
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

  const syncAll = async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return
    const current = await getAllBills().catch(() => [])
    const toSync = current.filter((b) => b.status === "pending" && !syncingRef.current.has(b.idempotencyKey))
    for (const bill of toSync) {
      await trySyncOne(bill)
    }
  }

  useEffect(() => {
    const onOnline = () => { setOnline(true); syncAll() }
    const onOffline = () => setOnline(false)
    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)
    const interval = setInterval(() => { if (navigator.onLine) syncAll() }, SYNC_INTERVAL_MS)
    syncAll()
    return () => {
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
      clearInterval(interval)
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

  const pendingCount = bills.filter((b) => b.status === "pending" || b.status === "syncing").length
  const failedCount = bills.filter((b) => b.status === "failed").length

  return (
    <BillingContext.Provider value={{ bills, online, createBill, retryBill, pendingCount, failedCount }}>
      {children}
    </BillingContext.Provider>
  )
}

export const useBilling = () => useContext(BillingContext)
