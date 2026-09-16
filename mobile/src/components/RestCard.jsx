import { Link } from "react-router-dom"
import { MapPin, Star, UtensilsCrossed } from "lucide-react"

// Pulled out of HomePage when venue pages were added — the home list and a
// venue's outlet list render identical cards, and /api/venue/:slug/restaurants
// deliberately returns the same projection as /api/restaurant/nearby so this
// component works against either without a translation layer.

export function formatDistance(km) {
  if (km == null) return null
  if (km < 1) return `${Math.round(km * 1000)} m away`
  // A tenth of a kilometre stops meaning anything once you are into double
  // digits — "837.0 km away" reads like a bug. Searches are uncapped (and a
  // venue in another state is a normal search result), so this range is
  // reached routinely, not just in edge cases.
  if (km < 10) return `${km.toFixed(1)} km away`
  return `${Math.round(km)} km away`
}

export function SkeletonRestCard() {
  return (
    <div className="rest-card card">
      <div className="skeleton rest-card-cover" />
      <div className="rest-card-body">
        <div className="skeleton" style={{ height: 18, width: "70%" }} />
        <div className="skeleton" style={{ height: 12, width: "50%", marginTop: 8 }} />
        <div className="skeleton" style={{ height: 12, width: "40%", marginTop: 8 }} />
      </div>
    </div>
  )
}

export default function RestCard({ r }) {
  const distance = formatDistance(r.distance)
  // Prefer the vanity URL so a customer who browses from here ends up on the
  // same shareable address the restaurant's QR code points at. Falls back to
  // the numeric form for a restaurant that has no slug set.
  return (
    <Link to={r.slug ? `/${r.slug}` : `/restaurant/${r.id}`} className="rest-card card">
      <div className="rest-card-cover">
        {r.coverUrl ? (
          <img src={r.coverUrl} alt={r.name} />
        ) : (
          <div className="rest-card-cover-fallback"><UtensilsCrossed size={28} /></div>
        )}
        {!r.isOpen && (
          <span className="badge rest-closed-badge">
            {r.closedReason === "hours" && r.opensAt ? `Opens ${r.opensAt}` : "Closed"}
          </span>
        )}
      </div>
      <div className="rest-card-body">
        <div className="rest-card-row">
          <h3>{r.name}</h3>
          {r.rating != null && (
            <span className="rest-rating"><Star size={13} fill="currentColor" />{r.rating.toFixed(1)}</span>
          )}
        </div>
        {r.cuisines && <p className="rest-cuisines">{r.cuisines}</p>}
        <div className="rest-card-meta">
          <MapPin size={13} />
          <span>{distance || r.address}</span>
        </div>
      </div>
    </Link>
  )
}
