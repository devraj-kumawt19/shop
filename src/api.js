import axios from "axios";

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim() || "";
const apiBaseUrl = configuredApiUrl || (import.meta.env.DEV ? "/api" : "");
const apiConfigurationError = "ShopSphere API is not configured. Set VITE_API_URL in Vercel to the deployed API URL ending in /api.";
const apiResponseError = "The configured API URL returned a non-JSON response. Check that VITE_API_URL points to the deployed Express API ending in /api.";

function hasValidProductionApiUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /\/api\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}

const api = axios.create({
  baseURL: apiBaseUrl || "/api",
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  if (!import.meta.env.DEV && !hasValidProductionApiUrl(apiBaseUrl)) {
    return Promise.reject(new Error(apiConfigurationError));
  }
  const token = localStorage.getItem("shopsphere_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use((response) => {
  const contentType = response.headers["content-type"] || "";
  if (!contentType.toLowerCase().includes("json")) throw new Error(apiResponseError);
  return response;
});

export function getErrorMessage(error) {
  if (error.message === apiConfigurationError || error.message === apiResponseError || error.message === "ShopSphere API response is invalid.") return error.message;
  const responseType = error.response?.headers?.["content-type"] || "";
  if (responseType.toLowerCase().includes("text/html") || typeof error.response?.data === "string" && /^\s*<!doctype html/i.test(error.response.data)) {
    return apiResponseError;
  }
  return error.response?.data?.message || (error.code === "ECONNABORTED"
    ? "The store is taking too long to respond. Please try again."
    : error.response ? "Something went wrong. Please try again." : "The ShopSphere API is offline. Start the backend to connect to the live store.");
}

export default api;
