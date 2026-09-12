import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { MapPin, Star, UtensilsCrossed, LocateFixed, Search, X, Download, Share2 } from "lucide-react"
import { restaurantApi, configApi } from "../api"
import { applyTheme, DEFAULT_HEX } from "../lib/theme"

const PAGE_SIZE = 10
const SEARCH_DEBOUNCE_MS = 400
// Session-only — avoids re-hitting the GPS hardware on every visit to "/"
// (e.g. navigating back from a restaurant's menu), without persisting the
// customer's coordinates any longer than this browser tab stays open.
const COORDS_CACHE_KEY = "ck_last_coords"
const COORDS_CACHE_TTL = 10 * 60 * 1000
// Mirrors NEARBY_RADIUS_KM in backend/routes/restaurant/restaurant.js — only
// used for copy until the first response comes back carrying the real value.
const DEFAULT_RADIUS_KM = 3

function formatDistance(km) {
  if (km == null) return null
  return km < 1 ? `${Math.round(km * 1000)} m away` : `${km.toFixed(1)} km away`
}

function SkeletonRestCard() {
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

function RestCard({ r }) {
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
        {!r.isOpen && <span className="badge rest-closed-badge">Closed</span>}
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

export default function HomePage() {
  // Location is mandatory: "denied" is a dead end that shows the enable-location
  // screen instead of a restaurant list — there is no city fallback any more.
  const [geoStatus, setGeoStatus] = useState("locating") // locating | granted | denied
  const [coords, setCoords] = useState(null)
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM)
  const [searchInput, setSearchInput] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")

  const [restaurants, setRestaurants] = useState([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState("")

  const skipNextSearchFetch = useRef(true)

  // "Add to Home Screen" test button — gated by a backend env flag so it can
  // be toggled without a frontend redeploy. Two completely different paths:
  // Chrome/Edge/Android fire beforeinstallprompt and can be triggered
  // programmatically; iOS (every browser there is WebKit under the hood —
  // Apple doesn't allow alternative engines) has no such event at all, so the
  // best we can do is detect it and show the manual Share-sheet steps.
  const [installEnabled, setInstallEnabled] = useState(false)
  const [installPrompt, setInstallPrompt] = useState(null)
  const [installed, setInstalled] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [showIOSHint, setShowIOSHint] = useState(false)

  useEffect(() => { applyTheme(DEFAULT_HEX) }, [])
  useEffect(() => { configApi.get().then((r) => setInstallEnabled(!!r.data.pwaInstallButtonEnabled)).catch(() => {}) }, [])

  useEffect(() => {
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream)
    setIsStandalone(window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches)
  }, [])

  useEffect(() => {
    const onBeforeInstall = (e) => { e.preventDefault(); setInstallPrompt(e) }
    const onInstalled = () => { setInstalled(true); setInstallPrompt(null) }
    window.addEventListener("beforeinstallprompt", onBeforeInstall)
    window.addEventListener("appinstalled", onInstalled)
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  async function handleInstallClick() {
    if (!installPrompt) return
    installPrompt.prompt()
    await installPrompt.userChoice
    setInstallPrompt(null) // the captured event is one-shot — can't prompt() twice
  }

  const showInstallButton = installEnabled && !!installPrompt && !installed
  const showIOSInstallHint = installEnabled && isIOS && !isStandalone

  const iosHintRef = useRef(null)
  useEffect(() => {
    const close = (e) => { if (iosHintRef.current && !iosHintRef.current.contains(e.target)) setShowIOSHint(false) }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [])

  // Every call is coordinate-scoped — without location there is nothing to
  // show, so callers only reach this once geoStatus is "granted".
  function loadRestaurants(pageNum, position, searchTerm, { append = false } = {}) {
    const params = { page: pageNum, pageSize: PAGE_SIZE, lat: position.lat, lng: position.lng }
    if (searchTerm) params.search = searchTerm
    ;(append ? setLoadingMore : setLoading)(true)
    setError("")
    restaurantApi.nearby(params)
      .then((r) => {
        setRestaurants((prev) => append ? [...prev, ...r.data.restaurants] : r.data.restaurants)
        setPage(r.data.page)
        setTotalPages(r.data.totalPages)
        if (r.data.radiusKm) setRadiusKm(r.data.radiusKm)
      })
      .catch(() => setError("Couldn't load restaurants. Please try again."))
      .finally(() => (append ? setLoadingMore : setLoading)(false))
  }

  function requestLocation() {
    setGeoStatus("locating")
    if (!navigator.geolocation) {
      setGeoStatus("denied")
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        try { sessionStorage.setItem(COORDS_CACHE_KEY, JSON.stringify({ ...next, ts: Date.now() })) } catch {}
        setCoords(next)
        setGeoStatus("granted")
        loadRestaurants(1, next, debouncedSearch)
      },
      () => {
        // Denied, unavailable or timed out — all equally blocking. The list is
        // cleared so a previous grant's results can't linger on screen.
        setCoords(null)
        setRestaurants([])
        setGeoStatus("denied")
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    )
  }

  useEffect(() => {
    try {
      const cachedCoords = JSON.parse(sessionStorage.getItem(COORDS_CACHE_KEY) || "null")
      if (cachedCoords && Date.now() - cachedCoords.ts < COORDS_CACHE_TTL) {
        setCoords(cachedCoords)
        setGeoStatus("granted")
        loadRestaurants(1, cachedCoords, "")
        return
      }
    } catch {}
    requestLocation()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Debounce raw typing into a stable search term.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [searchInput])

  // Re-fetch page 1 whenever the debounced search term changes — skipped on
  // mount since the location/city effect above already triggers the first load.
  useEffect(() => {
    if (skipNextSearchFetch.current) { skipNextSearchFetch.current = false; return }
    if (!coords) return
    loadRestaurants(1, coords, debouncedSearch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch])

  function handleLoadMore() {
    if (!coords) return
    loadRestaurants(page + 1, coords, debouncedSearch, { append: true })
  }

  return (
    <div className="page">
      <div className="home-topbar">
        <div className="home-brand">
          <img src="/carkhanaalogo.png" alt="Carkhanaa" className="home-brand-logo" />
          <span className="home-brand-name">Carkhanaa</span>
        </div>
        {showInstallButton && (
          <button className="btn btn-outline btn-sm home-install-btn" onClick={handleInstallClick}>
            <Download size={14} /> Install App
          </button>
        )}
        {showIOSInstallHint && (
          <div ref={iosHintRef} style={{ position: "relative" }}>
            <button className="btn btn-outline btn-sm home-install-btn" onClick={() => setShowIOSHint((s) => !s)}>
              <Share2 size={14} /> Add to Home Screen
            </button>
            {showIOSHint && (
              <div className="anim-scale" style={{
                position: "absolute", right: 0, top: "calc(100% + 0.5rem)", zIndex: 120, width: 230,
                background: "var(--card)", borderRadius: 14, boxShadow: "var(--shadow-lg)",
                border: "1px solid var(--border)", padding: "0.9rem 1rem",
              }}>
                <p style={{ fontSize: "0.82rem", fontWeight: 700, marginBottom: "0.5rem" }}>Add Carkhanaa to your Home Screen</p>
                <ol style={{ fontSize: "0.78rem", color: "var(--text-secondary)", paddingLeft: "1.1rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                  <li>Tap the <strong style={{ color: "var(--text)" }}>Share</strong> icon in the toolbar</li>
                  <li>Scroll down and tap <strong style={{ color: "var(--text)" }}>"Add to Home Screen"</strong></li>
                </ol>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Location is mandatory — without it the page is this screen and
          nothing else: no search box, no list, no city fallback. */}
      {geoStatus === "denied" ? (
        <div className="home-geo-gate">
          <div className="home-geo-gate-icon"><MapPin size={26} /></div>
          <h1>We need your location</h1>
          <p>
            Carkhanaa shows you restaurants within {radiusKm} km of where you're parked,
            so we can't load anything until location is on.
          </p>
          <button className="btn btn-primary home-locate-btn" onClick={requestLocation}>
            <LocateFixed size={16} /> Enable location
          </button>
          <p className="home-geo-gate-hint">
            Already blocked it? Tap the lock or <strong>⋮</strong> icon next to the address bar,
            then allow Location for this site and try again.
          </p>
        </div>
      ) : (
      <>
      <div className="home-hero">
        <h1>Restaurants near you</h1>
        <p className="home-location-status">
          {geoStatus === "locating" && "Finding your location…"}
          {geoStatus === "granted" && `Within ${radiusKm} km — closest first`}
        </p>
      </div>

      <div className="home-search-wrap">
        <div className="search-field">
          <Search size={16} className="search-icon" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search restaurants or cuisines…"
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
            <button className="btn btn-outline btn-sm" onClick={() => coords && loadRestaurants(1, coords, debouncedSearch)}>Retry</button>
          </div>
        ) : restaurants.length === 0 ? (
          <div className="home-empty">
            <p>{debouncedSearch
              ? `No restaurants matching "${debouncedSearch}" within ${radiusKm} km.`
              : `No restaurants within ${radiusKm} km of you yet.`}</p>
          </div>
        ) : (
          restaurants.map((r) => <RestCard key={r.id} r={r} />)
        )}
      </div>

      {!loading && !error && page < totalPages && (
        <button className="btn btn-outline home-load-more" onClick={handleLoadMore} disabled={loadingMore}>
          {loadingMore ? <span className="spinner" style={{ width: 18, height: 18 }} /> : "Load more"}
        </button>
      )}
      </>
      )}
    </div>
  )
}
