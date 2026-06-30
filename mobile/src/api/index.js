import axios from "axios"

const api = axios.create({
  baseURL: "http://localhost:5000",
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
}

export const categoryApi = {
  byRestaurant: (restaurantId) => api.get(`/api/category/restaurant/${restaurantId}`),
}

export const menuApi = {
  getItem: (id) => api.get(`/api/menu/${id}`),
}

export const orderApi = {
  create: (data) => api.post("/api/order/create", data),
  mine: () => api.get("/api/order/mine"),
  get: (id) => api.get(`/api/order/${id}`),
}

export default api
