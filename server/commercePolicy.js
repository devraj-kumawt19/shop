export const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
export const bad = (message, status = 400) => Object.assign(new Error(message), { status });
export const paymentWindowOpen = (order, now = Date.now()) => !order.createdAt || now - new Date(order.createdAt).getTime() < 30 * 60000;
export const httpsUrl = (value) => { try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; } };
export function normalizeVariants(input) {
  if (!Array.isArray(input) || input.length > 50) throw bad("Provide up to 50 product variants.");
  const seen = new Set();
  return input.map((item) => {
    const sku = typeof item.sku === "string" ? item.sku.trim().toUpperCase() : "";
    if (!/^[A-Z0-9_-]{2,40}$/.test(sku) || seen.has(sku)) throw bad("Each variant needs a unique SKU using 2–40 letters, numbers, underscores or hyphens.");
    seen.add(sku);
    if (!Number.isFinite(item.price) || item.price <= 0 || roundMoney(item.price) !== item.price || !Number.isInteger(item.stock) || item.stock < 0 || item.stock > 1000000) throw bad("Variant prices must be positive amounts with up to two decimals; stock must be a non-negative integer.");
    return { sku, price: item.price, stock: item.stock, size: String(item.size || "").trim().slice(0, 40), color: String(item.color || "").trim().slice(0, 40) };
  });
}
export function discountFor(coupon, subtotal, currency, now = new Date()) {
  if (!coupon || !coupon.active || coupon.currency !== currency || (coupon.startsAt && new Date(coupon.startsAt) > now) || (coupon.expiresAt && new Date(coupon.expiresAt) <= now) || (coupon.maxUses > 0 && coupon.uses >= coupon.maxUses)) throw bad("This coupon is unavailable or has expired.");
  if (subtotal < coupon.minimum) throw bad("Your order does not meet this coupon's minimum value.");
  const value = coupon.type === "percent" ? subtotal * coupon.amount / 100 : coupon.amount;
  return roundMoney(Math.max(0, Math.min(subtotal, coupon.maximumDiscount > 0 ? Math.min(value, coupon.maximumDiscount) : value)));
}
export function validateCoupon(input) {
  const code = String(input.code || "").trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,30}$/.test(code) || !["percent", "fixed"].includes(input.type) || !["USD", "INR"].includes(input.currency)) throw bad("Enter a valid code, coupon type and currency.");
  for (const name of ["amount", "minimum", "maximumDiscount", "maxUses"]) if (!Number.isFinite(input[name]) || input[name] < 0 || roundMoney(input[name]) !== input[name]) throw bad("Coupon amounts and limits must be valid non-negative numbers.");
  if (input.amount <= 0 || (input.type === "percent" && input.amount > 100) || !Number.isInteger(input.maxUses)) throw bad("Percentage discounts must be 1–100; usage limits must be whole numbers.");
  const dates = {};
  for (const key of ["startsAt", "expiresAt"]) if (input[key]) { dates[key] = new Date(input[key]); if (Number.isNaN(dates[key].getTime())) throw bad("Enter valid coupon dates."); }
  if (dates.startsAt && dates.expiresAt && dates.expiresAt <= dates.startsAt) throw bad("Expiry must be after the start date.");
  return { code, type: input.type, currency: input.currency, amount: input.amount, minimum: input.minimum, maximumDiscount: input.maximumDiscount, maxUses: input.maxUses, active: input.active !== false, ...dates };
}
export function parseCsv(text) {
  if (typeof text !== "string" || text.length > 100000) throw bad("Upload a CSV smaller than 100 KB.");
  const rows = []; let row = [], cell = "", quoted = false;
  for (let index = 0; index <= text.length; index++) {
    const char = text[index];
    if (quoted) { if (char === '"' && text[index + 1] === '"') { cell += '"'; index++; } else if (char === '"') quoted = false; else if (char === undefined) throw bad("CSV has an unclosed quote."); else cell += char; }
    else if (char === '"' && !cell) quoted = true;
    else if (char === ",") { row.push(cell.trim()); cell = ""; }
    else if (char === "\n" || char === undefined) { row.push(cell.trim().replace(/\r$/, "")); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (rows.length < 2 || rows.length > 101) throw bad("CSV must contain a header and 1–100 data rows.");
  const headers = rows.shift().map((header) => header.replace(/^\uFEFF/, ""));
  if (headers.join(",") !== "productId,variantSku,stock,reason") throw bad("CSV header must be productId,variantSku,stock,reason.");
  return rows.map((values) => { if (values.length !== headers.length) throw bad("Every CSV row must have four columns."); return Object.fromEntries(headers.map((key, index) => [key, values[index]])); });
}
export function csvCell(value) { const text = String(value ?? ""); return '"' + (/^[=+@\-\t\r]/.test(text) ? "'" : "") + text.replaceAll('"', '""') + '"'; }
