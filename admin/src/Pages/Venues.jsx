import React, { useEffect, useMemo, useState } from 'react';
import { venueApi, restaurantApi, cityApi } from '../api';
import VenuesOverview from '../components/VenuesOverview.jsx';

const emptyForm = {
    name: '',
    slug: '',
    type: 'OTHER',
    description: '',
    address: '',
    latitude: '',
    longitude: '',
    detectRadiusM: 500,
    membershipMode: 'STRICT',
    includeRadiusM: '',
    cityId: '',
    logoUrl: '',
    coverUrl: '',
};

// Mirrors the VenueType enum in schema.prisma. Labels only — nothing branches
// on the type, it just picks the wording customers see.
const TYPES = [
    { value: 'UNIVERSITY', label: 'University / Campus' },
    { value: 'MALL', label: 'Mall' },
    { value: 'TECH_PARK', label: 'Tech Park' },
    { value: 'OFFICE_PARK', label: 'Office Park' },
    { value: 'HOSPITAL', label: 'Hospital' },
    { value: 'AIRPORT', label: 'Airport' },
    { value: 'STADIUM', label: 'Stadium' },
    { value: 'RESIDENTIAL', label: 'Residential' },
    { value: 'OTHER', label: 'Other' },
];
const typeLabel = (v) => TYPES.find((t) => t.value === v)?.label || v;

const STATUS_FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'inactive', label: 'Deactivated' },
];

const apiError = (err, fallback) => {
    const message = err?.response?.data?.message;
    return message ? `Error: ${message}` : fallback;
};

const Venues = ({ onOpenAnalytics }) => {
    const [venues, setVenues] = useState([]);
    const [restaurants, setRestaurants] = useState([]);
    const [cities, setCities] = useState([]);
    const [form, setForm] = useState(emptyForm);
    // Ticked restaurants, in tick order — the array order becomes `position`,
    // which is the order outlets appear on the venue's page.
    const [selectedIds, setSelectedIds] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState('');
    const [search, setSearch] = useState('');
    const [pickerSearch, setPickerSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    const fetchVenues = async () => {
        try {
            const res = await venueApi.all();
            setVenues(res.data);
        } catch {
            setMsg('Failed to load places');
        }
    };

    useEffect(() => {
        fetchVenues();
        restaurantApi.all().then((res) => setRestaurants(res.data)).catch(() => {});
        cityApi.all().then((res) => setCities(res.data)).catch(() => {});
    }, []);

    const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

    const isInclusive = form.membershipMode === 'INCLUSIVE';

    const toggleRestaurant = (id) => {
        setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    };

    // The payload the API expects: blank numeric fields must go as null/omitted
    // rather than '' , and includeRadiusM is meaningless outside INCLUSIVE.
    const buildPayload = () => ({
        ...form,
        latitude: form.latitude === '' ? null : Number(form.latitude),
        longitude: form.longitude === '' ? null : Number(form.longitude),
        detectRadiusM: Number(form.detectRadiusM),
        includeRadiusM: isInclusive && form.includeRadiusM !== '' ? Number(form.includeRadiusM) : null,
    });

    const handleCreate = async () => {
        if (!form.name || form.latitude === '' || form.longitude === '') {
            setMsg('Name, latitude and longitude are required');
            return;
        }
        setLoading(true);
        try {
            const res = await venueApi.create(buildPayload());
            // Membership is a second call — the venue has to exist before
            // anything can be mapped into it.
            if (selectedIds.length) await venueApi.setRestaurants(res.data.id, selectedIds);
            resetForm();
            setMsg('Place created');
            fetchVenues();
        } catch (err) {
            setMsg(apiError(err, 'Error creating place'));
        } finally {
            setLoading(false);
        }
    };

    const handleUpdate = async () => {
        setLoading(true);
        try {
            await venueApi.update(editingId, buildPayload());
            // Sent unconditionally, including when empty — that is how unticking
            // the last restaurant actually removes it.
            await venueApi.setRestaurants(editingId, selectedIds);
            resetForm();
            setMsg('Place updated');
            fetchVenues();
        } catch (err) {
            setMsg(apiError(err, 'Error updating place'));
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (v) => {
        setForm({
            name: v.name || '',
            slug: v.slug || '',
            type: v.type || 'OTHER',
            description: v.description || '',
            address: v.address || '',
            latitude: v.latitude ?? '',
            longitude: v.longitude ?? '',
            detectRadiusM: v.detectRadiusM ?? 500,
            membershipMode: v.membershipMode || 'STRICT',
            includeRadiusM: v.includeRadiusM ?? '',
            cityId: v.cityId ?? '',
            logoUrl: v.logoUrl || '',
            coverUrl: v.coverUrl || '',
        });
        setSelectedIds((v.restaurants || []).map((m) => m.restaurant.id));
        setEditingId(v.id);
        setMsg('');
        setPickerSearch('');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDeactivate = async (id) => {
        if (!window.confirm('Deactivate this place? Customers will stop being detected into it and its /at/ page will 404.')) return;
        try {
            await venueApi.deactivate(id);
            fetchVenues();
        } catch (err) {
            setMsg(apiError(err, 'Error deactivating place'));
        }
    };

    const handleActivate = async (id) => {
        try {
            await venueApi.activate(id);
            fetchVenues();
        } catch (err) {
            setMsg(apiError(err, 'Error reactivating place'));
        }
    };

    const resetForm = () => {
        setForm(emptyForm);
        setSelectedIds([]);
        setEditingId(null);
        setPickerSearch('');
    };

    const cancelEdit = () => { resetForm(); setMsg(''); };

    const counts = {
        all: venues.length,
        active: venues.filter((v) => v.isActive).length,
        inactive: venues.filter((v) => !v.isActive).length,
    };

    const q = search.trim().toLowerCase();
    const filtered = venues
        .filter((v) => statusFilter === 'all' || (statusFilter === 'active' ? v.isActive : !v.isActive))
        .filter((v) => !q ||
            v.name.toLowerCase().includes(q) ||
            v.slug.toLowerCase().includes(q) ||
            (v.address || '').toLowerCase().includes(q));

    // Only active restaurants can be mapped — a deactivated one would never show
    // on the venue page anyway (see venueMemberIds).
    //
    // Ticked ones sort to the top, in selectedIds order. The list scrolls, so
    // otherwise a venue's own outlets can sit below the fold and the admin has
    // to hunt for what they already picked. Showing them in selection order has
    // a second benefit: that IS the `position` order outlets appear in on the
    // venue page, so the picker doubles as a preview of it.
    const pickerRestaurants = useMemo(() => {
        const pq = pickerSearch.trim().toLowerCase();
        const matches = restaurants
            .filter((r) => r.isActive)
            .filter((r) => !pq ||
                (r.name || '').toLowerCase().includes(pq) ||
                (r.address || '').toLowerCase().includes(pq) ||
                r.username.toLowerCase().includes(pq));
        const picked = selectedIds
            .map((id) => matches.find((r) => r.id === id))
            .filter(Boolean);
        return [...picked, ...matches.filter((r) => !selectedIds.includes(r.id))];
    }, [restaurants, pickerSearch, selectedIds]);

    const isError = msg.includes('Error') || msg.includes('Failed');

    return (
        <>
            <div className="page-header">
                <h1>Places</h1>
                <p>Group restaurants under a campus, mall or park — customers standing inside one see its outlets automatically</p>
            </div>

            {msg && (
                <div className="anim-fade-up" style={{
                    padding: '10px 14px', borderRadius: 8, marginBottom: 20, fontSize: 13,
                    background: isError ? 'rgba(248,113,113,0.14)' : 'rgba(52,211,153,0.14)',
                    color: isError ? '#f87171' : '#4ade80',
                    border: `1px solid ${isError ? 'rgba(248,113,113,0.3)' : 'rgba(52,211,153,0.3)'}`,
                }}>
                    {msg}
                </div>
            )}

            <VenuesOverview onOpenAnalytics={onOpenAnalytics} />

            {/* Form card */}
            <div className="card" style={{ marginBottom: 24 }}>
                <div className="card-header">
                    <span className="card-title">{editingId ? 'Edit Place' : 'New Place'}</span>
                    {editingId && <button className="btn btn-outline btn-sm" onClick={cancelEdit}>Cancel</button>}
                </div>
                <div className="card-body">
                    <div className="form-grid">
                        <div className="field">
                            <label>Name *</label>
                            <input name="name" value={form.name} onChange={handleChange} placeholder="VIT University, Vellore" />
                        </div>
                        <div className="field">
                            <label>Type</label>
                            <select name="type" value={form.type} onChange={handleChange}>
                                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                        </div>
                        <div className="field">
                            <label>Web address</label>
                            <input name="slug" value={form.slug} onChange={handleChange} placeholder="vit-vellore" />
                            <small style={{ color: '#94a3b8' }}>
                                {form.slug
                                    ? `Public page: /at/${form.slug}`
                                    : 'Public page lives at /at/<web address>. Leave blank to derive one from the name.'}
                            </small>
                        </div>
                        <div className="field">
                            <label>City</label>
                            <select name="cityId" value={form.cityId} onChange={handleChange}>
                                <option value="">No city set</option>
                                {cities.map((c) => <option key={c.id} value={c.id}>{c.name}{c.state ? `, ${c.state}` : ''}</option>)}
                            </select>
                        </div>
                        <div className="field" style={{ gridColumn: 'span 2' }}>
                            <label>Address</label>
                            <input name="address" value={form.address} onChange={handleChange} placeholder="VIT University, Katpadi, Vellore, TN 632014" />
                        </div>
                        <div className="field" style={{ gridColumn: 'span 2' }}>
                            <label>Description</label>
                            <input name="description" value={form.description} onChange={handleChange} placeholder="Food outlets across the campus — order from your hostel block or the car park." />
                        </div>
                        <div className="field">
                            <label>Latitude *</label>
                            <input name="latitude" type="number" step="any" min="-90" max="90" value={form.latitude} onChange={handleChange} placeholder="12.9692" />
                        </div>
                        <div className="field">
                            <label>Longitude *</label>
                            <input name="longitude" type="number" step="any" min="-180" max="180" value={form.longitude} onChange={handleChange} placeholder="79.1559" />
                        </div>
                        <div className="field">
                            <label>Detection radius (metres)</label>
                            <input name="detectRadiusM" type="number" min="25" max="20000" value={form.detectRadiusM} onChange={handleChange} placeholder="500" />
                            <small style={{ color: '#94a3b8' }}>
                                How close a customer must be to be shown this place. A spread-out campus wants ~900, a single mall building ~150.
                            </small>
                        </div>
                        <div className="field">
                            <label>Logo URL</label>
                            <input name="logoUrl" value={form.logoUrl} onChange={handleChange} placeholder="https://…" />
                        </div>
                        <div className="field" style={{ gridColumn: 'span 2' }}>
                            <label>Cover image URL</label>
                            <input name="coverUrl" value={form.coverUrl} onChange={handleChange} placeholder="https://…" />
                        </div>
                    </div>

                    {/* Membership mode — the one setting that changes behaviour
                        rather than presentation, so it gets its own block. */}
                    <div className="mode-block">
                        <label className="mode-block-label">Which restaurants appear here</label>
                        <div className="mode-options">
                            <label className={`mode-option ${form.membershipMode === 'STRICT' ? 'mode-option-active' : ''}`}>
                                <input
                                    type="radio"
                                    name="membershipMode"
                                    value="STRICT"
                                    checked={form.membershipMode === 'STRICT'}
                                    onChange={handleChange}
                                />
                                <span>
                                    <strong>Only the ones I pick</strong>
                                    <small>For a university or gated campus — nothing nearby leaks in.</small>
                                </span>
                            </label>
                            <label className={`mode-option ${isInclusive ? 'mode-option-active' : ''}`}>
                                <input
                                    type="radio"
                                    name="membershipMode"
                                    value="INCLUSIVE"
                                    checked={isInclusive}
                                    onChange={handleChange}
                                />
                                <span>
                                    <strong>The ones I pick, plus anything close by</strong>
                                    <small>For a mall or market square where the surrounding food counts too.</small>
                                </span>
                            </label>
                        </div>

                        <div className="field" style={{ maxWidth: 320, marginTop: 14 }}>
                            <label>Include radius (metres)</label>
                            <input
                                name="includeRadiusM"
                                type="number"
                                min="25"
                                max="50000"
                                value={form.includeRadiusM}
                                onChange={handleChange}
                                placeholder="3000"
                                disabled={!isInclusive}
                            />
                            <small style={{ color: '#94a3b8' }}>
                                {isInclusive
                                    ? 'Any restaurant within this distance of the place is listed, even if not picked below.'
                                    : 'Only used when "plus anything close by" is selected.'}
                            </small>
                        </div>
                    </div>

                    {/* Membership picker */}
                    <div className="picker">
                        <div className="picker-header">
                            <span className="picker-title">
                                Restaurants in this place
                                <span className="picker-count">{selectedIds.length} selected</span>
                            </span>
                            <input
                                className="search-input"
                                value={pickerSearch}
                                onChange={(e) => setPickerSearch(e.target.value)}
                                placeholder="Filter by name, address or username…"
                                style={{ maxWidth: 280 }}
                            />
                        </div>
                        <div className="picker-list">
                            {pickerRestaurants.length === 0 ? (
                                <div className="picker-empty">No matching restaurants</div>
                            ) : (
                                pickerRestaurants.map((r) => {
                                    const checked = selectedIds.includes(r.id);
                                    return (
                                        <label key={r.id} className={`picker-row ${checked ? 'picker-row-checked' : ''}`}>
                                            <input type="checkbox" checked={checked} onChange={() => toggleRestaurant(r.id)} />
                                            <span className="picker-row-body">
                                                <span className="picker-row-name">{r.name || r.username}</span>
                                                {/* Address disambiguates two outlets of the same chain. */}
                                                <span className="picker-row-meta">{r.address || 'No address set'}</span>
                                            </span>
                                            {(r.latitude == null || r.longitude == null) && (
                                                <span className="badge badge-inactive" title="Without coordinates this restaurant can only appear here if you pick it explicitly">
                                                    no coords
                                                </span>
                                            )}
                                        </label>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    <div style={{ marginTop: 16 }}>
                        <button
                            className="btn btn-primary"
                            onClick={editingId ? handleUpdate : handleCreate}
                            disabled={loading}
                        >
                            {loading ? '…' : editingId ? 'Save Changes' : 'Create Place'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Table card */}
            <div className="card">
                <div className="card-header" style={{ paddingBottom: 16, gap: 12, flexWrap: 'wrap' }}>
                    <span className="card-title">Places ({filtered.length})</span>
                    <div className="filter-tabs">
                        {STATUS_FILTERS.map((f) => (
                            <button
                                key={f.key}
                                className={`filter-tab ${statusFilter === f.key ? 'filter-tab-active' : ''}`}
                                onClick={() => setStatusFilter(f.key)}
                            >
                                {f.label} <span className="filter-tab-count">{counts[f.key]}</span>
                            </button>
                        ))}
                    </div>
                    <input
                        className="search-input"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search name, web address or city…"
                    />
                </div>
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Name</th>
                                <th>Type</th>
                                <th>Page</th>
                                <th>Membership</th>
                                <th>Detect</th>
                                <th>Restaurants</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr><td colSpan="9" style={{ textAlign: 'center', color: '#94a3b8', padding: '24px 0' }}>No places yet</td></tr>
                            ) : (
                                filtered.map((v) => (
                                    <tr key={v.id} className={v.isActive ? '' : 'row-inactive'}>
                                        <td style={{ color: '#94a3b8', fontFamily: 'monospace' }}>{v.id}</td>
                                        <td style={{ fontWeight: 500 }}>
                                            {v.name}
                                            {v.city?.name && <div style={{ fontSize: 11, color: '#71717a' }}>{v.city.name}</div>}
                                        </td>
                                        <td>{typeLabel(v.type)}</td>
                                        <td style={{ fontFamily: 'monospace', fontSize: 12 }}>/at/{v.slug}</td>
                                        <td style={{ minWidth: 150 }}>
                                            {v.membershipMode === 'INCLUSIVE' ? (
                                                <>
                                                    <div style={{ fontSize: 12 }}>Picked + nearby</div>
                                                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>within {v.includeRadiusM} m</div>
                                                </>
                                            ) : (
                                                <div style={{ fontSize: 12 }}>Picked only</div>
                                            )}
                                        </td>
                                        <td style={{ whiteSpace: 'nowrap' }}>{v.detectRadiusM} m</td>
                                        {/* Mapped count only — what was ticked. An INCLUSIVE place
                                            shows more than this to customers. */}
                                        <td>{v.mappedCount}</td>
                                        <td>
                                            <span className={`badge ${v.isActive ? 'badge-active' : 'badge-inactive'}`}>
                                                {v.isActive ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="action-row">
                                                <button className="btn btn-outline btn-sm" onClick={() => onOpenAnalytics(v.id)}>Analytics</button>
                                                <button className="btn btn-outline btn-sm" onClick={() => handleEdit(v)}>Edit</button>
                                                {v.isActive ? (
                                                    <button className="btn btn-danger btn-sm" onClick={() => handleDeactivate(v.id)}>Deactivate</button>
                                                ) : (
                                                    <button className="btn btn-outline btn-sm" onClick={() => handleActivate(v.id)}>Reactivate</button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
};

export default Venues;
