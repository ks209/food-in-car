import { useEffect, useRef, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { ArrowLeft, MapPin, Search, X, Store } from "lucide-react"
import { venueApi } from "../api"
import { applyTheme, DEFAULT_HEX } from "../lib/theme"
import RestCard, { SkeletonRestCard } from "../components/RestCard"
import { LegalLinks } from "./LegalPage"
import { VENUE_TYPE_LABEL, VenueIcon } from "../lib/venue.jsx"

const PAGE_SIZE = 20
const SEARCH_DEBOUNCE_MS = 400
// Written by HomePage when it auto-detects a venue, and reused here so a
// customer who lands straight on /at/<slug> still gets distance-sorted outlets
// without the page asking for their location a second time.
const COORDS_CACHE_KEY = "ck_last_coords"
const COORDS_CACHE_TTL = 10 * 60 * 1000

function cachedCoords() {
  try {
    const c = JSON.parse(sessionStorage.getItem(COORDS_CACHE_KEY) || "null")
    if (c && Date.now() - c.ts < COORDS_CACHE_TTL) return { lat: c.lat, lng: c.lng }
  } catch {}
  return null
}

export default function VenuePage() {
  const { venueSlug } = useParams()

  const [venue, setVenue] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [restaurants, setRestaurants] = useState([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")

  const requestSeq = useRef(0)
  const skipNextSearchFetch = useRef(true)

  // A venue is a platform-level page, not a restaurant's, so it keeps the
  // default brand colours rather than any tenant's theme.
  useEffect(() => { applyTheme(DEFAULT_HEX) }, [])

  useEffect(() => {
    let cancelled = false
    setNotFound(false)
    venueApi.get(venueSlug)
      .then((r) => { if (!cancelled) setVenue(r.data) })
      .catch((err) => {
        if (cancelled) return
        // A deactivated or unknown place 404s rather than redirecting home — a
        // stale QR on a campus noticeboard should say so plainly.
        if (err?.response?.status === 404) setNotFound(true)
        else setError("Couldn't load this place. Please try again.")
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [venueSlug])

  function load(pageNum, searchTerm, { append = false } = {}) {
    const params = { page: pageNum, pageSize: PAGE_SIZE }
    const coords = cachedCoords()
    if (coords) { params.lat = coords.lat; params.lng = coords.lng }
    if (searchTerm) params.search = searchTerm

    const seq = ++requestSeq.current
    ;(append ? setLoadingMore : setLoading)(true)
    setError("")
    venueApi.restaurants(venueSlug, params)
      .then((r) => {
        if (seq !== requestSeq.current) return
        setRestaurants((prev) => (append ? [...prev, ...r.data.restaurants] : r.data.restaurants))
        setPage(r.data.page)
        setTotalPages(r.data.totalPages)
      })
      .catch((err) => {
        if (seq !== requestSeq.current) return
        if (err?.response?.status === 404) setNotFound(true)
        else setError("Couldn't load this place. Please try again.")
      })
      .finally(() => { if (seq === requestSeq.current) (append ? setLoadingMore : setLoading)(false) })
  }

  useEffect(() => { load(1, "") /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [venueSlug])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    if (skipNextSearchFetch.current) { skipNextSearchFetch.current = false; return }
    load(1, debouncedSearch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch])

  if (notFound) {
    return (
      <div className="page">
        <div className="home-empty" style={{ margin: "auto" }}>
          <Store size={32} />
          <p style={{ fontWeight: 700, color: "var(--text)" }}>This place isn't available</p>
          <p>It may have been removed. Try searching for a restaurant instead.</p>
          <Link to="/" className="btn btn-outline btn-sm">Browse restaurants</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="venue-hero">
        {venue?.coverUrl && <img className="venue-hero-cover" src={venue.coverUrl} alt="" />}
        <div className="venue-hero-scrim" />
        <Link to="/" className="venue-back" aria-label="Back to restaurants"><ArrowLeft size={18} /></Link>
        <div className="venue-hero-body">
          {venue ? (
            <>
              <div className="venue-hero-type">
                <VenueIcon type={venue.type} size={13} />
                <span>{VENUE_TYPE_LABEL[venue.type] || "Place"}</span>
              </div>
              <h1>{venue.name}</h1>
              <div className="venue-hero-meta">
                <span>{venue.outletCount} {venue.outletCount === 1 ? "outlet" : "outlets"}</span>
                {venue.address && (
                  <>
                    <span className="venue-dot" />
                    <span className="venue-hero-address"><MapPin size={12} /> {venue.address}</span>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="skeleton" style={{ height: 14, width: 90, borderRadius: 6 }} />
              <div className="skeleton" style={{ height: 24, width: "65%", marginTop: 8, borderRadius: 6 }} />
            </>
          )}
        </div>
      </div>

      {venue?.description && <p className="venue-description">{venue.description}</p>}

      <div className="home-search-wrap">
        <div className="search-field">
          <Search size={16} className="search-icon" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={venue ? `Search within ${venue.name}…` : "Search…"}
          />
          {searchInput && (
            <button className="search-clear-btn" onClick={() => setSearchInput("")} aria-label="Clear search"><X size={16} /></button>
          )}
        </div>
      </div>

      <div className="rest-list">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonRestCard key={i} />)
        ) : error ? (
          <div className="home-empty">
            <p>{error}</p>
            <button className="btn btn-outline btn-sm" onClick={() => load(1, debouncedSearch)}>Retry</button>
          </div>
        ) : restaurants.length === 0 ? (
          <div className="home-empty">
            <p>{debouncedSearch
              ? `Nothing matching "${debouncedSearch}" here.`
              : "No outlets listed here yet."}</p>
          </div>
        ) : (
          restaurants.map((r) => <RestCard key={r.id} r={r} />)
        )}
      </div>

      {!loading && !error && page < totalPages && (
        <button className="btn btn-outline home-load-more" onClick={() => load(page + 1, debouncedSearch, { append: true })} disabled={loadingMore}>
          {loadingMore ? <span className="spinner" style={{ width: 18, height: 18 }} /> : "Load more"}
        </button>
      )}

      <LegalLinks style={{ margin: "auto 0 0", padding: "2rem 1rem 1.5rem" }} />
    </div>
  )
}
