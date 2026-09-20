import { useEffect, useRef, useState, useMemo, useCallback } from "react"
import { useParams, Navigate, useSearchParams } from "react-router-dom"
import { Search, Mic, Star, MapPin, UtensilsCrossed, ShoppingBag, X, ArrowUpDown, Timer, List } from "lucide-react"
import { restaurantApi, categoryApi } from "../api"
import { useCart } from "../context/CartContext"
import CartDrawer from "../components/CartDrawer"
import MenuItemCard from "../components/MenuItemCard"
import AccountMenu from "../components/AccountMenu"
import ActiveOrderBanner from "../components/ActiveOrderBanner"
import { useRestaurantTheme } from "../lib/theme"
import { useRestaurantBase } from "../lib/restaurantPath"
import { LegalLinks } from "./LegalPage"

// The first chip. Not a filter any more — the menu is one continuous list of
// every category, so "All" means "you're at the top of it" and tapping it
// scrolls back there.
const ALL_ID = "__all__"
// Height of the sticky stack above the list: the search bar (71px, which is
// also .cat-bar's `top`) plus the category chip row. Section headers park
// under it and jump targets are offset by it — see --sticky-stack in index.css,
// which must stay in sync with this.
const STICKY_STACK = 130
// A chip row is fine to swipe through at five or six categories; past that,
// the floating index is the faster way to reach the far end of the menu.
const CATEGORY_INDEX_THRESHOLD = 6

function SkeletonCard() {
  return (
    <div className="item-card">
      <div className="skeleton" style={{ width: 122, height: 122, borderRadius: 14, flexShrink: 0 }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.6rem", paddingTop: "0.2rem" }}>
        <div className="skeleton" style={{ height: 18, width: "65%" }} />
        <div className="skeleton" style={{ height: 12, width: "92%" }} />
        <div className="skeleton" style={{ height: 12, width: "55%" }} />
        <div className="skeleton" style={{ height: 20, width: 60, marginTop: "auto" }} />
      </div>
    </div>
  )
}

export default function MenuPage() {
  const { restaurantId } = useParams()
  const { itemCount, total, setActiveRestaurant } = useCart()
  const tabsRef = useRef(null)
  // Links keep whichever URL shape the customer arrived on (/<slug> or /restaurant/<id>).
  const base = useRestaurantBase()
  useRestaurantTheme(restaurantId)

  const [restaurant, setRestaurant] = useState(null)
  const [notFound, setNotFound] = useState(false)

  // Section elements by category id, for jump-to and the scroll-spy observer.
  const sectionRefs = useRef({})
  const settleTimer = useRef(null)
  const jumpingRef = useRef(false)

  // A stale cart from a different restaurant (the shared CartProvider is a
  // single global instance) gets cleared the moment this restaurant's menu
  // is the one actually being browsed — see CartContext.setActiveRestaurant.
  //
  // Keyed on the resolved numeric id rather than the URL param: the same
  // restaurant reached via /restaurant/1 and via /spice-garden must not look
  // like two different restaurants and wipe a cart the customer was filling.
  useEffect(() => {
    if (restaurant?.id) setActiveRestaurant(restaurant.id)
  }, [restaurant?.id, setActiveRestaurant])

  const [categories, setCategories] = useState([])
  const [activeCategory, setActiveCategory] = useState(null)
  const [cartOpen, setCartOpen] = useState(false)
  // ?cart=open — "Try again" after a cancelled payment lands here with the
  // cart restored, straight into checkout. The param is dropped afterwards so
  // a refresh doesn't pop the drawer again.
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    if (searchParams.get("cart") !== "open") return
    setCartOpen(true)
    setSearchParams((p) => { p.delete("cart"); return p }, { replace: true })
  }, [searchParams, setSearchParams])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
  const [listening, setListening] = useState(false)
  const [vegFilter, setVegFilter] = useState("all") // "all" | "veg" | "nonveg"
  const [sortBy, setSortBy] = useState("default") // "default" | "price-asc" | "price-desc"
  const [indexOpen, setIndexOpen] = useState(false)

  useEffect(() => {
    Promise.all([restaurantApi.get(restaurantId), categoryApi.byRestaurant(restaurantId)])
      .then(([rRes, cRes]) => {
        setRestaurant(rRes.data)
        const cats = cRes.data
        setCategories(cats)
        setActiveCategory(ALL_ID)
      })
      .catch((err) => {
        // The vanity /<slug> route sits at the root, so any unmatched
        // single-segment path lands on this page. A 404 means there is no such
        // restaurant — that's a bad URL, not a failed load, so send them to the
        // homepage instead of showing a retry for something that can't succeed.
        if (err?.response?.status === 404) setNotFound(true)
        else setError("Couldn't load menu. Please try again.")
      })
      .finally(() => setLoading(false))
  }, [restaurantId])

  // The chip row only mounts once loading finishes (see the `!loading` guard below),
  // fully formed with every chip already in place. Force it to open at scrollLeft 0
  // so the "All" chip's left padding is guaranteed visible, no matter what nudged it.
  useEffect(() => {
    if (!loading && tabsRef.current) tabsRef.current.scrollLeft = 0
  }, [loading])

  // Tapping a chip scrolls to that category's section instead of filtering the
  // list down to it — with 80+ items a filter loses the customer's place in the
  // menu, where a jump keeps everything else one scroll away.
  const jumpToCategory = (id) => {
    setSearch("")
    setActiveCategory(id)
    setIndexOpen(false)
    // Stops the spy from flicking the chip through every section the page
    // passes on the way. Released by a timer rather than by a corrective
    // scroll — nothing here may move the page after the customer's own
    // finger has taken over.
    jumpingRef.current = true
    clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(() => { jumpingRef.current = false }, 700)

    if (id === ALL_ID) {
      window.scrollTo({ top: 0, behavior: "smooth" })
    } else {
      // scroll-margin-top on the section (index.css) keeps the heading clear
      // of the sticky search + chip bars.
      sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  useEffect(() => () => clearTimeout(settleTimer.current), [])

  // Keep the active chip in view as the spy moves it. Deliberately NOT
  // scrollIntoView: that walks up to every scrollable ancestor, including the
  // document, so a spy update mid-scroll would yank the page out from under
  // the customer. Only this row's own scrollLeft is ever touched.
  useEffect(() => {
    if (activeCategory == null) return
    const scroller = tabsRef.current
    const chip = scroller?.querySelector(`[data-cat="${activeCategory}"]`)
    if (!scroller || !chip) return
    const left = chip.offsetLeft - scroller.offsetLeft
    const right = left + chip.offsetWidth
    const pad = 16
    if (left < scroller.scrollLeft + pad) {
      scroller.scrollTo({ left: Math.max(0, left - pad), behavior: "smooth" })
    } else if (right > scroller.scrollLeft + scroller.clientWidth - pad) {
      scroller.scrollTo({ left: right - scroller.clientWidth + pad, behavior: "smooth" })
    }
  }, [activeCategory])

  // Voice search via the Web Speech API (graceful no-op if unsupported)
  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    const rec = new SR()
    rec.lang = "en-IN"
    rec.interimResults = false
    rec.onstart = () => setListening(true)
    rec.onend = () => setListening(false)
    rec.onresult = (e) => setSearch(e.results[0][0].transcript)
    rec.start()
  }

  const q = search.trim().toLowerCase()

  // Every active/available item across all categories (backs the "All" tab + search).
  const allItems = useMemo(
    () => categories.flatMap(c => c.menuItems || []).filter(i => i.isActive && i.available),
    [categories]
  )

  // Veg/sort apply the same way to a search result list and to every section.
  // Price sorting runs inside each category rather than across the whole menu —
  // the sections are the structure, sorting just orders them internally.
  const refine = useCallback((items) => {
    let out = items
    if (vegFilter !== "all") out = out.filter(i => (vegFilter === "veg" ? i.isVeg === true : i.isVeg === false))
    if (sortBy === "price-asc") out = [...out].sort((a, b) => a.price - b.price)
    else if (sortBy === "price-desc") out = [...out].sort((a, b) => b.price - a.price)
    return out
  }, [vegFilter, sortBy])

  // Search results are one flat list — categories stop being useful once the
  // customer has told us exactly what they're after.
  const searchResults = useMemo(() => {
    if (!q) return []
    return refine(allItems.filter(
      i => i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q)
    ))
  }, [q, allItems, refine])

  // The menu itself: every category in the order the restaurant set in the
  // dashboard, with the ones left empty by the veg filter dropped.
  const sections = useMemo(() => {
    if (q) return []
    return categories
      .map(c => ({ id: c.id, name: c.name, items: refine((c.menuItems || []).filter(i => i.isActive && i.available)) }))
      .filter(s => s.items.length > 0)
  }, [q, categories, refine])

  const visibleCount = useMemo(
    () => (q ? searchResults.length : sections.reduce((n, s) => n + s.items.length, 0)),
    [q, searchResults, sections]
  )

  // Scroll-spy: highlight the chip for whichever section currently sits just
  // below the sticky bars. The bottom margin keeps the "current" band to the
  // top slice of the viewport, so a section counts as active from the moment
  // its heading parks under the chip row.
  useEffect(() => {
    if (loading || q || sections.length === 0) return
    const order = sections.map(s => String(s.id))
    const visible = new Set()

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const id = entry.target.dataset.section
        if (entry.isIntersecting) visible.add(id)
        else visible.delete(id)
      }
      if (jumpingRef.current) return
      const topmost = order.find(id => visible.has(id))
      setActiveCategory(topmost ? Number(topmost) : ALL_ID)
    }, { rootMargin: `-${STICKY_STACK + 4}px 0px -62% 0px`, threshold: 0 })

    sections.forEach(s => {
      const el = sectionRefs.current[s.id]
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [loading, q, sections])

  const cycleSortBy = () => setSortBy(s => (s === "default" ? "price-asc" : s === "price-asc" ? "price-desc" : "default"))
  const sortLabel = sortBy === "price-asc" ? "Price: Low to High" : sortBy === "price-desc" ? "Price: High to Low" : "Sort"

  if (notFound) return <Navigate to="/" replace />

  if (error) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100dvh", padding: "2rem", flexDirection: "column", gap: "0.9rem" }}>
      <UtensilsCrossed size={44} strokeWidth={1.5} color="var(--muted)" />
      <p style={{ color: "var(--error)", textAlign: "center", fontWeight: 600 }}>{error}</p>
      <button className="btn btn-outline" onClick={() => window.location.reload()}>Try Again</button>
    </div>
  )

  const name = restaurant?.name || restaurant?.domain
  const initial = (name || "R")[0]?.toUpperCase()

  return (
    <div className="page" style={{ paddingBottom: itemCount > 0 ? "6rem" : "2rem" }}>

      {/* ── Hero ── */}
      <div className="hero">
        {/* topbar lives outside the clipped cover so the profile dropdown isn't cut off */}
        <div className="hero-topbar"><ActiveOrderBanner /><AccountMenu /></div>

        <div className="hero-cover">
          {restaurant?.coverUrl && <img src={restaurant.coverUrl} alt="" />}
        </div>

        <div className="hero-card anim-fade-up">
          {loading ? (
            <div style={{ display: "flex", gap: "0.85rem", alignItems: "center" }}>
              <div className="skeleton" style={{ width: 58, height: 58, borderRadius: 16 }} />
              <div style={{ flex: 1 }}>
                <div className="skeleton" style={{ height: 22, width: "70%", marginBottom: 8 }} />
                <div className="skeleton" style={{ height: 12, width: "50%" }} />
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: "0.9rem", alignItems: "center" }}>
                <div className="hero-avatar">
                  {restaurant?.logoUrl ? <img src={restaurant.logoUrl} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initial}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h1 className="hero-name">{name}</h1>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.4rem", flexWrap: "wrap" }}>
                    {restaurant?.rating != null && (
                      <span className="rating-pill"><Star size={12} fill="#06281d" strokeWidth={0} /> {restaurant.rating}</span>
                    )}
                    {restaurant?.ratingCount != null && (
                      <span style={{ fontSize: "0.76rem", color: "var(--muted)", fontWeight: 600 }}>{restaurant.ratingCount}+ ratings</span>
                    )}
                    {/* Recent real orders + the current kitchen queue — see
                        backend/utils/waitEstimate.js. Hidden when there's too
                        little history to estimate from. */}
                    {restaurant?.waitEstimate?.minutes != null && (
                      <span className="meta-item" style={{ fontSize: "0.76rem", color: "var(--text-secondary)", fontWeight: 600 }}
                        title={`Based on ${restaurant.waitEstimate.samples} recent orders`}>
                        <Timer size={13} strokeWidth={2.2} /> ~{restaurant.waitEstimate.minutes} min wait
                        {restaurant.waitEstimate.busy >= 5 && <span style={{ color: "var(--star)" }}> · busy now</span>}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {restaurant?.cuisines && (
                <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "0.85rem", fontWeight: 500 }}>
                  {restaurant.cuisines}
                </p>
              )}

              {/* Location */}
              <div className="location-row">
                <MapPin size={15} strokeWidth={2} style={{ flexShrink: 0, color: "var(--primary)" }} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {restaurant?.address}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Closed banner ── */}
      {restaurant?.isOpen === false && (
        <div style={{ margin: "0 1rem 1rem", padding: "1.1rem", borderRadius: 16,
          background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)",
          display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "0.35rem" }}>
          <p style={{ fontWeight: 800, color: "var(--error)", fontSize: "1rem" }}>Restaurant is currently closed.</p>
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
            {restaurant.closedReason === "hours" && restaurant.opensAt
              ? `Opens at ${restaurant.opensAt}.`
              : "Please check back later."}
          </p>
        </div>
      )}

      {restaurant?.isOpen !== false && <>

      {/* ── Sticky search ── */}
      <div className="search-sticky">
        <div className="search-field">
          <Search className="search-icon" size={19} strokeWidth={2.2} />
          <input placeholder={`Search ${restaurant?.name || "dishes"}…`} value={search} onChange={e => setSearch(e.target.value)} />
          {search ? (
            <button onClick={() => setSearch("")} style={{ color: "var(--muted)", lineHeight: 1, padding: "0 0.25rem", display: "flex", alignItems: "center" }}><X size={16} strokeWidth={2.25} /></button>
          ) : (
            <button className="voice-btn" onClick={startVoice} aria-label="Voice search"
              style={listening ? { background: "var(--primary)", color: "#06281d" } : undefined}>
              <Mic size={17} strokeWidth={2.2} />
            </button>
          )}
        </div>
      </div>

      {/* ── Category segmented control ── */}
      {!loading && !q && sections.length > 0 && (
        <div className="cat-bar">
          <div ref={tabsRef} className="cat-scroller">
            <button data-cat={ALL_ID} onClick={() => jumpToCategory(ALL_ID)}
              className={`cat-chip ${activeCategory === ALL_ID ? "active" : ""}`}>
              All
              <span className="cat-count">{visibleCount}</span>
            </button>
            {sections.map(section => (
              <button key={section.id} data-cat={section.id} onClick={() => jumpToCategory(section.id)}
                className={`cat-chip ${activeCategory === section.id ? "active" : ""}`}>
                {section.name}
                <span className="cat-count">{section.items.length}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Veg / sort filters ── */}
      {!loading && allItems.length > 0 && (
        <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", padding: "0 1rem 0.6rem" }}>
          <button onClick={() => setVegFilter(v => (v === "veg" ? "all" : "veg"))}
            className={`cat-chip ${vegFilter === "veg" ? "active" : ""}`}>
            <span className="veg-dot veg" /> Veg
          </button>
          <button onClick={() => setVegFilter(v => (v === "nonveg" ? "all" : "nonveg"))}
            className={`cat-chip ${vegFilter === "nonveg" ? "active" : ""}`}>
            <span className="veg-dot nonveg" /> Non-Veg
          </button>
          <button onClick={cycleSortBy} className={`cat-chip ${sortBy !== "default" ? "active" : ""}`}>
            <ArrowUpDown size={14} strokeWidth={2.4} /> {sortLabel}
          </button>
        </div>
      )}

      {/* ── Items ── */}
      <div style={{ padding: "0.5rem 1rem 0.875rem", flex: 1 }}>
        {!loading && q && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0.35rem 0.15rem 0.85rem" }}>
            <h2 style={{ fontSize: "1.15rem", fontWeight: 800 }}>Results</h2>
            <span style={{ fontSize: "0.78rem", color: "var(--muted)", fontWeight: 600 }}>{searchResults.length} items</span>
          </div>
        )}

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", paddingTop: "0.5rem" }}>
            {[1, 2, 3, 4].map(k => <SkeletonCard key={k} />)}
          </div>
        ) : visibleCount === 0 ? (
          <div style={{ textAlign: "center", padding: "4rem 1rem", color: "var(--muted)", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.85rem" }}>
            {q ? <Search size={40} strokeWidth={1.5} /> : <UtensilsCrossed size={40} strokeWidth={1.5} />}
            <p style={{ fontWeight: 600 }}>{q ? `No results for "${search}"` : "Nothing here yet"}</p>
          </div>
        ) : q ? (
          <div className="menu-item-list">
            {searchResults.map((item, i) => (
              <div key={item.id} className="anim-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}>
                <MenuItemCard item={item} />
              </div>
            ))}
          </div>
        ) : (
          // One continuous menu: every category in order, each heading sticking
          // under the chip row while its own items are on screen, so the
          // customer always knows which part of the menu they're looking at.
          sections.map(section => (
            <section key={section.id} data-section={section.id} className="menu-section"
              ref={(el) => { sectionRefs.current[section.id] = el }}>
              <h2 className="menu-section-head">
                <span>{section.name}</span>
                <span className="menu-section-count">{section.items.length}</span>
              </h2>
              <div className="menu-item-list">
                {section.items.map((item, i) => (
                  <div key={item.id} className="anim-fade-up" style={{ animationDelay: `${Math.min(i, 6) * 45}ms` }}>
                    <MenuItemCard item={item} />
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      {/* ── Floating category index ── */}
      {!loading && !q && sections.length >= CATEGORY_INDEX_THRESHOLD && (
        <button className="menu-index-fab" onClick={() => setIndexOpen(true)}
          style={{ bottom: itemCount > 0 ? "5.4rem" : "1.5rem" }}>
          <List size={16} strokeWidth={2.4} /> Menu
        </button>
      )}

      {indexOpen && (
        <>
          <div onClick={() => setIndexOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 200, backdropFilter: "blur(3px)" }} />
          <div className="anim-fade-up cart-sheet" style={{
            position: "fixed", bottom: 0, left: 0, right: 0, margin: "0 auto",
            width: "min(100%, 480px)", background: "var(--card)",
            borderRadius: "24px 24px 0 0", zIndex: 201,
            border: "1px solid var(--border)", borderBottom: "none",
            maxHeight: "80dvh", display: "flex", flexDirection: "column",
            boxShadow: "0 -12px 40px rgba(0,0,0,0.5)",
          }}>
            <div style={{ display: "flex", justifyContent: "center", padding: "0.85rem 0 0.4rem" }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border)" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 1.25rem 0.9rem" }}>
              <h2 style={{ fontWeight: 800, fontSize: "1.2rem" }}>Menu</h2>
              <button onClick={() => setIndexOpen(false)} aria-label="Close"
                style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--bg)",
                  display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)" }}>
                <X size={17} strokeWidth={2.4} />
              </button>
            </div>
            <div style={{ overflowY: "auto", padding: "0 0.75rem 1.5rem" }}>
              {sections.map(section => (
                <button key={section.id} className="menu-index-row" onClick={() => jumpToCategory(section.id)}>
                  <span>{section.name}</span>
                  <span className="menu-index-count">{section.items.length}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Cart bar ── */}
      {itemCount > 0 && (
        <div className="anim-fade-up" style={{ position: "fixed", bottom: "1rem", left: 0, right: 0, margin: "0 auto", width: "min(calc(100% - 2rem), 448px)", zIndex: 100 }}>
          <button onClick={() => setCartOpen(true)}
            style={{
              width: "100%", borderRadius: 16, padding: "0.95rem 1.2rem",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: "var(--primary)", color: "#06281d",
              boxShadow: "0 12px 28px rgba(var(--primary-rgb),0.45)", fontWeight: 800, fontFamily: "var(--font-display)",
            }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ background: "rgba(0,0,0,0.18)", borderRadius: 9, padding: "0.22rem 0.55rem", fontSize: "0.82rem" }}>{itemCount}</span>
              <ShoppingBag size={17} strokeWidth={2.4} /> View Cart
            </span>
            <span style={{ fontSize: "1rem" }}>₹{total.toFixed(0)}</span>
          </button>
        </div>
      )}

      {/* Statutory identifiers live at the foot of the page, beside the policy
          links — they're compliance text, not something a customer reads while
          choosing food, and they crowded the hero. */}
      {(restaurant?.fssaiLicense || restaurant?.gstin) && (
        <p style={{ textAlign: "center", fontSize: "0.68rem", color: "var(--muted)", padding: "1.25rem 1rem 0", lineHeight: 1.6 }}>
          {restaurant.fssaiLicense ? `FSSAI Lic. No. ${restaurant.fssaiLicense}` : ""}
          {restaurant.fssaiLicense && restaurant.gstin ? " · " : ""}
          {restaurant.gstin ? `GSTIN ${restaurant.gstin}` : ""}
        </p>
      )}

      <LegalLinks base={base} style={{ padding: "0.75rem 1rem 1.25rem", paddingBottom: itemCount > 0 ? "5.5rem" : "1.25rem" }} />

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} restaurant={restaurant} restaurantId={restaurantId} />

      </>}
    </div>
  )
}
