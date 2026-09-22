// The admin portal's chrome — sidebar, nav and sign-out — with the active page
// rendered into <main>. Extracted from Admin.jsx when Places was added: both
// pages need identical chrome, and duplicating it would let the two drift.
//
// There is no router in this app (see App.jsx), so "navigation" is a string of
// state passed down from App.

const NAV = [
    { key: 'restaurants', label: 'Restaurants' },
    { key: 'places', label: 'Places' },
    { key: 'transfer', label: 'Transfer' },
];

export default function Shell({ page, onNavigate, onLogout, children }) {
    return (
        <div className="app-shell">
            <div className="sidebar">
                <div>
                    <div className="sidebar-logo">
                        <img src="/carkhanaalogo.png" alt="Carkhanaa" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover' }} />
                        <span>Carkhanaa</span>
                    </div>
                    <div className="sidebar-label">Admin Portal</div>
                    <nav className="sidebar-nav">
                        {NAV.map((item) => (
                            <button
                                key={item.key}
                                className={`sidebar-nav-item ${page === item.key ? 'sidebar-nav-item-active' : ''}`}
                                onClick={() => onNavigate(item.key)}
                            >
                                {item.label}
                            </button>
                        ))}
                    </nav>
                </div>
                <button className="btn btn-outline btn-sm sidebar-logout" onClick={onLogout}>
                    Sign Out
                </button>
            </div>

            {/* Keyed so switching pages replays the fade-up animation rather than
                swapping content in place with no transition. */}
            <div className="main" key={page}>
                {children}
            </div>
        </div>
    );
}
