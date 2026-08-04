// IndexedDB-backed local store for offline billing. Bills are written here first —
// before any network request — so billing keeps working with no connection at all;
// the sync engine (billing-context.jsx) drains this queue once online.

const DB_NAME = "carkhanaa-billing"
const DB_VERSION = 1
const BILLS_STORE = "bills"
const MENU_STORE = "menuCache"

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(BILLS_STORE)) {
        db.createObjectStore(BILLS_STORE, { keyPath: "idempotencyKey" })
      }
      if (!db.objectStoreNames.contains(MENU_STORE)) {
        db.createObjectStore(MENU_STORE, { keyPath: "restaurantId" })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function putBill(bill) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BILLS_STORE, "readwrite")
    tx.objectStore(BILLS_STORE).put(bill)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getAllBills() {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BILLS_STORE, "readonly")
    const req = tx.objectStore(BILLS_STORE).getAll()
    req.onsuccess = () => resolve(req.result.sort((a, b) => b.createdAt - a.createdAt))
    req.onerror = () => reject(req.error)
  })
}

export async function cacheMenu(restaurantId, items) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MENU_STORE, "readwrite")
    tx.objectStore(MENU_STORE).put({ restaurantId, items, cachedAt: Date.now() })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getCachedMenu(restaurantId) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MENU_STORE, "readonly")
    const req = tx.objectStore(MENU_STORE).get(restaurantId)
    req.onsuccess = () => resolve(req.result?.items || [])
    req.onerror = () => reject(req.error)
  })
}
