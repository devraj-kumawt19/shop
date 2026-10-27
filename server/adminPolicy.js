import { defaultStoreSettings } from "./storeSettings.js";
import { staffPermissions } from "./permissions.js";

export function requireSuperAdmin(req, res, next) {
  if (req.user?.role !== "superadmin") return res.status(403).json({ message: "Super admin access is required." });
  return next();
}

export function validateUserUpdate(actor, target, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return "Enter valid account updates.";
  if (actor.id === target.id || target.role === "superadmin") return "Super admin accounts cannot be changed here.";
  const keys = Object.keys(input);
  if (!keys.length || keys.some((key) => !["role", "isActive", "permissions"].includes(key))) return "Only account role, permissions and status can be updated.";
  if ("role" in input && !["customer", "admin"].includes(input.role)) return "Choose customer or admin. Super admins are provisioned securely on the server.";
  if ("isActive" in input && typeof input.isActive !== "boolean") return "Account status must be true or false.";
  if ("permissions" in input && (!Array.isArray(input.permissions) || input.permissions.some((value) => !staffPermissions.includes(value)) || new Set(input.permissions).size !== input.permissions.length)) return "Choose valid, distinct staff permissions.";
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
