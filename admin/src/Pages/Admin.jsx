import React, { useEffect, useState } from 'react';
import { restaurantApi, cityApi } from '../api';

const emptyForm = {
  name: '',
  domain: '',
  username: '',
  password: '',
  address: '',
  phone: '',
  paymentGateway: '',
  themeColor: '#f97316',
  logoUrl: '',
  latitude: '',
  longitude: '',
  cityId: '',
};

const GATEWAYS = ['PHONEPE', 'razorpay', 'COD'];

const Admin = ({ onLogout }) => {
  const [restaurants, setRestaurants] = useState([]);
  const [cities, setCities] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [search, setSearch] = useState('');

  const fetchRestaurants = async () => {
    try {
      const res = await restaurantApi.all();
      setRestaurants(res.data);
    } catch {
      setMsg('Failed to load restaurants');
    }
  };

  useEffect(() => {
    fetchRestaurants();
    cityApi.all().then((res) => setCities(res.data)).catch(() => {});
  }, []);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleCreate = async () => {
    if (!form.username || !form.password || !form.domain || !form.address) {
      setMsg('Username, password, domain, and address are required');
      return;
    }
    setLoading(true);
    try {
      await restaurantApi.create(form);
      setForm(emptyForm);
      setMsg('Restaurant created');
      fetchRestaurants();
    } catch {
      setMsg('Error creating restaurant');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    setLoading(true);
    try {
      await restaurantApi.update(editingId, form);
      setForm(emptyForm);
      setEditingId(null);
      setMsg('Restaurant updated');
      fetchRestaurants();
    } catch {
      setMsg('Error updating restaurant');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (r) => {
    setForm({
      name: r.name || '',
      domain: r.domain,
      username: r.username,
      password: '',
      address: r.address,
      phone: r.phone || '',
      paymentGateway: r.paymentGateway || '',
      themeColor: r.themeColor || '#f97316',
      logoUrl: r.logoUrl || '',
      latitude: r.latitude ?? '',
      longitude: r.longitude ?? '',
      cityId: r.cityId ?? '',
    });
    setEditingId(r.id);
    setMsg('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeactivate = async (id) => {
    if (!window.confirm('Deactivate this restaurant?')) return;
    try {
      await restaurantApi.deactivate(id);
      fetchRestaurants();
    } catch {
      setMsg('Error deactivating restaurant');
    }
  };

  const handleActivate = async (id) => {
    try {
      await restaurantApi.activate(id);
      fetchRestaurants();
    } catch {
      setMsg('Error reactivating restaurant');
    }
  };

  const cancelEdit = () => { setForm(emptyForm); setEditingId(null); setMsg(''); };

  const q = search.trim().toLowerCase();
  const filtered = q
    ? restaurants.filter((r) =>
        (r.name || '').toLowerCase().includes(q) ||
        r.username.toLowerCase().includes(q) ||
        r.domain.toLowerCase().includes(q))
    : restaurants;

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <div className="sidebar">
        <div>
          <div className="sidebar-logo">
            <img src="/carkhanaalogo.png" alt="Carkhanaa" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover' }} />
            <span>Carkhanaa</span>
          </div>
          <div className="sidebar-label">Admin Portal</div>
        </div>
        <button className="btn btn-outline btn-sm sidebar-logout" onClick={onLogout}>
          Sign Out
        </button>
      </div>

      {/* Main */}
      <div className="main">
        {/* Page header */}
        <div className="page-header">
          <h1>Restaurants</h1>
          <p>Create and manage restaurant accounts</p>
        </div>

        {msg && (
          <div className="anim-fade-up" style={{
            padding: '10px 14px', borderRadius: 8, marginBottom: 20, fontSize: 13,
            background: msg.includes('Error') || msg.includes('Failed') ? 'rgba(248,113,113,0.14)' : 'rgba(52,211,153,0.14)',
            color: msg.includes('Error') || msg.includes('Failed') ? '#f87171' : '#4ade80',
            border: `1px solid ${msg.includes('Error') || msg.includes('Failed') ? 'rgba(248,113,113,0.3)' : 'rgba(52,211,153,0.3)'}`,
          }}>
            {msg}
          </div>
        )}

        {/* Form card */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <span className="card-title">{editingId ? 'Edit Restaurant' : 'New Restaurant'}</span>
            {editingId && (
              <button className="btn btn-outline btn-sm" onClick={cancelEdit}>Cancel</button>
            )}
          </div>
          <div className="card-body">
            <div className="form-grid">
              <div className="field">
                <label>Display Name</label>
                <input name="name" value={form.name} onChange={handleChange} placeholder="Spice Garden" />
              </div>
              <div className="field">
                <label>Username *</label>
                <input name="username" value={form.username} onChange={handleChange} placeholder="spicegarden" />
              </div>
              <div className="field">
                <label>Password {editingId ? '(leave blank to keep)' : '*'}</label>
                <input name="password" type="password" value={form.password} onChange={handleChange} placeholder="••••••••" />
              </div>
              <div className="field">
                <label>Domain *</label>
                <input name="domain" value={form.domain} onChange={handleChange} placeholder="spicegarden.food" />
              </div>
              <div className="field" style={{ gridColumn: 'span 2' }}>
                <label>Address *</label>
                <input name="address" value={form.address} onChange={handleChange} placeholder="12 Curry Lane, Mumbai" />
              </div>
              <div className="field">
                <label>Phone</label>
                <input name="phone" value={form.phone} onChange={handleChange} placeholder="+91 98200 11111" />
              </div>
              <div className="field">
                <label>Payment Gateway</label>
                <select name="paymentGateway" value={form.paymentGateway} onChange={handleChange}>
                  <option value="">Select gateway…</option>
                  {GATEWAYS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Theme Color</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input name="themeColor" type="color" value={form.themeColor} onChange={handleChange} style={{ width: 40 }} />
                  <input name="themeColor" value={form.themeColor} onChange={handleChange} placeholder="#f97316" style={{ flex: 1 }} />
                </div>
              </div>
              <div className="field">
                <label>Logo URL</label>
                <input name="logoUrl" value={form.logoUrl} onChange={handleChange} placeholder="https://…" />
              </div>
              <div className="field">
                <label>Latitude</label>
                <input name="latitude" type="number" step="any" min="-90" max="90" value={form.latitude} onChange={handleChange} placeholder="19.0760" />
              </div>
              <div className="field">
                <label>Longitude</label>
                <input name="longitude" type="number" step="any" min="-180" max="180" value={form.longitude} onChange={handleChange} placeholder="72.8777" />
              </div>
              <div className="field">
                <label>City</label>
                <select name="cityId" value={form.cityId} onChange={handleChange}>
                  <option value="">No city set</option>
                  {cities.map((c) => <option key={c.id} value={c.id}>{c.name}{c.state ? `, ${c.state}` : ''}</option>)}
                </select>
              </div>
            </div>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
              Latitude/longitude power the mobile app's "nearby restaurants" homepage — leave blank to exclude this restaurant from that list until set.
              City is the fallback shown when a customer's location isn't available.
            </p>
            <div style={{ marginTop: 16 }}>
              <button
                className="btn btn-primary"
                onClick={editingId ? handleUpdate : handleCreate}
                disabled={loading}
              >
                {loading ? '…' : editingId ? 'Save Changes' : 'Create Restaurant'}
              </button>
            </div>
          </div>
        </div>

        {/* Table card */}
        <div className="card">
          <div className="card-header" style={{ paddingBottom: 16, gap: 12, flexWrap: 'wrap' }}>
            <span className="card-title">All Restaurants ({filtered.length})</span>
            <input
              className="search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, username or domain…"
            />
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Username</th>
                  <th>Domain</th>
                  <th>Phone</th>
                  <th>Gateway</th>
                  <th>Theme</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan="9" style={{ textAlign: 'center', color: '#94a3b8', padding: '24px 0' }}>No restaurants found</td></tr>
                ) : (
                  filtered.map((r) => (
                    <tr key={r.id}>
                      <td style={{ color: '#94a3b8', fontFamily: 'monospace' }}>{r.id}</td>
                      <td style={{ fontWeight: 500 }}>{r.name || '—'}</td>
                      <td>{r.username}</td>
                      <td>{r.domain}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{r.phone || '—'}</td>
                      <td>{r.paymentGateway || '—'}</td>
                      <td>
                        <div className="color-dot">
                          <span className="color-dot-circle" style={{ backgroundColor: r.themeColor || '#f97316' }} />
                          <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.themeColor || '#f97316'}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${r.isActive ? 'badge-active' : 'badge-inactive'}`}>
                          {r.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <div className="action-row">
                          <button className="btn btn-outline btn-sm" onClick={() => handleEdit(r)}>Edit</button>
                          {r.isActive ? (
                            <button className="btn btn-danger btn-sm" onClick={() => handleDeactivate(r.id)}>Deactivate</button>
                          ) : (
                            <button className="btn btn-outline btn-sm" onClick={() => handleActivate(r.id)}>Reactivate</button>
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
      </div>
    </div>
  );
};

export default Admin;
