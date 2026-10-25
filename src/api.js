import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("shopsphere_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function getErrorMessage(error) {
  return error.response?.data?.message || (error.code === "ECONNABORTED"
    ? "The store is taking too long to respond. Please try again."
    : error.response ? "Something went wrong. Please try again." : "The ShopSphere API is offline. Start the backend to connect to the live store.");
}

export default api;
