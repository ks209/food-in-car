// Platform-level details for the policy pages.
//
// Carkhanaa is the platform; each restaurant is the seller and merchant of
// record (payments go to its own PhonePe account). So a restaurant's pages
// (/<slug>/legal/…) name that restaurant as the seller and use its support
// contact, while the grievance officer below stays the platform's for all of
// them. The /legal/… pages use only what's here.
//
// ⚠️  FILL THESE IN BEFORE GOING LIVE. Every value in [square brackets] is a
// placeholder, and the pages show a visible warning until none remain.

export const BUSINESS = {
  brand: "Carkhanaa",
  legalName: "Proprieter Kartik Singla",
  address: "256, TF Dayanand Vihar Delhi",
  email: "singlakartik20@gmail.com",
  phone: "+91 9157 345484",
  grievanceOfficer: "MR. Dhiraj Kumar",
  grievanceEmail: "hello@carkhanaa.in",
  jurisdiction: "Delhi, India",
  lastUpdated: "16 September 2026",
}

export const hasPlaceholders = () => Object.values(BUSINESS).some((v) => /\[.*\]/.test(v))

// The seller shown on a policy page: the restaurant when opened from its own
// pages, otherwise the platform. Falls back field by field, so a restaurant
// that hasn't filled in its details yet still gets a complete page.
export function sellerFrom(restaurant) {
  if (!restaurant) {
    return { isRestaurant: false, name: BUSINESS.legalName, tradeName: BUSINESS.brand, address: BUSINESS.address, email: BUSINESS.email, phone: BUSINESS.phone, gstin: null, fssai: null, incomplete: hasPlaceholders() }
  }
  const name = restaurant.legalName || restaurant.name
  return {
    isRestaurant: true,
    name,
    tradeName: restaurant.name || name,
    address: restaurant.address || BUSINESS.address,
    email: restaurant.supportEmail || BUSINESS.email,
    phone: restaurant.supportPhone || restaurant.phone || BUSINESS.phone,
    gstin: restaurant.gstin || null,
    fssai: restaurant.fssaiLicense || null,
    // Details a payment gateway will look for before approving the merchant.
    incomplete: !restaurant.legalName || !restaurant.supportEmail || !restaurant.supportPhone,
  }
}
