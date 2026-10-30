import { test, before, beforeEach, after, mock } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { Product, Category, Order, User, StoreSettings, Coupon, CouponUse, CartState, Review, ProductAlert, Inbox, StockMovement, AuditLog } from "../db/models.js";
import { normalizeVariants, discountFor, validateCoupon, parseCsv, csvCell, paymentWindowOpen } from "../commercePolicy.js";
import { priceCart, reserveCoupon, releaseCoupon, expirePendingOrders } from "../orderLogic.js";
import { reviewInput, trackingInput, syncTracking } from "../routes/commerce.js";
import { productMetadata, siteUrl } from "../routes/seo.js";
import { defaultStoreSettings } from "../storeSettings.js";
import { can } from "../super-admin/permissions.js";
import { validateUserUpdate } from "../super-admin/policies/superAdminPolicy.js";
import { invoicePdf } from "../invoice.js";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "advanced-test-only-authentication-secret-32-chars";
const { app } = await import("../app.js");
const ids = { user: "aaaaaaaaaaaaaaaaaaaaaaaa", other: "bbbbbbbbbbbbbbbbbbbbbbbb", product: "cccccccccccccccccccccccc", order: "dddddddddddddddddddddddd", coupon: "eeeeeeeeeeeeeeeeeeeeeeee" };
const query = (value) => ({ session() { return this; }, select() { return this; }, populate() { return this; }, sort() { return this; }, skip() { return this; }, limit() { return this; }, lean: async () => value, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } });
let server, base, user, settings, products, productFilter, productCountFilters, coupon, writes, foundOrder, review, inboxFilter, orderFilter, expiry;
const stockOptions = () => [{ sku: "TEE-M-BLUE", size: "M", color: "Blue", price: 45.5, stock: 3 }, { sku: "TEE-L-BLUE", size: "L", color: "Blue", price: 48, stock: 7 }];
const sampleOrder = () => ({ id: ids.order, _id: ids.order, orderNumber: "SS-TEST-INVOICE", user: ids.user, items: [{ product: ids.product, name: "Everyday cotton tee", image: "https://example.test/tee.jpg", price: 45.5, quantity: 2, variantSku: "TEE-M-BLUE", variantLabel: "M / Blue" }], subtotal: 91, discount: 9.1, couponCode: "SAVE10", shipping: 0, total: 81.9, currency: "INR", status: "delivered", paymentMethod: "cash_on_delivery", paymentStatus: "pending", createdAt: new Date(), timeline: [], shippingAddress: { firstName: "Test", lastName: "Buyer", email: "test@example.test", street: "123 Example Lane", city: "Delhi", state: "Delhi", postalCode: "110001", phone: "1234567890" }, save: async () => {} });
async function request(path, { method = "GET", body, anonymous = false } = {}) {
  const response = await fetch(`${base}/api${path}`, { method, headers: { "Content-Type": "application/json", ...(!anonymous ? { Authorization: `Bearer ${jwt.sign({ sub: ids.user, role: "superadmin" }, process.env.JWT_SECRET)}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const type = response.headers.get("content-type"); return { status: response.status, type, body: type?.includes("json") ? await response.json() : Buffer.from(await response.arrayBuffer()) };
}
before(async () => {
  mongoose.connection.readyState = 1;
  mock.method(mongoose, "startSession", async () => ({ withTransaction: async (handler) => handler(), endSession: async () => {} }));
  mock.method(User, "findById", async () => user);
  mock.method(StoreSettings, "findById", () => query(settings));
  mock.method(Product, "find", (filter) => { productFilter = filter; return query(products.filter((product) => filter?.isPublished?.$ne !== false || product.isPublished !== false)); });
  mock.method(Product, "countDocuments", async (filter = {}) => {
    productCountFilters.push(filter);
    return products.filter((product) => (!filter.seller || product.seller === filter.seller)
      && (filter.stock?.$gt === undefined || product.stock > filter.stock.$gt)
      && (filter.stock?.$lte === undefined || product.stock <= filter.stock.$lte)
      && (filter.stock !== 0 || product.stock === 0)).length;
  });
  mock.method(Product, "findOne", (filter) => query(products.find((product) => String(product._id) === String(filter._id) && (!filter.seller || product.seller === filter.seller)) || null));
  mock.method(Category, "exists", async ({ slug }) => slug === "home");
  mock.method(Product, "create", async ([input]) => {
    const product = { ...input, _id: ids.product, id: ids.product, updatedAt: new Date() };
    products = [product];
    return [product];
  });
  mock.method(Product, "findOneAndUpdate", async (filter, updates) => {
    const product = products.find((entry) => String(entry._id) === String(filter._id) && entry.seller === filter.seller && entry.updatedAt === filter.updatedAt);
    if (!product) return null;
    const updated = { ...product, ...updates, updatedAt: new Date() };
    products = [updated];
    return updated;
  });
  mock.method(Product, "findById", () => query(products[0]));
  mock.method(Product, "updateOne", async (...args) => { writes.push(["product", ...args]); return { modifiedCount: 1 }; });
  mock.method(Order, "findOne", (filter) => { orderFilter = filter; return query(foundOrder && (!filter.user || filter.user === foundOrder.user) ? foundOrder : null); });
  mock.method(Order, "find", () => query(expiry));
  mock.method(Order, "updateOne", async (...args) => { writes.push(["order", ...args]); return { modifiedCount: 1 }; });
  mock.method(Coupon, "findOne", () => query(coupon));
  mock.method(Coupon, "updateOne", async (...args) => { writes.push(["coupon", ...args]); return { modifiedCount: 1 }; });
  mock.method(CouponUse, "exists", () => query(false));
  mock.method(CouponUse, "create", async (...args) => { writes.push(["coupon-use", ...args]); });
  mock.method(CouponUse, "deleteOne", async (...args) => { writes.push(["release", ...args]); });
  mock.method(CartState, "findOneAndUpdate", async (...args) => { writes.push(["cart", ...args]); });
  mock.method(Review, "findOneAndUpdate", async (...args) => { writes.push(["review", ...args]); return review; });
  mock.method(Review, "aggregate", () => query([{ rating: 4.5, count: 2 }]));
  mock.method(Review, "find", () => query([]));
  mock.method(ProductAlert, "findOneAndUpdate", async (...args) => { writes.push(["alert", ...args]); return {}; });
  mock.method(ProductAlert, "deleteOne", async (...args) => { writes.push(["alert-remove", ...args]); });
  mock.method(ProductAlert, "find", () => query([]));
  mock.method(Inbox, "find", (filter) => { inboxFilter = filter; return query([]); });
  mock.method(Inbox, "countDocuments", async () => 0);
  mock.method(Inbox, "updateMany", async (...args) => { writes.push(["read", ...args]); });
  mock.method(StockMovement, "find", () => query([]));
  mock.method(StockMovement, "create", async (...args) => { writes.push(["movement", ...args]); });
  mock.method(AuditLog, "create", async () => {});
  await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); }); base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(() => {
  user = { id: ids.user, role: "customer", isActive: true }; settings = { ...defaultStoreSettings, currency: "INR" }; products = [{ _id: ids.product, name: "Everyday cotton tee", image: "https://example.test/tee.jpg", price: 45.5, stock: 10, variants: stockOptions(), description: "A soft everyday cotton tee." }]; productFilter = null; productCountFilters = []; coupon = { id: ids.coupon, _id: ids.coupon, code: "SAVE10", type: "percent", amount: 10, minimum: 0, maximumDiscount: 0, maxUses: 10, uses: 0, active: true, currency: "INR" }; writes = []; foundOrder = null; review = {}; expiry = [];
});
after(async () => { await new Promise((resolve) => server.close(resolve)); mock.restoreAll(); mongoose.connection.readyState = 0; });

test("variant validation normalizes unique SKUs and rejects fractional stock, duplicate options and unsafe prices", () => {
  assert.equal(normalizeVariants([{ ...stockOptions()[0], sku: " tee-m " }])[0].sku, "TEE-M");
  for (const variants of [[...stockOptions(), stockOptions()[0]], [{ ...stockOptions()[0], price: -1 }], [{ ...stockOptions()[0], stock: .5 }], [{ ...stockOptions()[0], sku: "bad sku" }], [{ ...stockOptions()[0], price: 1.001 }]]) assert.throws(() => normalizeVariants(variants));
});
test("cart reprices selected variants, merges quantities and rejects unavailable or missing SKU", async () => {
  const input = { product: ids.product, quantity: 1, variantSku: "TEE-M-BLUE", price: 1 };
  const priced = await priceCart([input, { ...input, quantity: 2 }]); assert.equal(priced.subtotal, 136.5); assert.equal(priced.orderItems.length, 1); assert.equal(priced.orderItems[0].variantLabel, "M / Blue");
  await assert.rejects(priceCart([{ ...input, quantity: 4 }]), /enough stock/); await assert.rejects(priceCart([{ product: ids.product, quantity: 1 }]), /Choose an available option/);
  await assert.rejects(priceCart([{ ...input, quantity: 99 }, { ...input, quantity: 1 }]), /up to 99/);
});
test("products hidden after seller deactivation cannot be ordered", async () => {
  products[0].isPublished = false;
  await assert.rejects(priceCart([{ product: ids.product, quantity: 1, variantSku: "TEE-M-BLUE" }]), /no longer available/);
  assert.deepEqual(productFilter.isPublished, { $ne: false });
});
test("coupons enforce currency, time windows, caps, minimum and usage limits", () => {
  assert.equal(discountFor(coupon, 91, "INR"), 9.1); assert.equal(discountFor({ ...coupon, maximumDiscount: 5 }, 91, "INR"), 5);
  assert.equal(discountFor({ ...coupon, type: "fixed", amount: 500 }, 91, "INR"), 91);
  for (const overrides of [{ active: false }, { currency: "USD" }, { minimum: 100 }, { uses: 10 }, { startsAt: new Date(Date.now() + 60000) }, { expiresAt: new Date(0) }]) assert.throws(() => discountFor({ ...coupon, ...overrides }, 91, "INR"));
  const input = { ...coupon, minimum: 0, maximumDiscount: 0, maxUses: 0 };
  assert.equal(validateCoupon(input).code, "SAVE10"); assert.throws(() => validateCoupon({ ...input, amount: 101 })); assert.throws(() => validateCoupon({ ...input, maxUses: .5 }));
});
test("coupon quote uses server price and requires authentication", async () => {
  const body = { code: "save10", items: [{ product: ids.product, variantSku: "TEE-M-BLUE", quantity: 2 }], subtotal: 1 };
  assert.equal((await request("/coupons/quote", { method: "POST", body, anonymous: true })).status, 401);
  const result = await request("/coupons/quote", { method: "POST", body }); assert.equal(result.status, 200); assert.equal(result.body.subtotal, 91); assert.equal(result.body.discount, 9.1);
});
test("coupon reservation atomically guards capacity and releases only a committed reservation", async () => {
  const session = {}; await reserveCoupon(coupon, ids.user, ids.order, session);
  assert.deepEqual(writes[0][1].$or, [{ maxUses: 0 }, { $expr: { $lt: ["$uses", "$maxUses"] } }]); assert.equal(writes[0][3].session, session); assert.equal(writes[1][1][0].user, ids.user);
  const order = { id: ids.order, coupon: ids.coupon, couponCommitted: true }; await releaseCoupon(order, session); assert.equal(order.couponCommitted, false); const length = writes.length; await releaseCoupon(order, session); assert.equal(writes.length, length);
});
test("expired payment windows close and pending-order maintenance releases discounts", async () => {
  assert.equal(paymentWindowOpen({ createdAt: new Date(Date.now() - 31 * 60000) }), false); assert.equal(paymentWindowOpen({ createdAt: new Date() }), true);
  foundOrder = { ...sampleOrder(), status: "awaiting_payment", coupon: ids.coupon, couponCommitted: true }; expiry = [{ _id: ids.order }]; await expirePendingOrders(); assert.equal(foundOrder.status, "cancelled"); assert.equal(foundOrder.couponCommitted, false);
});
test("CSV parsing preserves quoted reasons and rejects malformed, wrong-header and oversized imports", () => {
  const text = `productId,variantSku,stock,reason\r\n${ids.product},TEE-M-BLUE,5,"Restock, batch 2"\r\n`;
  assert.equal(parseCsv(text)[0].reason, "Restock, batch 2");
  for (const invalid of ["wrong,header\na,b", 'productId,variantSku,stock,reason\nx,y,2,"unclosed', "x".repeat(100001), "productId,variantSku,stock,reason\na,b,2"]) assert.throws(() => parseCsv(invalid));
  assert.equal(csvCell("=SUM(A1)"), '"\'=SUM(A1)"'); assert.equal(csvCell('a"b'), '"a""b"');
});
test("legacy admin accounts only have seller product access and cannot use staff operations", async () => {
  user.role = "admin"; user.permissions = ["inventory", "catalog", "orders", "support"];
  assert.equal((await request("/seller/products")).status, 200);
  assert.deepEqual(productFilter, { seller: ids.user });
  assert.deepEqual((await request("/seller/dashboard")).body.summary, { products: 0, lowStock: 0, outOfStock: 0 });
  assert.equal((await request("/admin/dashboard")).status, 403);
  for (const path of ["/admin/products", "/admin/inventory", "/admin/orders", "/admin/reports", "/admin/reviews"]) {
    assert.equal((await request(path)).status, 403, path);
  }
  assert.equal((await request("/admin/accounts/users")).status, 403);
  assert.equal(can({ role: "admin" }, "catalog"), false);
  assert.equal(can({ role: "admin" }, "inventory"), false);
  assert.equal(can({ role: "admin", permissions: ["inventory"] }, "inventory"), true);
  assert.equal(can({ role: "customer", permissions: ["inventory"] }, "inventory"), false);
  user.role = "superadmin";
  assert.equal((await request("/admin/inventory")).status, 200);
  assert.equal(can({ role: "superadmin", permissions: [] }, "reports"), true);
  assert.equal(validateUserUpdate({ id: ids.user, role: "superadmin" }, { id: ids.other, role: "customer" }, { role: "admin" }), "");
});

test("sellers can only open their product workspace and cannot access store operations", async () => {
  user.role = "seller";
  assert.equal((await request("/seller/products")).status, 200);
  assert.deepEqual(productFilter, { seller: ids.user });
  for (const path of ["/seller/orders", "/seller/inventory", "/seller/coupons", "/seller/categories"]) {
    const result = await request(path, { method: path.endsWith("categories") ? "POST" : "GET", body: path.endsWith("categories") ? { name: "Injected collection" } : undefined });
    assert.equal(result.status, 403, path);
  }
  assert.equal(can(user, "catalog"), true);
  assert.equal(can(user, "inventory"), false);
});
test("seller dashboard metrics are scoped to the signed-in seller", async () => {
  user.role = "seller";
  products[0].seller = ids.user;
  products[0].stock = 3;
  const result = await request("/seller/dashboard");
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.summary, { products: 1, lowStock: 1, outOfStock: 0 });
  assert.deepEqual(productCountFilters, [
    { seller: ids.user },
    { seller: ids.user, stock: { $gt: 0, $lte: 5 } },
    { seller: ids.user, stock: 0 },
  ]);
});
test("seller listings publish immediately, belong to their creator and reject edits to another seller's products", async () => {
  user.role = "seller";
  const result = await request("/seller/products", {
    method: "POST",
    body: { name: "Seller product", category: "Home", categorySlug: "home", description: "A useful product", image: "https://example.test/item.jpg", price: 20, stock: 8, variants: [{ sku: "SELLER-1", size: "M", color: "Blue", price: 20, stock: 8 }], seller: ids.other, featured: true, isDemo: true, quickEligible: true },
  });
  assert.equal(result.status, 201);
  assert.equal(result.body.product.seller, ids.user);
  assert.equal(result.body.product.isPublished, true);
  assert.equal(result.body.product.featured, false);
  assert.equal(result.body.product.isDemo, false);
  assert.equal(result.body.product.quickEligible, false);
  assert.equal(writes.find(([type]) => type === "movement")[1][0].delta, 8);

  const updated = await request(`/seller/products/${ids.product}`, { method: "PATCH", body: { price: 20, stock: 8, variants: [{ sku: "SELLER-1", size: "M", color: "Blue", price: 20, stock: 10 }, { sku: "SELLER-2", size: "L", color: "Blue", price: 25, stock: 2 }] } });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.product.stock, 12);
  assert.deepEqual(writes.filter(([type]) => type === "movement").at(-1)[1].map((movement) => movement.delta), [2, 2]);

  products[0].seller = ids.other;
  const forbidden = await request(`/seller/products/${ids.product}`, { method: "PATCH", body: { price: 1 } });
  assert.equal(forbidden.status, 404);
});
test("inventory writes include stock movement, reject duplicate import rows and require inventory scope", async () => {
  const body = { productId: ids.product, variantSku: "TEE-M-BLUE", stock: "5", reason: "Restock" };
  assert.equal((await request("/admin/inventory/adjust", { method: "POST", body })).status, 403); user.role = "superadmin";
  const result = await request("/admin/inventory/adjust", { method: "POST", body }); assert.equal(result.status, 200); const productWrite = writes.find(([type]) => type === "product"); assert.equal(productWrite[2].$inc["variants.$.stock"], 2); assert.equal(writes.find(([type]) => type === "movement")[1][0].reason, "Restock");
  const row = `${ids.product},TEE-M-BLUE,5,Restock`; const length = writes.length; assert.equal((await request("/admin/inventory/import", { method: "POST", body: { csv: `productId,variantSku,stock,reason\n${row}\n${row}` } })).status, 400); assert.equal(writes.length, length);
});
test("reviews require a delivered purchase and only accept HTTPS photo links", async () => {
  const body = { rating: 5, text: "Comfortable and a good fit.", photos: [] };
  assert.equal((await request(`/products/${ids.product}/review`, { method: "PUT", body })).status, 403); assert.equal(orderFilter.user, ids.user); assert.equal(orderFilter.status, "delivered");
  foundOrder = sampleOrder(); assert.equal((await request(`/products/${ids.product}/review`, { method: "PUT", body })).status, 200); assert.equal(writes.find(([type]) => type === "review")[1].user, ids.user);
  assert.throws(() => reviewInput({ ...body, photos: ["javascript:alert(1)"] })); assert.throws(() => reviewInput({ ...body, rating: 6 }));
});
test("inbox read status, saved carts and alert deletion are scoped to the signed-in user", async () => {
  assert.equal((await request("/notifications")).status, 200); assert.deepEqual(inboxFilter, { user: ids.user });
  await request("/notifications/read", { method: "PATCH", body: { user: ids.other } }); assert.equal(writes.find(([type]) => type === "read")[1].user, ids.user);
  await request(`/alerts/${ids.coupon}`, { method: "DELETE" }); assert.equal(writes.find(([type]) => type === "alert-remove")[1].user, ids.user);
  const body = { user: ids.other, items: [{ product: ids.product, quantity: 2, variantSku: "TEE-M-BLUE" }], subtotal: .01 };
  assert.equal((await request("/cart", { method: "PUT", body })).status, 200); const write = writes.find(([type]) => type === "cart"); assert.equal(write[1].user, ids.user); assert.equal(write[2].$set.subtotal, 91);
});
test("price alerts reject higher target prices, invalid types and already available stock alerts", async () => {
  const path = `/products/${ids.product}/alerts`;
  for (const body of [{ type: "price", targetPrice: 100 }, { type: "stock" }, { type: "bad" }]) assert.equal((await request(path, { method: "POST", body })).status, 400);
  assert.equal((await request(path, { method: "POST", body: { type: "price", targetPrice: 40, user: ids.other } })).status, 200); assert.equal(writes.find(([type]) => type === "alert")[1].user, ids.user);
});
test("invoice PDFs and tracking reject other customers and retired admins but allow Super Admins", async () => {
  foundOrder = { ...sampleOrder(), user: ids.other };
  assert.equal((await request(`/orders/${ids.order}/invoice`)).status, 404); assert.equal((await request(`/orders/${ids.order}/tracking`)).status, 404);
  user.role = "admin"; user.permissions = ["inventory"]; assert.equal((await request(`/orders/${ids.order}/invoice`)).status, 404);
  user.permissions = ["support"]; assert.equal((await request(`/orders/${ids.order}/invoice`)).status, 404); user.role = "superadmin"; const result = await request(`/orders/${ids.order}/invoice`); assert.equal(result.status, 200); assert.match(result.type, /application\/pdf/); assert.equal(result.body.subarray(0, 5).toString(), "%PDF-");
});
test("PDF invoices paginate long orders and preserve original order currency and amounts", async () => {
  const order = sampleOrder(); order.items = Array.from({ length: 50 }, (_, i) => ({ ...order.items[0], name: `A long product description with a detailed item name ${i + 1}` }));
  const pdf = await invoicePdf(order, settings); assert.equal(pdf.subarray(0, 5).toString(), "%PDF-"); assert.ok(pdf.length > 10000); assert.ok([...pdf.toString("latin1").matchAll(/\/Type \/Page\b/g)].length > 1);
});
test("tracking input rejects script/credential links and provider sync needs a real token", async () => {
  assert.equal(trackingInput({ carrier: "Shiprocket", awb: "123456" }).awb, "123456");
  for (const url of ["javascript:alert(1)", "https://user:secret@example.test", "http://example.test"]) assert.throws(() => trackingInput({ carrier: "Test", awb: "123456", url }));
  const old = process.env.SHIPROCKET_TOKEN; delete process.env.SHIPROCKET_TOKEN;
  try { await assert.rejects(syncTracking({ tracking: { carrier: "Shiprocket", awb: "123456" } }), /not configured/); } finally { if (old) process.env.SHIPROCKET_TOKEN = old; }
});
test("courier sync imports actual scans without changing payment or fulfillment state", async (context) => {
  const old = process.env.SHIPROCKET_TOKEN; process.env.SHIPROCKET_TOKEN = "test-token";
  let calls = 0; const order = sampleOrder(); order.tracking = { carrier: "Shiprocket", awb: "123456" };
  context.mock.method(globalThis, "fetch", async (url, options) => { calls++; assert.match(url, /^https:\/\/apiv2.shiprocket.in/); assert.equal(options.headers.Authorization, "Bearer test-token"); return new Response(JSON.stringify({ tracking_data: { shipment_track: [{ current_status: "In transit" }], shipment_track_activities: [{ activity: "Shipment picked up", date: "2026-10-01T10:00:00Z", location: "Delhi" }] } })); });
  try { await syncTracking(order); await syncTracking(order); assert.equal(calls, 1); assert.equal(order.tracking.providerStatus, "In transit"); assert.equal(order.timeline[0].message, "Shipment picked up"); assert.equal(order.paymentStatus, "pending"); assert.equal(order.status, "delivered"); } finally { if (old) process.env.SHIPROCKET_TOKEN = old; else delete process.env.SHIPROCKET_TOKEN; }
});
test("AI stays unavailable without configuration and proxies only public catalog context when enabled", async (context) => {
  assert.equal((await request("/assistant", { anonymous: true, method: "POST", body: { question: "Find a cotton tee" } })).status, 503);
  const oldKey = process.env.OPENAI_API_KEY, oldModel = process.env.OPENAI_MODEL; settings.aiAssistantEnabled = true; process.env.OPENAI_API_KEY = "test-ai-key"; process.env.OPENAI_MODEL = "configured-test-model";
  const originalFetch = globalThis.fetch;
  context.mock.method(globalThis, "fetch", async (url, options) => {
    if (!String(url).startsWith("https://api.openai.com/")) return originalFetch(url, options);
    const payload = JSON.parse(options.body); assert.equal(payload.store, false); assert.equal(payload.model, "configured-test-model"); assert.doesNotMatch(payload.input, /test@example.test|shippingAddress|password|test-ai-key/); return new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: "The cotton tee is available in two sizes." }] }] }));
  });
  try { const result = await request("/assistant", { anonymous: true, method: "POST", body: { question: "Find a cotton tee" } }); assert.equal(result.status, 200); assert.match(result.body.answer, /two sizes/); assert.equal(result.body.products[0].id, ids.product); }
  finally { if (oldKey) process.env.OPENAI_API_KEY = oldKey; else delete process.env.OPENAI_API_KEY; if (oldModel) process.env.OPENAI_MODEL = oldModel; else delete process.env.OPENAI_MODEL; }
});
test("SEO metadata escapes product content and never advertises illustrative review ratings", () => {
  const product = { ...products[0], name: '</title><script>alert("x")</script>', description: '<script>alert("x")</script>', rating: 5, reviewCount: 100 };
  const html = productMetadata(product, settings, "https://store.example.test"); assert.doesNotMatch(html, /<script>alert/); assert.match(html, /\\u003cscript/); assert.match(html, /priceCurrency":"INR/); assert.doesNotMatch(html, /aggregateRating/);
  const old = process.env.PUBLIC_SITE_URL; process.env.PUBLIC_SITE_URL = "https://store.example.test/path"; try { assert.equal(siteUrl(), "https://store.example.test"); process.env.PUBLIC_SITE_URL = "https://localhost"; assert.throws(siteUrl); } finally { if (old) process.env.PUBLIC_SITE_URL = old; else delete process.env.PUBLIC_SITE_URL; }
});
