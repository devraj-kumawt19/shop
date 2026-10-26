export const staffPermissions = ["catalog", "inventory", "orders", "reviews", "reports", "support"];
export function can(user, permission) {
  return user?.role === "superadmin" || (user?.role === "admin" && (!Array.isArray(user.permissions) || user.permissions.includes(permission)));
}
export function permit(...permissions) {
  return (req, res, next) => permissions.some((permission) => can(req.user, permission)) ? next() : res.status(403).json({ message: "Your staff account does not have permission for this action." });
}
