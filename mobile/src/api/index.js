import axios from "axios"

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
})

export const userApi = {
  register: (data) => api.post("/api/user/register", data),
  login: (data) => api.post("/api/user/login", data),
  logout: () => api.post("/api/user/logout"),
  me: () => api.get("/api/user/me"),
}

export const restaurantApi = {
  get: (id) => api.get(`/api/restaurant/${id}`),
  nearby: (params) => api.get("/api/restaurant/nearby", { params }),
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
}

export default api
