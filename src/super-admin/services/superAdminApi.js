import api from "../../api.js";

// Use the store's configured Axios client, bearer token and error handling.
const request = (promise) => promise.catch((error) => {
  if ([401, 403].includes(error.response?.status)) window.dispatchEvent(new Event("super-admin-session-check"));
  throw error;
});
const superAdminApi = {
  me: (config) => api.get("/auth/me", config),
  get: (path, config) => request(api.get(`/super-admin/${path}`, config)),
  patch: (path, updates) => request(api.patch(`/super-admin/${path}`, updates)),
  post: (path, input) => request(api.post(`/super-admin/${path}`, input)),
  logout: () => api.post("/auth/logout"),
};
export default superAdminApi;
