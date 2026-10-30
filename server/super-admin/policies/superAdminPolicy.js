import { defaultStoreSettings } from "../../storeSettings.js";
import { adminPermissionOptions } from "../permissions.js";

export function requireSuperAdmin(req, res, next) {
  if (req.user?.role !== "superadmin") return res.status(403).json({ message: "Super admin access is required." });
  return next();
}

// Opt-in pagination preserves the response and behavior expected by existing staff screens.
export function adminListQuery(query, kind) {
  const page = Number(query.page);
  if (!Number.isInteger(page) || page < 1 || page > 100000) throw Object.assign(new Error("Enter a valid page number."), { status: 400 });
  const search = typeof query.search === "string" ? query.search.trim().slice(0, 100) : "";
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const fields = kind === "products" ? ["name", "category"] : ["orderNumber", "shippingAddress.email", "shippingAddress.firstName", "shippingAddress.lastName"];
  const filter = search ? { $or: fields.map((field) => ({ [field]: { $regex: escaped, $options: "i" } })) } : {};
  if (query.status) {
    if (kind === "products") {
      if (query.status === "in_stock") filter.stock = { $gt: 0 };
      else if (query.status === "low_stock") filter.stock = { $gt: 0, $lte: 5 };
      else if (query.status === "out_of_stock") filter.stock = 0;
      else throw Object.assign(new Error("Choose a valid stock filter."), { status: 400 });
    } else {
      if (!["awaiting_payment", "placed", "processing", "shipped", "delivered", "cancelled"].includes(query.status)) throw Object.assign(new Error("Choose a valid order status."), { status: 400 });
      filter.status = query.status;
    }
  }
  return { page, limit: 25, filter };
}

export function validateUserUpdate(actor, target, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return "Enter valid account updates.";
  if (actor.id === target.id || target.role === "superadmin") return "Super admin accounts cannot be changed here.";
  if (!["superadmin", "admin"].includes(actor.role)) return "Administrator access is required.";
  if (actor.role === "admin" && !["customer", "seller"].includes(target.role)) return "Only the owner can manage administrator accounts.";
  const keys = Object.keys(input);
  if (!keys.length || keys.some((key) => !["role", "isActive", "permissions"].includes(key))) return "Only account role, status and permissions can be updated.";
  if ("permissions" in input) {
    if (actor.role !== "superadmin") return "Only the owner can assign administrator permissions.";
    if (target.role !== "admin" && input.role !== "admin") return "Permissions can only be assigned to administrator accounts.";
    const allowed = new Set(adminPermissionOptions.map(({ value }) => value));
    if (!Array.isArray(input.permissions) || new Set(input.permissions).size !== input.permissions.length || input.permissions.some((permission) => !allowed.has(permission))) return "Choose valid, unique administrator permissions.";
  }
  const roles = actor.role === "superadmin" ? ["customer", "seller", "admin"] : ["customer", "seller"];
  if ("role" in input && !roles.includes(input.role)) return "Choose an allowed account role. Only the owner can assign admin access; Super Admins require a secure invitation.";
  if ("permissions" in input && input.role && input.role !== "admin") return "Only administrator accounts can receive permissions.";
  if ("isActive" in input && typeof input.isActive !== "boolean") return "Account status must be true or false.";
  return "";
}

export function validateSettings(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return "Enter valid website settings.";
  const textLimits = { siteName: 60, tagline: 160, announcement: 160, heroHeading: 100, heroAccent: 60, heroDescription: 600, heroImage: 2000, supportEmail: 254, footerDescription: 500, primaryColor: 7, saleTitle: 100, saleDescription: 300 };
  for (const [key, value] of Object.entries(input)) {
    if (!Object.hasOwn(defaultStoreSettings, key)) return "Unknown website setting.";
    if (Object.hasOwn(textLimits, key) && (typeof value !== "string" || !value.trim() || value.length > textLimits[key])) return `${key} is required and must be under ${textLimits[key]} characters.`;
    if (["freeShippingThreshold", "shippingFee"].includes(key) && (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100000 || Math.abs(value * 100 - Math.round(value * 100)) > 0.00001)) return "Shipping amounts must be valid non-negative amounts with up to two decimal places.";
  }
  if ("checkoutEnabled" in input && typeof input.checkoutEnabled !== "boolean") return "Checkout status must be true or false.";
  for (const key of ["onlinePaymentsEnabled", "saleEnabled"]) if (key in input && typeof input[key] !== "boolean") return "Toggle settings must be true or false.";
  if ("aiAssistantEnabled" in input && typeof input.aiAssistantEnabled !== "boolean") return "AI assistant status must be true or false.";
  for (const key of ["walletEnabled", "quickDeliveryEnabled"]) if (key in input && typeof input[key] !== "boolean") return "Commerce switches must be true or false.";
  if ("quickPincodes" in input && (typeof input.quickPincodes !== "string" || input.quickPincodes.length > 7000 || input.quickPincodes.split(/[\s,]+/).filter(Boolean).some((pin) => !/^\d{6}$/.test(pin)))) return "Enter 6-digit PIN codes separated by commas or spaces.";
  if ("quickDeliveryFee" in input && (!Number.isFinite(input.quickDeliveryFee) || input.quickDeliveryFee < 0 || input.quickDeliveryFee > 1000 || Math.round(input.quickDeliveryFee * 100) !== input.quickDeliveryFee * 100)) return "Enter a valid express-delivery fee.";
  for (const key of ["quickOpenHour", "quickCloseHour"]) if (key in input && (!Number.isInteger(input[key]) || input[key] < 0 || input[key] > (key === "quickCloseHour" ? 24 : 23))) return "Enter delivery opening/closing hours using 0–24.";
  if ("quickOpenHour" in input && "quickCloseHour" in input && input.quickOpenHour >= input.quickCloseHour) return "Express closing time must be after opening time.";
  if ("saleEndsAt" in input && (typeof input.saleEndsAt !== "string" || input.saleEndsAt && Number.isNaN(Date.parse(input.saleEndsAt)))) return "Enter a valid sale end date or leave it empty.";
  if ("lowStockThreshold" in input && (!Number.isInteger(input.lowStockThreshold) || input.lowStockThreshold < 0 || input.lowStockThreshold > 1000)) return "Low-stock threshold must be a whole number between 0 and 1000.";
  if ("currency" in input && !["USD", "INR"].includes(input.currency)) return "Choose USD or INR for the catalog currency.";
  if (input.supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.supportEmail)) return "Enter a valid support email.";
  if (input.primaryColor && !/^#[0-9a-f]{6}$/i.test(input.primaryColor)) return "Choose a valid brand color.";
  if (input.heroImage) {
    try { if (!["http:", "https:"].includes(new URL(input.heroImage).protocol)) return "Hero image must use HTTP or HTTPS."; }
    catch { return "Enter a valid hero image URL."; }
  }
  return "";
}
