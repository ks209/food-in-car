import axios from "axios"

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
})

export const userApi = {
  // Password register/login are disabled on the backend (routes/user/user.js)
  // — sign-in is phone OTP only, via firebaseLogin.
  // register: (data) => api.post("/api/user/register", data),
  // login: (data) => api.post("/api/user/login", data),
  firebaseLogin: (data) => api.post("/api/user/firebase-login", data),
  logout: () => api.post("/api/user/logout"),
  me: () => api.get("/api/user/me"),
  updateMe: (data) => api.put("/api/user/me", data),
}

export const restaurantApi = {
  get: (id) => api.get(`/api/restaurant/${id}`),
  nearby: (params) => api.get("/api/restaurant/nearby", { params }),
}

export const venueApi = {
  // The place a customer at these coordinates is standing in, or { venue: null }.
  detect: (params) => api.get("/api/venue/detect", { params }),
  get: (slugOrId) => api.get(`/api/venue/${slugOrId}`),
  // Same response shape as restaurantApi.nearby, so both feed RestCard directly.
  restaurants: (slugOrId, params) => api.get(`/api/venue/${slugOrId}/restaurants`, { params }),
  search: (params) => api.get("/api/venue", { params }),
}

export const cityApi = {
  all: () => api.get("/api/city"),
}

export const configApi = {
  get: () => api.get("/api/config"),
}

export const categoryApi = {
  byRestaurant: (restaurantId) => api.get(`/api/category/restaurant/${restaurantId}`),
}

export const menuApi = {
  getItem: (id) => api.get(`/api/menu/${id}`),
}

export const orderApi = {
  mine: () => api.get("/api/order/mine"),
  // code proves ownership for guest (unauthenticated) access — see order.js GET /:id
  get: (id, code) => api.get(`/api/order/${id}`, code ? { params: { code } } : undefined),
  // Asks PhonePe live (the order row itself only changes on webhook/cron)
  paymentStatus: (id, code) => api.get(`/api/payment/status/${id}`, { params: { code } }),
}

export default api
