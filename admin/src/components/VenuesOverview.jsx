import React, { useEffect, useState } from 'react';
import { venueApi } from '../api';

// All places side by side, ranked by revenue, so the admin can see which one is
// worth opening without opening each. Same colour, population rule and date
// handling as VenueAnalytics — the numbers must reconcile with the per-place page.
const SERIES = '#d95926';

const RANGES = [
    { key: 7, label: '7 days' },
    { key: 30, label: '30 days' },
];

const inr = (n) => '₹' + Math.round(n || 0).toLocaleString('en-IN');

// IST, not the admin's own timezone — see the note in VenueAnalytics.jsx. These
// two views must agree, so they date the same way.
const IST_OFFSET_MIN = 330;
function istDateStr(daysAgo = 0) {
    return new Date(Date.now() + IST_OFFSET_MIN * 60000 - daysAgo * 86400000).toISOString().slice(0, 10);
}

// A sparkline is a stat-tile companion, not a chart with chrome — no axes, no
// grid, no tooltip. Inline SVG rather than a charting component: one per table
// row, and a full chart runtime per row would cost far more than it says.
function Spark({ values, width = 108, height = 26 }) {
    const max = Math.max(...values, 1);
    if (!values.length) return null;
    const step = values.length > 1 ? width / (values.length - 1) : width;
    const pad = 2;
    const y = (v) => height - pad - (v / max) * (height - pad * 2);
    const line = values.map((v, i) => `${i * step},${y(v)}`).join(' ');
    const area = `0,${height} ${line} ${(values.length - 1) * step},${height}`;
    return (
        <svg width={width} height={height} className="spark" aria-hidden="true">
            <polygon points={area} fill={SERIES} opacity="0.16" />
            <polyline points={line} fill="none" stroke={SERIES} strokeWidth="2"
                strokeLinejoin="round" strokeLinecap="round" />
        </svg>
    );
}

function Trend({ current, previous, hasBaseline }) {
    if (!hasBaseline || !previous) return <span className="kpi-delta kpi-delta-none">—</span>;
    const d = ((current - previous) / previous) * 100;
    if (Math.abs(d) < 0.5) return <span className="kpi-delta kpi-delta-flat">flat</span>;
    return (
        <span className={`kpi-delta ${d > 0 ? 'kpi-delta-up' : 'kpi-delta-down'}`}>
            {d > 0 ? '▲' : '▼'} {Math.abs(d).toFixed(0)}%
        </span>
    );
}

export default function VenuesOverview({ onOpenAnalytics }) {
    const [days, setDays] = useState(7);
    const [data, setData] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        setError('');
        venueApi.overview({ from: istDateStr(days - 1), to: istDateStr(0) })
            .then((r) => { if (!cancelled) setData(r.data); })
            .catch(() => { if (!cancelled) setError('Could not load place performance'); });
        return () => { cancelled = true; };
    }, [days]);

    // Nothing to compare until there is at least one active place.
    if (!error && data && data.venues.length === 0) return null;

    return (
        <div className="card" style={{ marginBottom: 24 }}>
            <div className="card-header" style={{ gap: 12, flexWrap: 'wrap' }}>
                <span className="card-title">Performance</span>
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
            </div>

            {error ? (
                <div className="card-body" style={{ color: '#f87171' }}>{error}</div>
            ) : !data ? (
                <div className="card-body" style={{ color: '#71717a' }}>Loading…</div>
            ) : (
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Place</th>
                                <th>Outlets</th>
                                <th>Orders</th>
                                <th>Revenue</th>
                                <th>vs previous</th>
                                <th>Trend</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.venues.map((v) => (
                                <tr key={v.id}>
                                    <td style={{ fontWeight: 500 }}>{v.name}</td>
                                    {/* Mapped outlets — an INCLUSIVE place shows customers more
                                        than this, but only members count toward its revenue. */}
                                    <td>{v.mappedOutlets}</td>
                                    <td>{v.completedOrders}</td>
                                    <td>{inr(v.revenue)}</td>
                                    <td><Trend current={v.revenue} previous={v.previousRevenue} hasBaseline={v.hasBaseline} /></td>
                                    <td><Spark values={v.spark} /></td>
                                    <td>
                                        <button className="btn btn-outline btn-sm" onClick={() => onOpenAnalytics(v.id)}>
                                            Open
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
