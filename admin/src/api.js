import axios from 'axios'

// .trim() guards against the stray leading space in VITE_SERVER (admin/.env).
const baseURL = (import.meta.env.VITE_SERVER || 'http://localhost:5000').trim()

const api = axios.create({ baseURL, withCredentials: true })

export const support = {
  login: (data) => api.post('/api/support/login', data),
  me: () => api.get('/api/support/me'),
  logout: () => api.post('/api/support/logout'),
}

export const restaurantApi = {
  all: () => api.get('/api/restaurant/all'),
  create: (data) => api.post('/api/restaurant/create', data),
  update: (id, data) => api.put(`/api/restaurant/update/${id}`, data),
  deactivate: (id) => api.delete(`/api/restaurant/delete/${id}`),
  activate: (id) => api.put(`/api/restaurant/activate/${id}`),
  // Transfer between deployments — see backend utils/restaurantTransfer.js
  export: (idOrSlug) => api.get(`/api/restaurant/export/${idOrSlug}`),
  import: (payload) => api.post('/api/restaurant/import', payload),
}

export const venueApi = {
  all: () => api.get('/api/venue/all'),
  create: (data) => api.post('/api/venue/create', data),
  update: (id, data) => api.put(`/api/venue/update/${id}`, data),
  deactivate: (id) => api.delete(`/api/venue/delete/${id}`),
  activate: (id) => api.put(`/api/venue/activate/${id}`),
  // Set-not-patch: send the full ticked list every time; array order becomes
  // each restaurant's `position` on the venue page.
  setRestaurants: (id, restaurantIds) => api.put(`/api/venue/${id}/restaurants`, { restaurantIds }),
  // params: { from, to, tzOffset } — tzOffset is minutes east of UTC, so the
  // day buckets match the calendar the admin is actually looking at.
  analytics: (id, params) => api.get(`/api/venue/${id}/analytics`, { params }),
  overview: (params) => api.get('/api/venue/analytics/overview', { params }),
}

export const cityApi = {
  all: () => api.get('/api/city'),
}

export default api
