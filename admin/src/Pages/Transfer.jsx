import React, { useEffect, useMemo, useState } from 'react';
import { restaurantApi } from '../api';

// Move a restaurant's setup between deployments (staging → production).
// Export downloads a JSON file here; Import creates the restaurant on whatever
// backend THIS portal is pointed at. What travels is defined server-side in
// utils/restaurantTransfer.js: profile, branding, menu with option groups,
// parking spots. Orders, customers, payments, waiters and PhonePe credentials
// stay behind.

const apiError = (err, fallback) => {
    const message = err?.response?.data?.message;
    return message ? `Error: ${message}` : fallback;
};

const countsOf = (payload) => ({
    categories: payload?.categories?.length ?? 0,
    menuItems: payload?.menuItems?.length ?? 0,
    optionGroups: (payload?.menuItems || []).reduce((s, m) => s + (m.optionGroups?.length || 0), 0),
    parkingSpots: payload?.parkingSpots?.length ?? 0,
});

const Summary = ({ payload }) => {
    const c = countsOf(payload);
    return (
        <p style={{ fontSize: 13, color: 'var(--text-2)' }}>
            {c.categories} categories · {c.menuItems} menu items · {c.optionGroups} option groups · {c.parkingSpots} parking spots
        </p>
    );
};

const Transfer = () => {
    const [restaurants, setRestaurants] = useState([]);
    const [selectedId, setSelectedId] = useState('');
    const [exporting, setExporting] = useState(false);
    const [exportMsg, setExportMsg] = useState('');

    const [file, setFile] = useState(null);
    const [payload, setPayload] = useState(null);
    const [importing, setImporting] = useState(false);
    const [importMsg, setImportMsg] = useState('');
    const [imported, setImported] = useState(null);

    useEffect(() => {
        restaurantApi.all()
            .then((res) => setRestaurants(res.data))
            .catch(() => setExportMsg('Failed to load restaurants'));
    }, []);

    const selected = useMemo(
        () => restaurants.find((r) => String(r.id) === String(selectedId)),
        [restaurants, selectedId]
    );

    const handleExport = async () => {
        if (!selectedId) return;
        setExporting(true); setExportMsg('');
        try {
            const res = await restaurantApi.export(selectedId);
            const c = countsOf(res.data);
            // Download it as a file rather than showing JSON to copy by hand.
            const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${res.data.restaurant.slug || 'restaurant'}-export.json`;
            link.click();
            URL.revokeObjectURL(url);
            setExportMsg(`Downloaded — ${c.categories} categories, ${c.menuItems} menu items, ${c.optionGroups} option groups, ${c.parkingSpots} parking spots.`);
        } catch (err) {
            setExportMsg(apiError(err, 'Export failed'));
        } finally {
            setExporting(false);
        }
    };

    // Parsed on pick so the counts can be shown before anything is created.
    const handleFile = (e) => {
        const picked = e.target.files?.[0] || null;
        setFile(picked); setPayload(null); setImportMsg(''); setImported(null);
        if (!picked) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(reader.result);
                if (!parsed?.restaurant?.name) throw new Error('missing restaurant');
                setPayload(parsed);
            } catch {
                setImportMsg("That file isn't a restaurant export");
            }
        };
        reader.onerror = () => setImportMsg("Couldn't read that file");
        reader.readAsText(picked);
    };

    const handleImport = async () => {
        if (!payload) return;
        const name = payload.restaurant.name;
        if (!window.confirm(`Create "${name}" on this environment?`)) return;
        setImporting(true); setImportMsg('');
        try {
            const res = await restaurantApi.import(payload);
            setImported(res.data);
            setImportMsg('');
            setFile(null); setPayload(null);
            restaurantApi.all().then((r) => setRestaurants(r.data)).catch(() => {});
        } catch (err) {
            setImportMsg(apiError(err, 'Import failed'));
        } finally {
            setImporting(false);
        }
    };

    return (
        <>
            <div className="page-header">
                <h1>Transfer</h1>
                <p>Move a restaurant's setup between environments — download it from one, upload it to another.</p>
            </div>

            <div className="card" style={{ marginBottom: 24 }}>
                <div className="card-header"><span className="card-title">Export</span></div>
                <div className="card-body">
                    <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 14 }}>
                        Downloads the restaurant's profile, menu (with option groups), and parking spots as a JSON file.
                        Orders, customers, payments, waiters and PhonePe credentials are not included.
                    </p>
                    <div className="field" style={{ maxWidth: 360 }}>
                        <label>Restaurant</label>
                        <select value={selectedId} onChange={(e) => { setSelectedId(e.target.value); setExportMsg(''); }}>
                            <option value="">Select a restaurant…</option>
                            {restaurants.map((r) => (
                                <option key={r.id} value={r.id}>
                                    {r.name}{r.slug ? ` (${r.slug})` : ''}{r.isActive ? '' : ' — deactivated'}
                                </option>
                            ))}
                        </select>
                    </div>
                    <button className="btn btn-primary" style={{ marginTop: 14 }}
                        onClick={handleExport} disabled={!selectedId || exporting}>
                        {exporting ? 'Exporting…' : `Download${selected ? ` "${selected.name}"` : ''}`}
                    </button>
                    {exportMsg && <p style={{ marginTop: 12, fontSize: 13, color: 'var(--text-2)' }}>{exportMsg}</p>}
                </div>
            </div>

            <div className="card">
                <div className="card-header"><span className="card-title">Import</span></div>
                <div className="card-body">
                    <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 14 }}>
                        Creates the restaurant on this environment from an exported file. It keeps its web address,
                        dashboard login and menu. Nothing is written if the web address or username is already taken here.
                    </p>
                    <div className="field" style={{ maxWidth: 360 }}>
                        <label>Export file</label>
                        <input type="file" accept="application/json,.json" onChange={handleFile} />
                    </div>

                    {payload && (
                        <div style={{ marginTop: 14, padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 10 }}>
                            <p style={{ fontWeight: 600, marginBottom: 4 }}>
                                {payload.restaurant.name}
                                {payload.restaurant.slug ? <span style={{ color: 'var(--text-2)', fontWeight: 400 }}> · /{payload.restaurant.slug}</span> : null}
                            </p>
                            <Summary payload={payload} />
                            {payload.source?.name && (
                                <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 6 }}>
                                    Exported {payload.exportedAt ? new Date(payload.exportedAt).toLocaleString() : ''} from {payload.source.name}
                                </p>
                            )}
                        </div>
                    )}

                    <button className="btn btn-primary" style={{ marginTop: 14 }}
                        onClick={handleImport} disabled={!payload || importing}>
                        {importing ? 'Importing…' : 'Import restaurant'}
                    </button>

                    {importMsg && <p style={{ marginTop: 12, fontSize: 13, color: '#f87171' }}>{importMsg}</p>}
                    {imported && (
                        <div style={{ marginTop: 12, fontSize: 13 }}>
                            <p style={{ color: '#4ade80', fontWeight: 600 }}>
                                Created "{imported.restaurant.name}" (id {imported.restaurant.id})
                            </p>
                            <p style={{ color: 'var(--text-2)' }}>
                                {imported.counts.categories} categories · {imported.counts.menuItems} menu items · {imported.counts.parkingSpots} parking spots
                            </p>
                            <p style={{ color: 'var(--text-2)', marginTop: 6 }}>
                                Next: the restaurant signs in with its existing username and password, and sets its PhonePe
                                credentials in Settings → Payments.
                            </p>
                        </div>
                    )}
                    {file && !payload && !importMsg && <p style={{ marginTop: 12, fontSize: 13, color: 'var(--text-2)' }}>Reading file…</p>}
                </div>
            </div>
        </>
    );
};

export default Transfer;
