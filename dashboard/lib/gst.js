// Mirrors backend/utils/gst.js — the POS screen shows the same breakdown the
// server stores on the bill.
//
// Menu prices always include GST: the tax is backed out for display, never
// added on top, so `total` is always the menu subtotal.

const round2 = (n) => Math.round(n * 100) / 100

export function gstApplies(restaurant) {
  return !!restaurant?.gstin && Number(restaurant?.gstRate) > 0
}

export function orderGst(restaurant, subtotal) {
  const sub = round2(subtotal)
  if (!gstApplies(restaurant)) return { subtotal: sub, rate: 0, gstAmount: 0, inclusive: true, total: sub }
  const rate = Number(restaurant.gstRate)
  return { subtotal: sub, rate, gstAmount: round2(sub - sub / (1 + rate / 100)), inclusive: true, total: sub }
}
