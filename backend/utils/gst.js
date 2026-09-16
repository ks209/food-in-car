// GST for restaurant orders (India).
//
// A restaurant charges GST only when it has a GSTIN and a rate above 0.
//
// Menu prices ALWAYS include GST — the tax is split out for display on the
// bill, never added on top at checkout, so the price a customer sees on the
// menu is the price they pay. Restaurants used to be able to choose; the
// exclusive option was removed, and `Restaurant.pricesIncludeGst` is now
// vestigial (nothing reads it). `Order.pricesIncludeGst` stays, because it is a
// snapshot of how an already-placed order was actually taxed.
//
// For an intra-state sale the tax is shown as CGST + SGST, half each.

export const GST_RATES = [0, 5, 12, 18];

// 2-digit state code, 10-char PAN, entity number, "Z", checksum character.
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const FSSAI_RE = /^\d{14}$/;

const round2 = (n) => Math.round(n * 100) / 100;

// `pricesIncludeGst` is deliberately NOT accepted — prices are always inclusive,
// so a caller sending it is ignored rather than allowed to change anything.
export function validateTaxSettings({ gstin, gstRate, fssaiLicense }, existing = {}) {
  const data = {};

  if (gstin !== undefined) {
    const v = (gstin || '').trim().toUpperCase();
    if (v && !GSTIN_RE.test(v)) return { ok: false, message: 'GSTIN must be 15 characters, e.g. 27AAPFU0939F1ZV' };
    data.gstin = v || null;
  }
  if (gstRate !== undefined) {
    const rate = Number(gstRate);
    if (!GST_RATES.includes(rate)) return { ok: false, message: `GST rate must be one of ${GST_RATES.join(', ')}%` };
    data.gstRate = rate;
  }
  if (fssaiLicense !== undefined) {
    const v = (fssaiLicense || '').replace(/\s+/g, '');
    if (v && !FSSAI_RE.test(v)) return { ok: false, message: 'FSSAI licence number must be 14 digits' };
    data.fssaiLicense = v || null;
  }

  const nextGstin = data.gstin !== undefined ? data.gstin : existing.gstin;
  const nextRate = data.gstRate !== undefined ? data.gstRate : existing.gstRate;
  if (nextRate > 0 && !nextGstin) return { ok: false, message: 'Add your GSTIN before charging GST' };

  return { ok: true, data };
}

export function gstApplies(restaurant) {
  return !!restaurant?.gstin && Number(restaurant?.gstRate) > 0;
}

// Splits/adds GST for an order whose menu-price subtotal is `subtotal`.
// Returns the fields stored on the Order (a snapshot) plus `totalAmount`, the
// amount actually charged.
export function orderGst(restaurant, subtotal) {
  const sub = round2(subtotal);
  if (!gstApplies(restaurant)) {
    return { subtotalAmount: sub, gstRate: null, gstAmount: null, gstin: null, pricesIncludeGst: null, totalAmount: sub };
  }
  const rate = Number(restaurant.gstRate);
  // Inclusive: the menu price already contains the tax, so it is backed out for
  // display rather than added. The customer pays exactly the menu subtotal —
  // totalAmount === subtotalAmount by definition.
  const gstAmount = round2(sub - sub / (1 + rate / 100));
  return {
    subtotalAmount: sub,
    gstRate: rate,
    gstAmount,
    gstin: restaurant.gstin,
    pricesIncludeGst: true,
    totalAmount: sub,
  };
}
