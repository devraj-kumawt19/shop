import axios from "axios";
import { resolveApiBase } from "../server/apiBase.js";

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim() || "";
let apiBaseUrl = "/api";
let apiConfigurationError = "";
try { apiBaseUrl = resolveApiBase(configuredApiUrl, import.meta.env.DEV); }
catch (error) { apiConfigurationError = error.message; }
const apiResponseError = "The API returned a non-JSON response. Confirm that the Vercel API function is deployed and /api requests are excluded from the SPA fallback.";

const api = axios.create({
  baseURL: apiBaseUrl || "/api",
  timeout: import.meta.env.DEV ? 10000 : 30000,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  if (apiConfigurationError) {
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
