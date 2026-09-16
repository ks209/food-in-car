// Mirrors backend/utils/gst.js so the cart shows exactly what checkout charges.

const round2 = (n) => Math.round(n * 100) / 100

export function orderGst(restaurant, subtotal) {
  const sub = round2(subtotal)
  if (!restaurant?.gstin || !(Number(restaurant?.gstRate) > 0)) {
    return { subtotal: sub, rate: 0, gstAmount: 0, inclusive: true, total: sub }
  }
  const rate = Number(restaurant.gstRate)
  const inclusive = restaurant.pricesIncludeGst !== false
  const gstAmount = inclusive ? round2(sub - sub / (1 + rate / 100)) : round2((sub * rate) / 100)
  return { subtotal: sub, rate, gstAmount, inclusive, total: inclusive ? sub : round2(sub + gstAmount) }
}

export const rupees = (n) => `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
