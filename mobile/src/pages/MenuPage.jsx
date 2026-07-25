import { useEffect, useRef, useState, useMemo } from "react"
import { useParams } from "react-router-dom"
import { Search, Mic, Star, MapPin, UtensilsCrossed, ShoppingBag, X, ArrowUpDown } from "lucide-react"
import { restaurantApi, categoryApi } from "../api"
import { useCart } from "../context/CartContext"
import CartDrawer from "../components/CartDrawer"
import MenuItemCard from "../components/MenuItemCard"
import AccountMenu from "../components/AccountMenu"
import { useRestaurantTheme } from "../lib/theme"

// Mandatory synthetic category shown first — aggregates every item across categories.
const ALL_ID = "__all__"

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
  const { itemCount, total } = useCart()
  const tabsRef = useRef(null)
  useRestaurantTheme(restaurantId)

  const [restaurant, setRestaurant] = useState(null)
  const [categories, setCategories] = useState([])
  const [activeCategory, setActiveCategory] = useState(null)
  const [cartOpen, setCartOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
  const [listening, setListening] = useState(false)
  const [vegFilter, setVegFilter] = useState("all") // "all" | "veg" | "nonveg"
  const [sortBy, setSortBy] = useState("default") // "default" | "price-asc" | "price-desc"

  useEffect(() => {
    Promise.all([restaurantApi.get(restaurantId), categoryApi.byRestaurant(restaurantId)])
      .then(([rRes, cRes]) => {
        setRestaurant(rRes.data)
        const cats = cRes.data
        setCategories(cats)
        setActiveCategory(ALL_ID)
      })
      .catch(() => setError("Couldn't load menu. Please try again."))
      .finally(() => setLoading(false))
  }, [restaurantId])

  const switchCategory = (id) => {
    setActiveCategory(id)
    setSearch("")
    const el = tabsRef.current?.querySelector(`[data-cat="${id}"]`)
    // "nearest" (not "center") — only scrolls if the tapped chip isn't already
    
    // fully visible, instead of re-centering the whole row on every tap.
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" })
  }

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

  const displayItems = useMemo(() => {
    let items
    if (q) {
      items = allItems.filter(
        i => i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q)
      )
    } else if (activeCategory === ALL_ID) {
      items = allItems
    } else {
      items = categories.find(c => c.id === activeCategory)?.menuItems?.filter(i => i.isActive && i.available) || []
    }

    if (vegFilter !== "all") items = items.filter(i => (vegFilter === "veg" ? i.isVeg === true : i.isVeg === false))
    if (sortBy === "price-asc") items = [...items].sort((a, b) => a.price - b.price)
    else if (sortBy === "price-desc") items = [...items].sort((a, b) => b.price - a.price)

    return items
  }, [q, categories, activeCategory, allItems, vegFilter, sortBy])

  const cycleSortBy = () => setSortBy(s => (s === "default" ? "price-asc" : s === "price-asc" ? "price-desc" : "default"))
  const sortLabel = sortBy === "price-asc" ? "Price: Low to High" : sortBy === "price-desc" ? "Price: High to Low" : "Sort"

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
        <div className="hero-topbar"><AccountMenu /></div>

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
      {!loading && !q && allItems.length > 0 && (
        <div className="cat-bar">
          <div ref={tabsRef} className="cat-scroller">
            <button data-cat={ALL_ID} onClick={() => switchCategory(ALL_ID)}
              className={`cat-chip ${activeCategory === ALL_ID ? "active" : ""}`}>
              All
              <span className="cat-count">{allItems.length}</span>
            </button>
            {categories.map(cat => {
              const active = activeCategory === cat.id
              const count = cat.menuItems?.filter(i => i.isActive && i.available).length || 0
              return (
                <button key={cat.id} data-cat={cat.id} onClick={() => switchCategory(cat.id)}
                  className={`cat-chip ${active ? "active" : ""}`}>
                  {cat.name}
                  {count > 0 && <span className="cat-count">{count}</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Veg / sort filters ── */}
      {!loading && allItems.length > 0 && (
        <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", padding: "0 1rem 0.6rem 2rem" }}>
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
        {!loading && !q && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0.35rem 0.15rem 0.85rem" }}>
            <h2 style={{ fontSize: "1.15rem", fontWeight: 800 }}>
              {activeCategory === ALL_ID ? "All" : categories.find(c => c.id === activeCategory)?.name || "Menu"}
            </h2>
            <span style={{ fontSize: "0.78rem", color: "var(--muted)", fontWeight: 600 }}>{displayItems.length} items</span>
          </div>
        )}

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", paddingTop: "0.5rem" }}>
            {[1, 2, 3, 4].map(k => <SkeletonCard key={k} />)}
          </div>
        ) : displayItems.length === 0 ? (
          <div style={{ textAlign: "center", padding: "4rem 1rem", color: "var(--muted)", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.85rem" }}>
            {q ? <Search size={40} strokeWidth={1.5} /> : <UtensilsCrossed size={40} strokeWidth={1.5} />}
            <p style={{ fontWeight: 600 }}>{q ? `No results for "${search}"` : "Nothing here yet"}</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {displayItems.map((item, i) => (
              <div key={item.id} className="anim-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}>
                <MenuItemCard item={item} />
              </div>
            ))}
          </div>
        )}
      </div>

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

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} restaurant={restaurant} restaurantId={restaurantId} />
    </div>
  )
}
