// Mirrors backend/utils/gst.js so the cart shows exactly what checkout charges.
//
// Menu prices always include GST: the tax is backed out for display, never
// added on top, so `total` is always the menu subtotal. Keep this in step with
// the backend — a mismatch means the cart quotes a price checkout won't honour.

const round2 = (n) => Math.round(n * 100) / 100

export function orderGst(restaurant, subtotal) {
  const sub = round2(subtotal)
  if (!restaurant?.gstin || !(Number(restaurant?.gstRate) > 0)) {
    return { subtotal: sub, rate: 0, gstAmount: 0, inclusive: true, total: sub }
  }
  const rate = Number(restaurant.gstRate)
  return { subtotal: sub, rate, gstAmount: round2(sub - sub / (1 + rate / 100)), inclusive: true, total: sub }
}

export const rupees = (n) => `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
