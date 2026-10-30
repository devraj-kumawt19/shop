export const adminPermissionOptions = [
  { value: "sellers", label: "Seller management" },
  { value: "customers", label: "Customer accounts" },
  { value: "catalog", label: "Products and categories" },
  { value: "inventory", label: "Inventory management" },
  { value: "orders", label: "Order management" },
  { value: "reviews", label: "Review moderation" },
];

export function can(user, permission) {
  return user?.role === "superadmin"
    || (user?.role === "admin" && adminPermissionOptions.some((option) => option.value === permission) && Array.isArray(user.permissions) && user.permissions.includes(permission))
    || (user?.role === "seller" && permission === "catalog");
}
export function permit(...permissions) {
  return (req, res, next) => permissions.some((permission) => can(req.user, permission))
    ? next()
    : res.status(403).json({ message: "This account does not have permission to perform this action." });
}
