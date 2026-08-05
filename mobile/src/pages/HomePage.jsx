import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { MapPin, Star, UtensilsCrossed, LocateFixed, Search, X, Download } from "lucide-react"
import { restaurantApi, cityApi, configApi } from "../api"
import { applyTheme, DEFAULT_HEX } from "../lib/theme"

const PAGE_SIZE = 10
const SEARCH_DEBOUNCE_MS = 400
// Session-only — avoids re-hitting the GPS hardware (or re-asking a customer
// to pick a city) on every visit to "/" (e.g. navigating back from a
// restaurant's menu), without persisting either any longer than this browser
// tab stays open.
const COORDS_CACHE_KEY = "ck_last_coords"
const CITY_CACHE_KEY = "ck_last_city"
const COORDS_CACHE_TTL = 10 * 60 * 1000

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
  return (
    <Link to={`/restaurant/${r.id}`} className="rest-card card">
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
  const [geoStatus, setGeoStatus] = useState("locating") // locating | granted | denied
  const [coords, setCoords] = useState(null)
  const [cities, setCities] = useState([])
  const [selectedCityId, setSelectedCityId] = useState(null)
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
  // be toggled without a frontend redeploy, and only ever shows on browsers
  // that actually support the install prompt (Chrome/Edge/Android — iOS
  // Safari has no beforeinstallprompt event at all; there, Add to Home
  // Screen is manual, via the browser's own Share menu).
  const [installEnabled, setInstallEnabled] = useState(false)
  const [installPrompt, setInstallPrompt] = useState(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => { applyTheme(DEFAULT_HEX) }, [])
  useEffect(() => { cityApi.all().then((r) => setCities(r.data)).catch(() => {}) }, [])
  useEffect(() => { configApi.get().then((r) => setInstallEnabled(!!r.data.pwaInstallButtonEnabled)).catch(() => {}) }, [])

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

  function loadRestaurants(pageNum, modeParams, searchTerm, { append = false } = {}) {
    const params = { page: pageNum, pageSize: PAGE_SIZE, ...modeParams }
    if (searchTerm) params.search = searchTerm
    ;(append ? setLoadingMore : setLoading)(true)
    setError("")
    restaurantApi.nearby(params)
      .then((r) => {
        setRestaurants((prev) => append ? [...prev, ...r.data.restaurants] : r.data.restaurants)
        setPage(r.data.page)
        setTotalPages(r.data.totalPages)
      })
      .catch(() => setError("Couldn't load restaurants. Please try again."))
      .finally(() => (append ? setLoadingMore : setLoading)(false))
  }

  function requestLocation() {
    setGeoStatus("locating")
    if (!navigator.geolocation) {
      setGeoStatus("denied")
      loadRestaurants(1, {}, debouncedSearch)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        try { sessionStorage.setItem(COORDS_CACHE_KEY, JSON.stringify({ ...next, ts: Date.now() })) } catch {}
        try { sessionStorage.removeItem(CITY_CACHE_KEY) } catch {}
        setSelectedCityId(null)
        setCoords(next)
        setGeoStatus("granted")
        loadRestaurants(1, { lat: next.lat, lng: next.lng }, debouncedSearch)
      },
      () => {
        setGeoStatus("denied")
        loadRestaurants(1, {}, debouncedSearch)
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    )
  }

  function handleSelectCity(e) {
    const id = e.target.value ? Number(e.target.value) : null
    setSelectedCityId(id)
    try {
      if (id) sessionStorage.setItem(CITY_CACHE_KEY, String(id))
      else sessionStorage.removeItem(CITY_CACHE_KEY)
    } catch {}
    loadRestaurants(1, id ? { cityId: id } : {}, debouncedSearch)
  }

  useEffect(() => {
    try {
      const cachedCoords = JSON.parse(sessionStorage.getItem(COORDS_CACHE_KEY) || "null")
      if (cachedCoords && Date.now() - cachedCoords.ts < COORDS_CACHE_TTL) {
        setCoords(cachedCoords)
        setGeoStatus("granted")
        loadRestaurants(1, { lat: cachedCoords.lat, lng: cachedCoords.lng }, "")
        return
      }
      const cachedCityId = sessionStorage.getItem(CITY_CACHE_KEY)
      if (cachedCityId) {
        setGeoStatus("denied")
        setSelectedCityId(Number(cachedCityId))
        loadRestaurants(1, { cityId: Number(cachedCityId) }, "")
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
    const modeParams = coords ? { lat: coords.lat, lng: coords.lng } : selectedCityId ? { cityId: selectedCityId } : {}
    loadRestaurants(1, modeParams, debouncedSearch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch])

  function handleLoadMore() {
    const modeParams = coords ? { lat: coords.lat, lng: coords.lng } : selectedCityId ? { cityId: selectedCityId } : {}
    loadRestaurants(page + 1, modeParams, debouncedSearch, { append: true })
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
      </div>

      <div className="home-hero">
        <h1>Restaurants near you</h1>
        <p className="home-location-status">
          {geoStatus === "locating" && "Finding your location…"}
          {geoStatus === "granted" && "Sorted by distance, closest first"}
          {geoStatus === "denied" && !selectedCityId && "Showing top-rated restaurants — enable location for distance sorting"}
          {geoStatus === "denied" && selectedCityId && "Showing top-rated restaurants in your city"}
        </p>
        {geoStatus === "denied" && (
          <div className="home-fallback-row">
            <button className="btn btn-outline btn-sm home-locate-btn" onClick={requestLocation}>
              <LocateFixed size={14} /> Enable location
            </button>
            <select className="input home-city-select" value={selectedCityId || ""} onChange={handleSelectCity}>
              <option value="">Or choose your city…</option>
              {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
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
            <button className="btn btn-outline btn-sm" onClick={() => loadRestaurants(1, coords ? { lat: coords.lat, lng: coords.lng } : selectedCityId ? { cityId: selectedCityId } : {}, debouncedSearch)}>Retry</button>
          </div>
        ) : restaurants.length === 0 ? (
          <div className="home-empty"><p>{debouncedSearch ? `No restaurants matching "${debouncedSearch}".` : "No restaurants found nearby yet."}</p></div>
        ) : (
          restaurants.map((r) => <RestCard key={r.id} r={r} />)
        )}
      </div>

      {!loading && !error && page < totalPages && (
        <button className="btn btn-outline home-load-more" onClick={handleLoadMore} disabled={loadingMore}>
          {loadingMore ? <span className="spinner" style={{ width: 18, height: 18 }} /> : "Load more"}
        </button>
      )}
    </div>
  )
}
