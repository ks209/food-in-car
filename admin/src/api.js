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
}

export default api
