// Great-circle distance, in JS. The SQL equivalent is inlined in the listing
// queries (see restaurant.js's /nearby and venue.js) because those need to sort
// and filter on it in the database; this one is for the cases where the rows are
// already in hand and a venue's worth of restaurants is a few dozen at most.

export const EARTH_RADIUS_KM = 6371;

// Kilometres between two points, or null when either is missing coordinates —
// a restaurant with no lat/lng is "distance unknown", never distance zero.
export function haversineKm(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some((v) => v === null || v === undefined || !Number.isFinite(Number(v)))) {
    return null;
  }
  const toRad = (d) => (Number(d) * Math.PI) / 180;
  const dLat = toRad(lat2) - toRad(lat1);
  const dLng = toRad(lng2) - toRad(lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  // clamp guards the sqrt against floating-point overshoot at antipodal points
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

// True when lat/lng are both present and in range. Mirrors the guard
// restaurant.js /nearby applies to its query params.
export function validCoords(lat, lng) {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
  );
}
