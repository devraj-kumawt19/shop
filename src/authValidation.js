export function validateAuth(values, mode) {
  const errors = {};
  if (mode === "register" && (values.name.trim().length < 2 || values.name.trim().length > 80)) errors.name = "Enter your name using 2–80 characters.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()) || values.email.trim().length > 254) errors.email = "Enter a valid email address.";
  if (!values.password) errors.password = "Enter your password.";
  else if ((mode === "register" && values.password.length < 8) || values.password.length > 128) errors.password = mode === "register" ? "Use 8–128 characters for your password." : "Your password must be no more than 128 characters.";
  if (mode === "register" && (!values.confirmPassword || values.password !== values.confirmPassword)) errors.confirmPassword = "Passwords must match. Please check and try again.";
  return errors;
}

export function authDestination(role, requestedPath) {
  const fallback = role === "superadmin" ? "/super-admin/dashboard" : role === "seller" ? "/seller" : "/profile";
  if (typeof requestedPath !== "string" || !/^\/(checkout|cart|wishlist|profile|my-orders|products|categories|admin|seller|super-admin)(?:\/|\?|#|$)/.test(requestedPath) || requestedPath.includes("\\")) return fallback;
  if (!["superadmin", "seller"].includes(role) && /^\/(admin|seller|super-admin)(?:\/|\?|#|$)/.test(requestedPath)) return fallback;
  if (role === "seller" && /^\/(admin|super-admin)(?:\/|\?|#|$)/.test(requestedPath)) return fallback;
  return requestedPath;
}
