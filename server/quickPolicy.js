import { bad } from "./commercePolicy.js";
export function quickService(settings, postalCode, now = new Date()) {
  const code = typeof postalCode === "string" ? postalCode.trim() : "";
  const pincodes = String(settings.quickPincodes || "").split(/[\s,]+/).filter(Boolean);
  if (!/^\d{6}$/.test(code)) return { available: false, message: "Enter a valid 6-digit delivery PIN code." };
  if (!settings.quickDeliveryEnabled || settings.currency !== "INR" || !pincodes.includes(code)) return { available: false, message: "15-minute delivery is not available at this PIN code yet." };
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hourCycle: "h23" }).format(now));
  if (hour < settings.quickOpenHour || hour >= settings.quickCloseHour) return { available: false, message: `Express delivery runs ${String(settings.quickOpenHour).padStart(2, "0")}:00–${String(settings.quickCloseHour).padStart(2, "0")}:00 IST.` };
  return { available: true, minutes: 15, fee: settings.quickDeliveryFee, message: "15-minute delivery estimate available for eligible products." };
}
export function deliveryQuote(method = "standard", postalCode, products, settings, now) {
  if (method === "standard") return { method, fee: null };
  if (method !== "express15") throw bad("Choose a valid delivery option.");
  const service = quickService(settings, postalCode, now);
  if (!service.available) throw bad(service.message, 409);
  if (!products.length || products.some((p) => p.quickEligible !== true)) throw bad("Every product in your bag must be eligible for 15-minute delivery.", 409);
  return { method, fee: service.fee, minutes: 15 };
}
