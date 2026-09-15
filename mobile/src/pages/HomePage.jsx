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

export default function HomePage() {
  // Location is optional: without it the page is a search (nothing listed
  // until the customer types). Every reason it can be missing still gets its
  // own banner copy, so the customer knows how to turn on the nearby view.
  //   checking  — reading the stored permission, before anything is asked
  //   prompt    — permission never decided; we show a primer and only call
  //               the API from the button's click (see requestLocation)
  //   locating  — the browser is working on a fix
  //   granted   — got coordinates
  //   blocked   — permission previously denied; the browser will not re-ask
  //   failed    — position unavailable or timed out; retrying can work
  //   insecure  — page isn't https/localhost, so the API is unavailable
  const [geoStatus, setGeoStatus] = useState("checking")
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

  // Typing fires a new search before the previous one has answered — only the
  // newest request may write results, or a slow older one would overwrite them.
  const requestSeq = useRef(0)
  // Latest debounced search term, readable from the geolocation callbacks
  // (which close over whatever render started the location request).
  const latestSearch = useRef("")

  // Browsing with a position: restaurants within the radius, closest first.
  // Any search covers every active restaurant — closest first when we have a
  // position. Without one (location not shared) this is only ever called with
  // a search term, since that mode shows nothing until the customer types.
  function loadRestaurants(pageNum, position, searchTerm, { append = false } = {}) {
    const params = { page: pageNum, pageSize: PAGE_SIZE }
    if (position) { params.lat = position.lat; params.lng = position.lng }
    if (searchTerm) params.search = searchTerm
    const seq = ++requestSeq.current
    if (!append) setLoadingMore(false)
    ;(append ? setLoadingMore : setLoading)(true)
    setError("")
    restaurantApi.nearby(params)
      .then((r) => {
        if (seq !== requestSeq.current) return
        setRestaurants((prev) => append ? [...prev, ...r.data.restaurants] : r.data.restaurants)
        setPage(r.data.page)
        setTotalPages(r.data.totalPages)
        if (r.data.radiusKm) setRadiusKm(r.data.radiusKm)
      })
      .catch(() => { if (seq === requestSeq.current) setError("Couldn't load restaurants. Please try again.") })
      .finally(() => { if (seq === requestSeq.current) (append ? setLoadingMore : setLoading)(false) })
  }

  // Search-only mode with an empty search box: nothing to show.
  function clearResults() {
    requestSeq.current++
    setRestaurants([])
    setPage(1)
    setTotalPages(1)
    setError("")
    setLoading(false)
    setLoadingMore(false)
  }

  // Called straight from a button click whenever the permission hasn't already
  // been granted. Browsers are far more willing to show the prompt during a
  // user gesture than during page load, and Safari in particular can drop a
  // load-time request without ever asking.
  function requestLocation() {
    if (!window.isSecureContext) { setGeoStatus("insecure"); return }
    if (!navigator.geolocation) { setGeoStatus("insecure"); return }

    setGeoStatus("locating")
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        try { sessionStorage.setItem(COORDS_CACHE_KEY, JSON.stringify({ ...next, ts: Date.now() })) } catch {}
        setCoords(next)
        setGeoStatus("granted")
        loadRestaurants(1, next, latestSearch.current)
      },
      (err) => {
        // Drop any earlier grant's distance-scoped results, then fall back to
        // search-only mode — re-running what the customer already typed.
        setCoords(null)
        // PERMISSION_DENIED is the only one the browser won't re-ask for; a
        // failed fix or a timeout is worth another try, so they get a retry
        // banner instead of the "you blocked us" instructions.
        setGeoStatus(err?.code === 1 ? "blocked" : "failed")
        if (latestSearch.current) loadRestaurants(1, null, latestSearch.current)
        else clearResults()
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 }
    )
  }

  useEffect(() => {
    let cancelled = false
    try {
      const cachedCoords = JSON.parse(sessionStorage.getItem(COORDS_CACHE_KEY) || "null")
      if (cachedCoords && Date.now() - cachedCoords.ts < COORDS_CACHE_TTL) {
        setCoords(cachedCoords)
        setGeoStatus("granted")
        loadRestaurants(1, cachedCoords, "")
        return
      }
    } catch {}

    if (!window.isSecureContext || !navigator.geolocation) { setGeoStatus("insecure"); setLoading(false); return }

    // Ask the Permissions API what state we're in before touching geolocation:
    // "granted" can be fetched silently, but "prompt" and "denied" both deserve
    // a screen explaining why we're asking rather than a bare browser dialog
    // over an empty page — and for "denied" there is no dialog to show at all.
    if (navigator.permissions?.query) {
      navigator.permissions.query({ name: "geolocation" })
        .then((status) => {
          if (cancelled) return
          if (status.state === "granted") requestLocation()
          else { setGeoStatus(status.state === "denied" ? "blocked" : "prompt"); setLoading(false) }
        })
        .catch(() => { if (!cancelled) { setGeoStatus("prompt"); setLoading(false) } })
    } else {
      // Older Safari has no Permissions API — the primer is the safe default,
      // since a load-time request there can fail silently.
      setGeoStatus("prompt")
      setLoading(false)
    }
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Debounce raw typing into a stable search term.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [searchInput])

  // Re-fetch page 1 whenever the debounced search term changes — skipped on
  // mount since the location effect above already triggers the first load.
  useEffect(() => {
    latestSearch.current = debouncedSearch
    if (skipNextSearchFetch.current) { skipNextSearchFetch.current = false; return }
    if (coords) { loadRestaurants(1, coords, debouncedSearch); return }
    // A location fix is in progress — its callback runs the search either way.
    if (geoStatus === "locating") return
    if (debouncedSearch) loadRestaurants(1, null, debouncedSearch)
    else clearResults()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch])

  function handleLoadMore() {
    loadRestaurants(page + 1, coords, debouncedSearch, { append: true })
  }

  const hasLocation = geoStatus === "granted"
  const findingLocation = geoStatus === "locating" || geoStatus === "checking"
  // Location not shared (or not available) — the page becomes a search.
  const searchOnly = !hasLocation && !findingLocation
  const awaitingSearch = searchOnly && !debouncedSearch

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

      <div className="home-hero">
        {searchOnly ? (
          <>
            <h1>Search for a restaurant</h1>
            <p className="home-location-status">
              Type a restaurant name or cuisine below to see results.
            </p>
          </>
        ) : (
          <>
            <h1>Restaurants near you</h1>
            <p className="home-location-status">
              {geoStatus === "checking" && "Just a moment…"}
              {geoStatus === "locating" && "Finding your location…"}
              {hasLocation && (debouncedSearch
                ? "Matching restaurants everywhere — closest first"
                : `Within ${radiusKm} km — closest first`)}
            </p>
          </>
        )}
      </div>

      <div className="home-search-wrap">
        <div className="search-field">
          <Search size={16} className="search-icon" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search restaurants or cuisines…"
            autoFocus={searchOnly}
          />
          {searchInput && (
            <button className="search-clear-btn" onClick={() => setSearchInput("")} aria-label="Clear search"><X size={16} /></button>
          )}
        </div>
      </div>

      {/* Location not shared — searching still works; this just offers the
          nearby view and explains what's stopping it. */}
      {searchOnly && (
        <div className="home-geo-banner">
          <div className="home-geo-banner-icon"><MapPin size={18} /></div>
          <div className="home-geo-banner-body">
            {geoStatus === "prompt" && (
              <>
                <p className="home-geo-banner-title">See restaurants near you</p>
                <p>Allow location and we'll show the ones within {radiusKm} km of where you're parked, closest first.</p>
              </>
            )}
            {geoStatus === "blocked" && (
              <>
                <p className="home-geo-banner-title">Location is blocked</p>
                <p>Your browser won't ask again until you switch it back on:</p>
                <ol className="home-geo-gate-steps">
                  <li>Tap the <strong>lock</strong> or <strong>⋮</strong> icon next to the web address</li>
                  <li>Open <strong>Permissions</strong> (or Site settings) and allow <strong>Location</strong></li>
                  <li>Come back and tap Try again</li>
                </ol>
              </>
            )}
            {geoStatus === "failed" && (
              <>
                <p className="home-geo-banner-title">Couldn't find your location</p>
                <p>Check that location is switched on in your phone's settings, then try once more.</p>
              </>
            )}
            {geoStatus === "insecure" && (
              <>
                <p className="home-geo-banner-title">Location isn't available here</p>
                <p>Browsers only share location over https. You can still search, or scan a restaurant's QR code to go straight to its menu.</p>
              </>
            )}
            {geoStatus !== "insecure" && (
              <button className="btn btn-outline btn-sm home-locate-btn" onClick={requestLocation}>
                <LocateFixed size={14} /> {geoStatus === "prompt" ? "Allow location" : "Try again"}
              </button>
            )}
          </div>
        </div>
      )}

      {!awaitingSearch && (
      <>
      <div className="rest-list">
        {loading || findingLocation ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonRestCard key={i} />)
        ) : error ? (
          <div className="home-empty">
            <p>{error}</p>
            <button className="btn btn-outline btn-sm" onClick={() => loadRestaurants(1, coords, debouncedSearch)}>Retry</button>
          </div>
        ) : restaurants.length === 0 ? (
          <div className="home-empty">
            <p>{debouncedSearch
              ? `No restaurants matching "${debouncedSearch}".`
              : `No restaurants within ${radiusKm} km of you yet — try searching by name or cuisine.`}</p>
          </div>
        ) : (
          restaurants.map((r) => <RestCard key={r.id} r={r} />)
        )}
      </div>

      {!loading && !findingLocation && !error && page < totalPages && (
        <button className="btn btn-outline home-load-more" onClick={handleLoadMore} disabled={loadingMore}>
          {loadingMore ? <span className="spinner" style={{ width: 18, height: 18 }} /> : "Load more"}
        </button>
      )}
      </>
      )}
    </div>
  )
}
