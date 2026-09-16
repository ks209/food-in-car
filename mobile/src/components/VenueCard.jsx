import { Link } from "react-router-dom"
import { ChevronRight } from "lucide-react"
import { VENUE_TYPE_LABEL, VenueIcon } from "../lib/venue.jsx"
import { formatDistance } from "./RestCard"

// A place in the shared search results. Deliberately a different shape from
// RestCard — a venue is a container, not something you order from, and looking
// like a restaurant card would invite a tap expecting a menu.
export default function VenueCard({ v }) {
  const distance = formatDistance(v.distance)
  return (
    <Link to={`/at/${v.slug}`} className="venue-result">
      {v.logoUrl
        ? <img className="venue-result-logo" src={v.logoUrl} alt="" />
        : <span className="venue-result-icon"><VenueIcon type={v.type} size={18} /></span>}
      <span className="venue-result-text">
        <span className="venue-result-name">{v.name}</span>
        <span className="venue-result-meta">
          {VENUE_TYPE_LABEL[v.type] || "Place"}
          {" · "}
          {v.outletCount} {v.outletCount === 1 ? "outlet" : "outlets"}
          {distance ? ` · ${distance}` : ""}
        </span>
      </span>
      <ChevronRight size={16} className="venue-result-chevron" />
    </Link>
  )
}
