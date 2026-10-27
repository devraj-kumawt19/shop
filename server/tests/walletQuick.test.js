import { test, before, beforeEach, after, mock } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { createHmac } from "node:crypto";
import { Wallet, WalletEntry, WalletTopup, StoreSettings, User, Order } from "../models.js";
import { changeWallet, finalizeTopup, refundWalletOrder, topupMinor } from "../wallet.js";
import { quickService, deliveryQuote } from "../quickPolicy.js";
import { defaultStoreSettings } from "../storeSettings.js";
import { toRupees, INR_RATE } from "../currency.js";
import { validateSettings } from "../adminPolicy.js";

process.env.NODE_ENV = "test"; process.env.JWT_SECRET = "isolated-wallet-quick-tests-only-secret-32-chars";
const { app } = await import("../app.js");
const ids = { user: "aaaaaaaaaaaaaaaaaaaaaaaa", other: "bbbbbbbbbbbbbbbbbbbbbbbb", topup: "cccccccccccccccccccccccc", order: "dddddddddddddddddddddddd" };
const query = (value) => ({ session() { return this; }, sort() { return this; }, limit() { return this; }, select() { return this; }, populate() { return this; }, lean: async () => value, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } });
let server, base, user, settings, balance, entries, topup, calls, providerPayment, ledgerFilter, topupFilter;
const nativeFetch = globalThis.fetch;
async function request(path, { method = "GET", body, anonymous = false } = {}) {
  const response = await nativeFetch(base + "/api" + path, { method, headers: { "Content-Type": "application/json", ...(!anonymous ? { Authorization: `Bearer ${jwt.sign({ sub: ids.user }, process.env.JWT_SECRET)}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() };
}
before(async () => {
  mongoose.connection.readyState = 1;
  for (const model of [Wallet, WalletEntry, WalletTopup]) mock.method(model, "init", async () => model);
  mock.method(mongoose, "startSession", async () => ({ withTransaction: async (handler) => handler(), endSession: async () => {} }));
  mock.method(User, "findById", async () => user);
  mock.method(StoreSettings, "findById", () => query(settings));
  mock.method(Wallet, "updateOne", async () => ({ modifiedCount: 1 }));
  mock.method(Wallet, "findOne", () => query({ user: ids.user, balanceMinor: balance, currency: "INR" }));
  mock.method(Wallet, "findOneAndUpdate", async (filter, update) => { if (filter.balanceMinor.$gte && balance < filter.balanceMinor.$gte) return null; balance += update.$inc.balanceMinor; return { balanceMinor: balance }; });
  mock.method(WalletEntry, "findOne", ({ key }) => query(entries.find((e) => e.key === key)));
  mock.method(WalletEntry, "create", async ([entry]) => { entries.push(entry); return [entry]; });
  mock.method(WalletEntry, "find", (filter) => { ledgerFilter = filter; return query(entries.filter((e) => e.user === filter.user)); });
  mock.method(WalletTopup, "find", () => query([]));
  mock.method(WalletTopup, "findOne", (filter) => { topupFilter = filter; return query(topup && (!filter.user || String(filter.user) === String(topup.user)) ? topup : null); });
  mock.method(WalletTopup, "exists", async ({ gatewayOrderId }) => gatewayOrderId === topup.gatewayOrderId);
  mock.method(Order, "exists", async () => false);
  mock.method(globalThis, "fetch", async (url, options) => { calls.push({ url, options }); if (String(url).startsWith("https://api.razorpay.com/v1/payments/")) return new Response(JSON.stringify(providerPayment), { status: 200 }); throw new Error("Unexpected provider call in test"); });
  await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); }); base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(() => {
  user = { id: ids.user, name: "Test Buyer", email: "buyer@example.test", role: "customer", isActive: true };
  settings = { ...defaultStoreSettings, onlinePaymentsEnabled: true, quickDeliveryEnabled: true, quickPincodes: "110001, 110002", quickOpenHour: 0, quickCloseHour: 24 };
  balance = 50000; entries = []; calls = [];
  topup = { id: ids.topup, user: ids.user, amountMinor: 10000, currency: "INR", status: "pending", gatewayOrderId: "order_wallet123", save: async () => {} };
  providerPayment = { id: "pay_wallet123", order_id: topup.gatewayOrderId, amount: 10000, currency: "INR", status: "captured" };
  process.env.RAZORPAY_KEY_ID = "rzp_test_wallet"; process.env.RAZORPAY_KEY_SECRET = "test-wallet-signature-key"; process.env.RAZORPAY_WEBHOOK_SECRET = "test-wallet-webhook-key";
});
after(async () => { await new Promise((resolve) => server.close(resolve)); mock.restoreAll(); mongoose.connection.readyState = 0; });

test("wallet amounts use integer paise and reject invalid or out-of-range top-ups", () => {
  assert.equal(topupMinor(100.01), 10001);
  for (const amount of [99, 10000.01, 100.001, "500", NaN, Infinity, -500]) assert.throws(() => topupMinor(amount));
});
test("wallet debits are bounded by available balance and use idempotent ledger keys", async () => {
  const session = {}; const input = { user: ids.user, amountMinor: -15000, kind: "purchase", key: "purchase/order" };
  await changeWallet(input, session); assert.equal(balance, 35000); assert.equal(entries[0].balanceAfterMinor, 35000);
  await changeWallet(input, session); assert.equal(balance, 35000); assert.equal(entries.length, 1);
  await assert.rejects(changeWallet({ ...input, key: "purchase/too-much", amountMinor: -40000 }, session), /too low/);
  await assert.rejects(changeWallet({ ...input, amountMinor: -14000 }, session), /does not match/);
  await assert.rejects(changeWallet(input), /valid wallet transaction/);
});
test("captured top-ups credit once and require the exact gateway order, amount and currency", async () => {
  for (const overrides of [{ amount: 1 }, { currency: "USD" }, { status: "authorized" }]) await assert.rejects(finalizeTopup({ ...providerPayment, ...overrides }), /does not match/);
  assert.equal(balance, 50000);
  await finalizeTopup(providerPayment); await finalizeTopup(providerPayment); assert.equal(balance, 60000); assert.equal(entries.length, 1); assert.equal(topup.status, "paid");
  await assert.rejects(finalizeTopup({ ...providerPayment, id: "pay_other" }), /different payment/);
});
test("wallet cancellation refunds the original snapshot exactly once", async () => {
  const order = { id: ids.order, user: ids.user, orderNumber: "SS-WALLET", total: 125.5, paymentMethod: "wallet", paymentStatus: "paid" };
  await refundWalletOrder(order, {}); await refundWalletOrder(order, {}); assert.equal(balance, 62550); assert.equal(order.paymentStatus, "refunded"); assert.equal(entries.length, 1);
});
test("wallet endpoints require a session and scope account history to its owner", async () => {
  assert.equal((await request("/wallet", { anonymous: true })).status, 401);
  const result = await request("/wallet"); assert.equal(result.status, 200); assert.equal(result.body.wallet.balanceMinor, 50000); assert.deepEqual(ledgerFilter, { user: ids.user });
  assert.equal((await request("/super-admin/wallet")).status, 403);
  delete process.env.RAZORPAY_KEY_SECRET; assert.equal((await request("/wallet")).body.topupsEnabled, false);
  assert.equal((await request("/wallet/topups", { method: "POST", body: { amount: 500, requestKey: "valid-request-key-123" } })).status, 503);
});
test("top-up verification rejects foreign ownership and forged signatures before contacting the provider", async () => {
  const path = `/wallet/topups/${ids.topup}/verify`, body = { razorpay_order_id: topup.gatewayOrderId, razorpay_payment_id: providerPayment.id, razorpay_signature: "0".repeat(64) };
  assert.equal((await request(path, { method: "POST", body })).status, 400); assert.equal(calls.length, 0);
  topup.user = ids.other; assert.equal((await request(path, { method: "POST", body })).status, 404); assert.equal(topupFilter.user, ids.user); assert.equal(balance, 50000);
});
test("valid callback and signed webhook reconcile the same top-up without duplicate credit", async () => {
  const signature = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(`${topup.gatewayOrderId}|${providerPayment.id}`).digest("hex");
  assert.equal((await request(`/wallet/topups/${ids.topup}/verify`, { method: "POST", body: { razorpay_order_id: topup.gatewayOrderId, razorpay_payment_id: providerPayment.id, razorpay_signature: signature } })).status, 200);
  const body = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: providerPayment } } });
  const webhookSignature = createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET).update(body).digest("hex");
  const response = await nativeFetch(base + "/api/payments/webhook", { method: "POST", headers: { "Content-Type": "application/json", "x-razorpay-signature": webhookSignature }, body });
  assert.equal(response.status, 200); assert.equal(balance, 60000); assert.equal(entries.length, 1);
});
test("15-minute service checks PIN, opt-in, INR currency and IST operating hours", () => {
  const morning = new Date("2026-10-27T06:00:00Z");
  assert.equal(quickService(settings, "110001", morning).available, true);
  for (const overrides of [{ quickDeliveryEnabled: false }, { quickPincodes: "" }, { currency: "USD" }, { quickOpenHour: 12 }]) assert.equal(quickService({ ...settings, ...overrides }, "110001", morning).available, false);
  assert.equal(quickService(settings, "123", morning).available, false); assert.equal(quickService(settings, "400001", morning).available, false);
  assert.equal(deliveryQuote("express15", "110001", [{ quickEligible: true }], settings, morning).fee, 29);
  assert.throws(() => deliveryQuote("express15", "110001", [{ quickEligible: false }], settings, morning), /Every product/);
  assert.throws(() => deliveryQuote("express15", "110001", [], settings, morning)); assert.deepEqual(deliveryQuote("standard", "", [], settings), { method: "standard", fee: null });
});
test("delivery settings reject invalid PIN codes, fake dates and backwards operating windows", () => {
  assert.equal(validateSettings(defaultStoreSettings), "");
  for (const input of [{ quickPincodes: "123" }, { quickDeliveryEnabled: "yes" }, { quickDeliveryFee: -1 }, { quickOpenHour: 22, quickCloseHour: 8 }, { saleEndsAt: "tomorrowish" }]) assert.notEqual(validateSettings(input), "");
});
test("rupee defaults and conversion preserve two-decimal prices without converting order history", () => {
  assert.equal(defaultStoreSettings.currency, "INR"); assert.equal(toRupees(129), 12278.22); assert.equal(toRupees(6.95), 661.5); assert.equal(INR_RATE, 95.18);
  assert.equal(Order.schema.path("currency").defaultValue, "USD", "Missing historical order currencies retain their old USD interpretation");
});
