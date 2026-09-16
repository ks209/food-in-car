import React, { useEffect, useMemo, useState } from 'react';
import {
    ResponsiveContainer, AreaChart, Area, BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { venueApi } from '../api';

// Chart colour. NOT the UI brand orange (#f97316) — that sits at OKLCH L 0.705,
// outside the 0.48–0.67 band a mark needs on a dark surface. This is the same
// hue stepped for the dark panel, and it clears the lightness band, chroma floor
// and 3:1 contrast against #161618.
//
// Every chart here is single-series on purpose: revenue over time, revenue per
// outlet, revenue per daypart. One measure, one hue — so there is no categorical
// palette to get wrong, and no legend is needed (each title names its series).
// In particular the leaderboard bars are all ONE colour: shading them
// darker-where-bigger would double-encode length as hue and say nothing new.
const SERIES = '#d95926';
const GRID = 'rgba(255,255,255,0.06)';
const AXIS_TEXT = '#71717a';

const RANGES = [
    { key: 7, label: '7 days' },
    { key: 30, label: '30 days' },
    { key: 90, label: '90 days' },
];

const TYPE_LABEL = {
    UNIVERSITY: 'University / Campus', MALL: 'Mall', TECH_PARK: 'Tech Park',
    OFFICE_PARK: 'Office Park', HOSPITAL: 'Hospital', AIRPORT: 'Airport',
    STADIUM: 'Stadium', RESIDENTIAL: 'Residential', OTHER: 'Other',
};

const inr = (n) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const compactInr = (n) => {
    const v = Math.round(n || 0);
    if (v >= 100000) return '₹' + (v / 100000).toFixed(1) + 'L';
    if (v >= 1000) return '₹' + (v / 1000).toFixed(1) + 'k';
    return '₹' + v;
};
// "16 Sep" — the axis only ever spans one venue's range, so the year is noise.
const shortDate = (iso) => {
    const d = new Date(`${iso}T00:00:00Z`);
    return `${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })}`;
};

// Venue analytics are always reported in IST, never the admin's own timezone.
// The venue is a physical place in India and these numbers describe its diners'
// day — "when do people order at VIT" means noon in Vellore, not noon wherever
// support happens to be sitting. An admin in London bucketing a 12:30 IST lunch
// order into "Morning" is just wrong.
//
// This is the one place that deliberately DIVERGES from the restaurant
// dashboard, where the viewer and the restaurant share a timezone by definition.
// The API defaults to IST when no tzOffset is sent, so none is.
const IST_OFFSET_MIN = 330;

// YYYY-MM-DD `n` days back from today, in IST.
function istDateStr(daysAgo = 0) {
    const shifted = new Date(Date.now() + IST_OFFSET_MIN * 60000 - daysAgo * 86400000);
    return shifted.toISOString().slice(0, 10);
}

function deltaPct(current, previous) {
    if (!previous) return null;
    return ((current - previous) / previous) * 100;
}

function Delta({ current, previous, hasBaseline }) {
    if (!hasBaseline) return <span className="kpi-delta kpi-delta-none">no earlier data</span>;
    const d = deltaPct(current, previous);
    if (d === null) return <span className="kpi-delta kpi-delta-none">no earlier data</span>;
    if (Math.abs(d) < 0.5) return <span className="kpi-delta kpi-delta-flat">no change</span>;
    const up = d > 0;
    return (
        <span className={`kpi-delta ${up ? 'kpi-delta-up' : 'kpi-delta-down'}`}>
            {up ? '▲' : '▼'} {Math.abs(d).toFixed(0)}%
        </span>
    );
}

function KpiTile({ label, value, sub, children }) {
    return (
        <div className="kpi-tile">
            <span className="kpi-label">{label}</span>
            <span className="kpi-value">{value}</span>
            <span className="kpi-foot">{children}{sub && <span className="kpi-sub">{sub}</span>}</span>
        </div>
    );
}

function ChartTooltip({ active, payload, label, formatter }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="chart-tip">
            <div className="chart-tip-label">{label}</div>
            {payload.map((p) => (
                <div key={p.dataKey} className="chart-tip-row">
                    <span className="chart-tip-dot" style={{ background: SERIES }} />
                    {formatter ? formatter(p) : `${p.name}: ${p.value}`}
                </div>
            ))}
        </div>
    );
}

const VenueAnalytics = ({ venueId, onBack }) => {
    const [days, setDays] = useState(30);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    // The table view that a chart must always have an equivalent of.
    const [showTable, setShowTable] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError('');
        venueApi.analytics(venueId, { from: istDateStr(days - 1), to: istDateStr(0) })
            .then((r) => { if (!cancelled) setData(r.data); })
            .catch((err) => { if (!cancelled) setError(err?.response?.data?.message || 'Could not load analytics'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [venueId, days]);

    const trend = useMemo(
        () => (data?.daily || []).map((d) => ({ ...d, label: shortDate(d.date) })),
        [data]
    );

    const maxOutletRevenue = useMemo(
        () => Math.max(1, ...(data?.outlets || []).map((o) => o.revenue)),
        [data]
    );

    const cur = data?.kpis?.current;
    const prev = data?.kpis?.previous;
    const hasBaseline = !!data?.kpis?.hasBaseline;
    const noSales = !!data && cur.completedOrders === 0;

    return (
        <>
            <div className="page-header">
                <button className="btn btn-outline btn-sm" onClick={onBack} style={{ marginBottom: 12 }}>
                    ← Back to Places
                </button>
                <h1>{data ? data.venue.name : 'Analytics'}</h1>
                <p>
                    {data
                        ? `${TYPE_LABEL[data.venue.type] || data.venue.type} · counting the ${data.mappedOutlets} restaurants mapped to this place`
                        : 'Loading…'}
                </p>
            </div>

            {/* Filters in one row above the charts. */}
            <div className="analytics-bar">
                <div className="filter-tabs">
                    {RANGES.map((r) => (
                        <button
                            key={r.key}
                            className={`filter-tab ${days === r.key ? 'filter-tab-active' : ''}`}
                            onClick={() => setDays(r.key)}
                        >
                            {r.label}
                        </button>
                    ))}
                </div>
                {data && (
                    <span className="analytics-range">
                        {shortDate(data.range.from)} – {shortDate(data.range.to)}
                        <span className="analytics-range-prev"> vs {shortDate(data.previous.from)} – {shortDate(data.previous.to)} · IST</span>
                    </span>
                )}
                <button className="btn btn-outline btn-sm" onClick={() => setShowTable((s) => !s)}>
                    {showTable ? 'Hide table' : 'View as table'}
                </button>
            </div>

            {error && (
                <div className="card" style={{ padding: 20, color: '#f87171' }}>{error}</div>
            )}

            {loading && !error && (
                <div className="card" style={{ padding: 40, textAlign: 'center', color: '#71717a' }}>Loading…</div>
            )}

            {data && !loading && !error && (
                <>
                    {/* A handful of headline numbers is a KPI row, not a chart. */}
                    <div className="kpi-row">
                        <KpiTile label="Revenue" value={inr(cur.revenue)}>
                            <Delta current={cur.revenue} previous={prev.revenue} hasBaseline={hasBaseline} />
                        </KpiTile>
                        <KpiTile label="Completed orders" value={cur.completedOrders.toLocaleString('en-IN')}>
                            <Delta current={cur.completedOrders} previous={prev.completedOrders} hasBaseline={hasBaseline} />
                        </KpiTile>
                        <KpiTile label="Average order" value={inr(cur.aov)}>
                            <Delta current={cur.aov} previous={prev.aov} hasBaseline={hasBaseline} />
                        </KpiTile>
                        <KpiTile
                            label="Outlets trading"
                            value={`${cur.activeOutlets} / ${data.mappedOutlets}`}
                            sub={cur.activeOutlets < data.mappedOutlets
                                ? `${data.mappedOutlets - cur.activeOutlets} sold nothing`
                                : 'all trading'}
                        />
                    </div>

                    {noSales ? (
                        <div className="card" style={{ padding: 40, textAlign: 'center', color: '#71717a' }}>
                            No completed orders in this range — nothing to chart yet.
                        </div>
                    ) : (
                        <>
                            <div className="card" style={{ marginBottom: 20 }}>
                                <div className="card-header"><span className="card-title">Revenue per day</span></div>
                                <div className="card-body" style={{ paddingLeft: 8 }}>
                                    <ResponsiveContainer width="100%" height={240}>
                                        <AreaChart data={trend} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                                            <defs>
                                                <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor={SERIES} stopOpacity={0.28} />
                                                    <stop offset="100%" stopColor={SERIES} stopOpacity={0.02} />
                                                </linearGradient>
                                            </defs>
                                            {/* Hairline, solid, horizontal only — recessive by design. */}
                                            <CartesianGrid stroke={GRID} vertical={false} />
                                            <XAxis
                                                dataKey="label" tick={{ fill: AXIS_TEXT, fontSize: 11 }}
                                                tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24}
                                            />
                                            <YAxis
                                                tick={{ fill: AXIS_TEXT, fontSize: 11 }} tickLine={false}
                                                axisLine={false} width={54} tickFormatter={compactInr}
                                            />
                                            <Tooltip
                                                cursor={{ stroke: 'rgba(255,255,255,0.18)', strokeWidth: 1 }}
                                                content={<ChartTooltip formatter={(p) => `${inr(p.payload.revenue)} · ${p.payload.orders} ${p.payload.orders === 1 ? "order" : "orders"}`} />}
                                            />
                                            <Area
                                                type="monotone" dataKey="revenue" name="Revenue"
                                                stroke={SERIES} strokeWidth={2} fill="url(#revFill)"
                                                dot={false} activeDot={{ r: 4, strokeWidth: 0 }}
                                                // Entry animation off: ResponsiveContainer re-measures on any
                                                // window resize, which restarts it and flashes the marks back to
                                                // zero. A dashboard that redraws on every range change gains
                                                // nothing from it.
                                                isAnimationActive={false}
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            <div className="card" style={{ marginBottom: 20 }}>
                                <div className="card-header">
                                    <span className="card-title">Outlets by revenue</span>
                                </div>
                                <div className="table-wrap">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>Outlet</th>
                                                <th style={{ width: '34%' }}>Share of place revenue</th>
                                                <th>Revenue</th>
                                                <th>Orders</th>
                                                <th>Avg order</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.outlets.map((o) => (
                                                <tr key={o.id}>
                                                    <td style={{ fontWeight: 500, color: o.revenue ? undefined : '#71717a' }}>{o.name}</td>
                                                    <td>
                                                        <div className="share-row">
                                                            {/* Length carries the magnitude; one hue for every
                                                                bar, so hue is not spent re-saying it. */}
                                                            <span className="share-track">
                                                                <span
                                                                    className="share-fill"
                                                                    style={{ width: `${(o.revenue / maxOutletRevenue) * 100}%`, background: SERIES }}
                                                                />
                                                            </span>
                                                            <span className="share-pct">{o.sharePct.toFixed(0)}%</span>
                                                        </div>
                                                    </td>
                                                    <td>{inr(o.revenue)}</td>
                                                    <td>{o.orders}</td>
                                                    <td>{o.orders ? inr(o.aov) : '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="card" style={{ marginBottom: 20 }}>
                                <div className="card-header"><span className="card-title">When people order</span></div>
                                <div className="card-body" style={{ paddingLeft: 8 }}>
                                    <ResponsiveContainer width="100%" height={200}>
                                        <BarChart data={data.dayparts} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                                            <CartesianGrid stroke={GRID} vertical={false} />
                                            <XAxis dataKey="label" tick={{ fill: AXIS_TEXT, fontSize: 11 }} tickLine={false} axisLine={{ stroke: GRID }} />
                                            <YAxis tick={{ fill: AXIS_TEXT, fontSize: 11 }} tickLine={false} axisLine={false} width={54} tickFormatter={compactInr} />
                                            <Tooltip
                                                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                                                content={<ChartTooltip formatter={(p) => `${inr(p.payload.revenue)} · ${p.payload.orders} ${p.payload.orders === 1 ? "order" : "orders"}`} />}
                                            />
                                            {/* 4px rounded data-end, anchored to the baseline. */}
                                            <Bar dataKey="revenue" name="Revenue" fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={56} isAnimationActive={false} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </>
                    )}

                    {showTable && (
                        <div className="card">
                            <div className="card-header"><span className="card-title">Daily figures</span></div>
                            <div className="table-wrap">
                                <table>
                                    <thead><tr><th>Date</th><th>Orders</th><th>Revenue</th></tr></thead>
                                    <tbody>
                                        {data.daily.map((d) => (
                                            <tr key={d.date}>
                                                <td>{shortDate(d.date)}</td>
                                                <td>{d.orders}</td>
                                                <td>{inr(d.revenue)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}
        </>
    );
};

export default VenueAnalytics;
