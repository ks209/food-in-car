import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { MapPin, LocateFixed, Search, X, Download, Share2, ChevronRight } from "lucide-react"
import { restaurantApi, configApi, venueApi } from "../api"
import { applyTheme, DEFAULT_HEX } from "../lib/theme"
import { LegalLinks } from "./LegalPage"
import RestCard, { SkeletonRestCard } from "../components/RestCard"
import VenueCard from "../components/VenueCard"
import { VENUE_TYPE_LABEL, VenueIcon } from "../lib/venue.jsx"

const PAGE_SIZE = 10
const SEARCH_DEBOUNCE_MS = 400
// Session-only — avoids re-hitting the GPS hardware on every visit to "/"
// (e.g. navigating back from a restaurant's menu), without persisting the
// customer's coordinates any longer than this browser tab stays open.
const COORDS_CACHE_KEY = "ck_last_coords"
const COORDS_CACHE_TTL = 10 * 60 * 1000
// Which venue the customer has said "I'm not here" to, so dismissing sticks for
// the rest of the tab. Stores one venue id: walking into a DIFFERENT place
// should still switch, only the dismissed one stays dismissed.
const VENUE_DISMISS_KEY = "ck_venue_dismissed"
// Mirrors NEARBY_RADIUS_KM in backend/routes/restaurant/restaurant.js — only
// used for copy until the first response comes back carrying the real value.
const DEFAULT_RADIUS_KM = 3

function readDismissedVenue() {
  try { return sessionStorage.getItem(VENUE_DISMISS_KEY) } catch { return null }
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

  // "address" when a search found nothing by name or cuisine and these are area
  // matches instead — worth saying out loud, or the results look like the app
  // ignored what was typed.
  const [matchedOn, setMatchedOn] = useState(null)

  // Places matching the current search term, shown as their own group above the
  // restaurant results. Only ever populated while something is typed — the home
  // page is not a browsable directory of venues.
  const [venueResults, setVenueResults] = useState([])
  // Its own guard, like detectSeq — see the note on detectVenue.
  const venueSearchSeq = useRef(0)

  // The place the customer is standing in, once a position is known. Non-null
  // puts the page in "venue mode": the venue's own outlets instead of the
  // radius-capped nearby list, and the search box scoped to that venue.
  const [venue, setVenue] = useState(null)
  // Read from callbacks that close over an older render, so state alone won't do.
  const venueRef = useRef(null)
  const dismissedVenueRef = useRef(readDismissedVenue())

  // Separate from requestSeq on purpose — see detectVenue.
  const detectSeq = useRef(0)

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
  //
  // In venue mode it loads that venue's outlets instead. The two endpoints
  // deliberately return the same shape, so only the request differs — the venue
  // response simply has no `radiusKm`, which the guard below skips.
  function loadRestaurants(pageNum, position, searchTerm, { append = false, venue: forVenue = null } = {}) {
    const params = { page: pageNum, pageSize: PAGE_SIZE }
    if (position) { params.lat = position.lat; params.lng = position.lng }
    if (searchTerm) params.search = searchTerm
    const seq = ++requestSeq.current
    if (!append) setLoadingMore(false)
    ;(append ? setLoadingMore : setLoading)(true)
    setError("")
    const request = forVenue
      ? venueApi.restaurants(forVenue.slug, params)
      : restaurantApi.nearby(params)
    request
      .then((r) => {
        if (seq !== requestSeq.current) return
        setRestaurants((prev) => append ? [...prev, ...r.data.restaurants] : r.data.restaurants)
        setPage(r.data.page)
        setTotalPages(r.data.totalPages)
        if (r.data.radiusKm) setRadiusKm(r.data.radiusKm)
        // Absent on the venue endpoint, which has no address fallback.
        setMatchedOn(r.data.matchedOn ?? null)
      })
      .catch(() => { if (seq === requestSeq.current) setError("Couldn't load restaurants. Please try again.") })
      .finally(() => { if (seq === requestSeq.current) (append ? setLoadingMore : setLoading)(false) })
  }

  // Places matching the search term. Runs alongside the restaurant search
  // rather than as part of it: the two are separate endpoints returning
  // different shapes, and the venue group must render as soon as it arrives
  // instead of waiting on the (paginated) restaurant list.
  //
  // This fires even in venue mode, and it is the way OUT of one: standing on a
  // campus and searching "city square" should offer the mall, not silently find
  // nothing because the restaurant half of the search was scoped to the campus.
  function loadVenueResults(searchTerm, position) {
    const seq = ++venueSearchSeq.current
    if (!searchTerm) { setVenueResults([]); return }
    const params = { search: searchTerm }
    if (position) { params.lat = position.lat; params.lng = position.lng }
    venueApi.search(params)
      .then((r) => { if (seq === venueSearchSeq.current) setVenueResults(r.data.venues) })
      .catch(() => { if (seq === venueSearchSeq.current) setVenueResults([]) })
  }

  // Ask whether this position is inside a venue, then load whichever list wins.
  //
  // Sequential rather than racing the two requests: a venue lookup is one query
  // over a tiny table, and the page has already waited on GPS — far slower than
  // this — so trading a round trip for "no flash of the wrong list" is worth it.
  // Any failure falls through to the ordinary nearby list.
  //
  // Guarded by its OWN sequence, deliberately not requestSeq. requestSeq tracks
  // restaurant-list responses and is bumped by clearResults(), so sharing it
  // meant an in-flight detect was cancelled every time the list was reset —
  // which happens on mount. The symptom was venue mode silently never engaging
  // when returning to "/" with cached coordinates (i.e. back from any menu).
  function detectVenue(position) {
    const seq = ++detectSeq.current
    setLoading(true)
    venueApi.detect({ lat: position.lat, lng: position.lng })
      .then((r) => {
        // Only a NEWER detect invalidates this one.
        if (seq !== detectSeq.current) return
        const found = r.data.venue
        // Read the search term now rather than at call time: the customer may
        // have typed while the lookup was in flight.
        const term = latestSearch.current
        if (found && String(found.id) !== dismissedVenueRef.current) {
          venueRef.current = found
          setVenue(found)
          loadRestaurants(1, position, term, { venue: found })
        } else {
          venueRef.current = null
          setVenue(null)
          loadRestaurants(1, position, term)
        }
      })
      .catch(() => {
        if (seq !== detectSeq.current) return
        venueRef.current = null
        loadRestaurants(1, position, latestSearch.current)
      })
  }

  // "Not here?" — drop out of venue mode for the rest of the tab and fall back
  // to the ordinary nearby list.
  function dismissVenue() {
    if (!venue) return
    dismissedVenueRef.current = String(venue.id)
    try { sessionStorage.setItem(VENUE_DISMISS_KEY, String(venue.id)) } catch {}
    venueRef.current = null
    setVenue(null)
    loadRestaurants(1, coords, latestSearch.current)
  }

  // Search-only mode with an empty search box: nothing to show.
  function clearResults() {
    requestSeq.current++
    venueSearchSeq.current++
    setRestaurants([])
    setVenueResults([])
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
        detectVenue(next)
      },
      (err) => {
        // Drop any earlier grant's distance-scoped results, then fall back to
        // search-only mode — re-running what the customer already typed.
        setCoords(null)
        venueRef.current = null
        setVenue(null)
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
        detectVenue(cachedCoords)
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
    // Places are searched in every mode — see loadVenueResults.
    loadVenueResults(debouncedSearch, coords)
    // In venue mode the box searches WITHIN the place — standing on a campus,
    // "dosa" means a campus dosa. Leaving the venue is the "Not here?" button.
    if (venueRef.current) { loadRestaurants(1, coords, debouncedSearch, { venue: venueRef.current }); return }
    if (coords) { loadRestaurants(1, coords, debouncedSearch); return }
    // A location fix is in progress — its callback runs the search either way.
    if (geoStatus === "locating") return
    if (debouncedSearch) loadRestaurants(1, null, debouncedSearch)
    else clearResults()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch])

  function handleLoadMore() {
    loadRestaurants(page + 1, coords, debouncedSearch, { append: true, venue })
  }

  const hasLocation = geoStatus === "granted"
  const findingLocation = geoStatus === "locating" || geoStatus === "checking"
  // Location not shared (or not available) — the page becomes a search.
  const searchOnly = !hasLocation && !findingLocation
  const awaitingSearch = searchOnly && !debouncedSearch
  const shownVenues = venueResults.filter((v) => !venue || v.id !== venue.id)

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

      {/* Venue mode replaces the hero entirely — the place IS the context, so
          repeating "Restaurants near you" above it would just be noise. */}
      {venue ? (
        <div className="venue-strip">
          <Link to={`/at/${venue.slug}`} className="venue-strip-main">
            {venue.logoUrl
              ? <img className="venue-strip-logo" src={venue.logoUrl} alt="" />
              : <span className="venue-strip-icon"><VenueIcon type={venue.type} size={17} /></span>}
            <span className="venue-strip-text">
              <span className="venue-strip-name">{venue.name}</span>
              <span className="venue-strip-meta">
                {VENUE_TYPE_LABEL[venue.type] || "Place"} · {venue.outletCount} {venue.outletCount === 1 ? "outlet" : "outlets"}
              </span>
            </span>
            <ChevronRight size={16} className="venue-strip-chevron" />
          </Link>
          <button className="venue-strip-dismiss" onClick={dismissVenue}>
            Not here? <X size={13} />
          </button>
        </div>
      ) : (
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
      )}

      <div className="home-search-wrap">
        <div className="search-field">
          <Search size={16} className="search-icon" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={venue ? `Search within ${venue.name}…` : "Search restaurants or cuisines…"}
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
      {/* Places matching the search, above the restaurants. The venue the
          customer is already in is filtered out — offering "VIT University"
          while standing in it is noise, and its outlets are the list below. */}
      {shownVenues.length > 0 && (
        <div className="venue-results">
          <p className="venue-results-label">Places</p>
          {shownVenues.map((v) => <VenueCard key={v.id} v={v} />)}
        </div>
      )}

      {matchedOn === "address" && !loading && restaurants.length > 0 && (
        <p className="home-match-note">
          No restaurants named “{debouncedSearch}” — showing ones in that area instead.
        </p>
      )}

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
            <p>{venue
              ? (debouncedSearch
                ? `Nothing matching "${debouncedSearch}" at ${venue.name}.`
                : `No outlets listed at ${venue.name} yet.`)
              : (debouncedSearch
                ? `No restaurants matching "${debouncedSearch}".`
                : `No restaurants within ${radiusKm} km of you yet — try searching by name or cuisine.`)}</p>
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

      <LegalLinks style={{ margin: "auto 0 0", padding: "2rem 1rem 1.5rem" }} />
    </div>
  )
}
