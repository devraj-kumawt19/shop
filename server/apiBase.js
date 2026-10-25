export function resolveApiBase(value = "", development = false) {
  const configured = value.trim();
  if (!configured || configured === "/api" || configured === "/api/") return "/api";
  try {
    const url = new URL(configured);
    const local = url.hostname === "localhost" || url.hostname.endsWith(".localhost") || /^127(?:\.\d{1,3}){3}$/.test(url.hostname) || url.hostname === "[::1]";
    const secure = url.protocol === "https:" && (development || !local);
    const localDevelopment = development && local && url.protocol === "http:";
    if ((!secure && !localDevelopment) || url.username || url.password || url.search || url.hash || !/\/api\/?$/.test(url.pathname)) throw new Error("Invalid API base");
    return configured.replace(/\/$/, "");
  } catch {
    throw new Error("Invalid VITE_API_URL. Use /api for the API in this deployment, or a public HTTPS backend URL ending in /api.");
  }
}
