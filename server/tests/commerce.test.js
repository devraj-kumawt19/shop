import { test, before, beforeEach, after, mock } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { Order, Product, User, StoreSettings, Notification, StockMovement, CartState, Inbox } from "../db/models.js";
import { defaultStoreSettings } from "../storeSettings.js";
import { minorUnits, validSignature, matchesCapturedPayment } from "../paymentPolicy.js";
import { buildOrderEmail, dispatchNotifications, enqueueOrderEmails } from "../notifications.js";
import { categories, demoProducts } from "../demoCatalog.js";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "isolated-commerce-tests-secret-at-least-32-characters";
const { app } = await import("../index.js");
const realFetch = globalThis.fetch;
const userId = "aaaaaaaaaaaaaaaaaaaaaaaa", orderId = "bbbbbbbbbbbbbbbbbbbbbbbb", productId = "cccccccccccccccccccccccc";
let server, base, order, stock, settings, jobs, providerPayment, calls, allocationCount, failEmail;
const hmac = (value, secret) => createHmac("sha256", secret).update(value).digest("hex");
const query = (value) => ({ session: async () => value, then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) });
function setPath(target, path, value) { const parts = path.split("."); const last = parts.pop(); let pointer = target; for (const part of parts) pointer = pointer[part] ||= {}; pointer[last] = value; }
async function request(path, body, { anonymous = false, headers = {} } = {}) {
  const response = await realFetch(`${base}/api${path}`, { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json", ...(!anonymous ? { Authorization: `Bearer ${jwt.sign({ sub: userId }, process.env.JWT_SECRET)}` } : {}), ...headers }, ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() };
}
const confirmation = () => ({ razorpay_order_id: order.gatewayOrderId, razorpay_payment_id: providerPayment.id, razorpay_signature: hmac(`${order.gatewayOrderId}|${providerPayment.id}`, process.env.RAZORPAY_KEY_SECRET) });

before(async () => {
  mongoose.connection.readyState = 1;
  mock.method(mongoose, "startSession", async () => ({ withTransaction: async (handler) => handler(), endSession: async () => {} }));
  mock.method(StockMovement, "create", async () => []);
  mock.method(CartState, "updateOne", async () => ({ modifiedCount: 1 }));
  mock.method(Inbox, "updateOne", async () => ({ modifiedCount: 1 }));
  mock.method(User, "findById", async () => ({ id: userId, role: "customer", isActive: true }));
  mock.method(StoreSettings, "findById", () => ({ lean: async () => settings }));
  mock.method(Order, "findOne", (filter) => query((!filter.user || filter.user === order.user) && (!filter.gatewayOrderId || filter.gatewayOrderId === order.gatewayOrderId) && (!filter._id || filter._id === order.id) ? order : null));
  mock.method(Order, "exists", async (filter) => filter.gatewayOrderId === order.gatewayOrderId);
  mock.method(Order, "findOneAndUpdate", async () => { order.paymentCreatingAt = new Date(); return order; });
  mock.method(Order, "updateOne", async (filter, update) => {
    for (const [path, value] of Object.entries(update.$set || {})) setPath(order, path, value);
    for (const key of Object.keys(update.$unset || {})) delete order[key];
    return { modifiedCount: 1 };
  });
  mock.method(Product, "find", () => ({ session: () => ({ lean: async () => [{ _id: productId, stock, name: "Test Product", price: 15, image: "https://example.test/product.jpg", isDemo: false }] }) }));
  mock.method(Order, "create", async ([input]) => { order = { ...input, id: orderId, _id: orderId, emailStatus: {}, save: async () => {} }; return [order]; });
  mock.method(Product, "updateOne", async (filter, update) => { if (stock < filter.stock.$gte) return { modifiedCount: 0 }; stock += update.$inc.stock; allocationCount++; return { modifiedCount: 1 }; });
  mock.method(Notification, "updateOne", async (filter, update) => {
    if (update.$setOnInsert && !jobs.some((job) => job.key === filter.key)) jobs.push({ _id: String(jobs.length), status: "pending", attempts: 0, nextAttempt: new Date(0), lockedUntil: new Date(0), ...structuredClone(update.$setOnInsert) });
    const job = jobs.find((item) => filter._id ? item._id === filter._id : item.key === filter.key);
    if (job) Object.assign(job, update.$set || {});
    return { modifiedCount: 1 };
  });
  mock.method(Notification, "findOneAndUpdate", () => ({ lean: async () => {
    const job = jobs.find((item) => item.status === "pending" && item.attempts < 8 && item.nextAttempt <= new Date() && item.lockedUntil <= new Date());
    if (!job) return null;
    job.attempts++; job.lockedUntil = new Date(Date.now() + 60000);
    return structuredClone(job);
  } }));
  mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, options });
    if (url === "https://api.razorpay.com/v1/orders") { const payload = JSON.parse(options.body); return new Response(JSON.stringify({ id: "order_new123", amount: payload.amount, currency: payload.currency }), { status: 200 }); }
    if (url.startsWith("https://api.razorpay.com/v1/payments/")) return new Response(JSON.stringify(providerPayment), { status: 200 });
    if (url === "https://api.resend.com/emails") return new Response(JSON.stringify({ id: "email_test" }), { status: failEmail ? 503 : 200 });
    throw new Error("Unexpected external request in test");
  });
  await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(() => {
  process.env.RAZORPAY_KEY_ID = "rzp_test_example";
  process.env.RAZORPAY_KEY_SECRET = "test-gateway-secret";
  process.env.RAZORPAY_WEBHOOK_SECRET = "test-webhook-secret";
  process.env.ORDER_NOTIFICATION_EMAIL = "owner@example.test";
  process.env.RESEND_API_KEY = "test-only-email-key";
  process.env.RESEND_FROM = "Store <store@example.test>";
  stock = 10; jobs = []; calls = []; allocationCount = 0; failEmail = false;
  settings = { ...defaultStoreSettings, currency: "USD", shippingFee: 6.95, freeShippingThreshold: 75, onlinePaymentsEnabled: true };
  order = { id: orderId, _id: orderId, user: userId, orderNumber: "SS-TEST", total: 51.95, subtotal: 45, shipping: 6.95, currency: "USD", gatewayOrderId: "order_test123", paymentMethod: "razorpay", paymentStatus: "pending", status: "awaiting_payment", inventoryCommitted: false, emailStatus: {}, items: [{ product: productId, name: "Test & <find>", price: 15, quantity: 3 }], shippingAddress: { firstName: "Test", lastName: "Customer", email: "customer@example.test", street: "Sample Street", city: "Test City", state: "Test State", postalCode: "12345" }, save: async () => {} };
  providerPayment = { id: "pay_test123", order_id: order.gatewayOrderId, status: "captured", currency: "USD", amount: 5195 };
});
after(async () => { await new Promise((resolve) => server.close(resolve)); mock.restoreAll(); mongoose.connection.readyState = 0; });

test("catalog has 48 unique products, four populated categories and real computed discounts", () => {
  assert.equal(demoProducts.length, 48);
  assert.equal(new Set(demoProducts.map((item) => item._id)).size, 48);
  assert.equal(new Set(demoProducts.map((item) => item.name)).size, 48);
  for (const category of categories) assert.equal(demoProducts.filter((item) => item.categorySlug === category.slug).length, 12);
  assert.ok(demoProducts.filter((item) => item.compareAtPrice > item.price).length >= 30);
});
test("signature validation rejects tampering, malformed input and a missing secret", () => {
  const signed = hmac("order|payment", "secret");
  assert.equal(validSignature("order|payment", signed, "secret"), true);
  assert.equal(validSignature("other|payment", signed, "secret"), false);
  assert.equal(validSignature("order|payment", "short", "secret"), false);
  assert.equal(validSignature("order|payment", signed, ""), false);
  assert.equal(minorUnits(51.95), 5195);
});
test("captured payment must match stored order, amount and currency", () => {
  assert.equal(matchesCapturedPayment(order, providerPayment), true);
  for (const changes of [{ amount: 1 }, { currency: "INR" }, { order_id: "order_other" }, { status: "authorized" }]) assert.equal(matchesCapturedPayment(order, { ...providerPayment, ...changes }), false);
});
test("a captured checkout confirms once, deducts stock once and queues two emails", async () => {
  assert.equal((await request(`/payments/orders/${orderId}/verify`, confirmation())).status, 200);
  assert.equal(order.paymentStatus, "paid"); assert.equal(order.status, "placed"); assert.equal(stock, 7); assert.equal(jobs.length, 2);
  assert.equal((await request(`/payments/orders/${orderId}/verify`, confirmation())).status, 200);
  assert.equal(stock, 7); assert.equal(allocationCount, 1); assert.equal(jobs.length, 2);
});
test("cash on delivery uses server prices, commits inventory and queues both confirmations", async () => {
  const result = await request("/orders", { items: [{ product: productId, quantity: 3 }], shippingAddress: { ...order.shippingAddress, phone: "1234567890" }, paymentMethod: "cash_on_delivery", total: 1 });
  assert.equal(result.status, 201); assert.equal(result.body.order.total, 51.95); assert.equal(result.body.order.currency, "USD");
  assert.equal(order.status, "placed"); assert.equal(order.inventoryCommitted, true); assert.equal(stock, 7); assert.equal(jobs.length, 2);
});
test("invalid signature, wrong amount and authorization-only payments never fulfill", async () => {
  assert.equal((await request(`/payments/orders/${orderId}/verify`, { ...confirmation(), razorpay_signature: "0".repeat(64) })).status, 400);
  assert.equal(calls.length, 0);
  providerPayment.amount = 1;
  assert.equal((await request(`/payments/orders/${orderId}/verify`, confirmation())).status, 400);
  providerPayment.amount = 5195; providerPayment.status = "authorized";
  assert.equal((await request(`/payments/orders/${orderId}/verify`, confirmation())).status, 409);
  assert.equal(stock, 10); assert.equal(jobs.length, 0); assert.equal(order.status, "awaiting_payment");
});
test("customers cannot pay another account's order", async () => {
  order.user = "dddddddddddddddddddddddd";
  assert.equal((await request(`/payments/orders/${orderId}` , {})).status, 404);
  assert.equal((await request(`/payments/orders/${orderId}/verify`, confirmation())).status, 404);
  assert.equal(calls.length, 0);
});
test("captured payment with unavailable stock requires refund review without fulfillment", async () => {
  stock = 1;
  const result = await request(`/payments/orders/${orderId}/verify`, confirmation());
  assert.equal(result.status, 200); assert.equal(result.body.order.paymentStatus, "refund_required");
  assert.equal(order.status, "cancelled"); assert.equal(order.inventoryCommitted, false); assert.equal(stock, 1);
  assert.match(jobs[0].payload.text, /refund/);
});
test("webhooks require the raw-body signature and tolerate duplicate capture events", async () => {
  const body = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: providerPayment } } });
  assert.equal((await request("/payments/webhook", body, { anonymous: true })).status, 400);
  const options = { anonymous: true, headers: { "x-razorpay-signature": hmac(body, process.env.RAZORPAY_WEBHOOK_SECRET) } };
  assert.equal((await request("/payments/webhook", body, options)).status, 200);
  assert.equal((await request("/payments/webhook", body, options)).status, 200);
  assert.equal(stock, 7); assert.equal(allocationCount, 1); assert.equal(jobs.length, 2);
});
test("payment creation uses server amounts, stores the gateway order and exposes no secret", async () => {
  delete order.gatewayOrderId;
  const result = await request(`/payments/orders/${orderId}`, { amount: 1 });
  assert.equal(result.status, 200); assert.equal(result.body.amount, 5195); assert.equal(order.gatewayOrderId, "order_new123");
  assert.equal(result.body.key, "rzp_test_example"); assert.ok(!JSON.stringify(result.body).includes(process.env.RAZORPAY_KEY_SECRET));
  assert.equal(stock, 10);
});
test("online payments stay unavailable without complete configuration", async () => {
  delete process.env.RAZORPAY_KEY_SECRET;
  assert.equal((await request("/payments/config", undefined, { anonymous: true })).body.enabled, false);
  assert.equal((await request(`/payments/orders/${orderId}`, {})).status, 503);
  assert.equal(calls.length, 0);
});
test("email payload escapes user content, targets customer and owner separately and snapshots order prices", async () => {
  const payload = buildOrderEmail(order, settings, "customer");
  assert.match(payload.html, /&amp; &lt;find&gt;/); assert.doesNotMatch(payload.html, /<find>/); assert.match(payload.text, /51.95/);
  await enqueueOrderEmails(order, settings); await enqueueOrderEmails(order, settings);
  assert.equal(jobs.length, 2); assert.deepEqual(jobs[0].payload.to, ["customer@example.test"]); assert.deepEqual(jobs[1].payload.to, ["owner@example.test"]);
});
test("email dispatch uses idempotency keys and does not resend sent notifications", async () => {
  await enqueueOrderEmails(order, settings); await dispatchNotifications();
  assert.equal(jobs.filter((job) => job.status === "sent").length, 2); assert.equal(order.emailStatus.customer, "sent");
  assert.equal(calls[0].options.headers["Idempotency-Key"], jobs[0].key);
  await dispatchNotifications(); assert.equal(calls.length, 2);
});
test("email failures stay queued for retry without changing the confirmed order", async () => {
  order.status = "placed"; order.paymentStatus = "paid"; failEmail = true;
  await enqueueOrderEmails(order, settings); await dispatchNotifications();
  assert.equal(jobs[0].status, "pending"); assert.equal(jobs[0].attempts, 1); assert.ok(jobs[0].nextAttempt > new Date());
  assert.equal(order.status, "placed"); assert.equal(order.paymentStatus, "paid");
});

test("order-update delivery cannot overwrite the confirmation email status", async () => {
  order.emailStatus.customer = "failed";
  jobs.push({ _id: "status-update", key: `order-update/${orderId}/revision`, order: orderId, kind: "customer", payload: { to: ["customer@example.test"], subject: "Order shipped", text: "Your order shipped." }, status: "pending", attempts: 0, nextAttempt: new Date(0), lockedUntil: new Date(0) });
  await dispatchNotifications();
  assert.equal(jobs[0].status, "sent");
  assert.equal(order.emailStatus.customer, "failed");
});
