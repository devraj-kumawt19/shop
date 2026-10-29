export function can(user, permission) {
  return user?.role === "superadmin" || (user?.role === "seller" && permission === "catalog");
}
export function permit(...permissions) {
  return (req, res, next) => permissions.some((permission) => can(req.user, permission)) ? next() : res.status(403).json({ message: "Super Admin access is required for this action." });
}
