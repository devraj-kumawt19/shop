import { test, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createHmac } from "node:crypto";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { User, Product, Order } from "../models.js";
import { connectDatabase } from "../database.js";
import { resolveApiBase } from "../apiBase.js";
import { readFile } from "node:fs/promises";

process.env.NODE_ENV = "test";
process.env.VERCEL = "1";
process.env.JWT_SECRET = "isolated-deployment-test-secret-at-least-32-characters";
process.env.CRON_SECRET = "isolated-cron-test-secret-at-least-32-characters";
const { createHandler } = await import("../../api/index.js");
let server, base, pending, dispatches;
const userId = "aaaaaaaaaaaaaaaaaaaaaaaa";

async function request(path, { body, method = "GET", headers = {} } = {}) {
  const response = await fetch(base + path, { method, headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers }, ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }) });
  assert.match(response.headers.get("content-type"), /application\/json/);
  return { response, data: await response.json() };
}

before(async () => {
  const handler = createHandler({ schedule: (promise) => pending.push(promise), dispatch: async () => { dispatches++; } });
  server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(() => { mock.method(Order, "find", () => ({ limit() { return this; }, select() { return this; }, lean: async () => [] })); mongoose.connection.readyState = 1; pending = []; dispatches = 0; });
after(async () => { await Promise.allSettled(pending); await new Promise((resolve) => server.close(resolve)); mock.restoreAll(); mongoose.connection.readyState = 0; });

test("production API base defaults to same-origin /api and validates overrides", () => {
  for (const configured of ["", "  ", "/api", "/api/"]) assert.equal(resolveApiBase(configured), "/api");
  assert.equal(resolveApiBase("https://actual-api.example/api/"), "https://actual-api.example/api");
  for (const configured of ["http://localhost:5000/api", "https://localhost/api", "https://127.0.0.2/api", "https://api.example", "https://secret:password@api.example/api", "//api.example/api", "https://api.example/api?secret=x"]) assert.throws(() => resolveApiBase(configured));
  assert.equal(resolveApiBase("http://localhost:5000/api", true), "http://localhost:5000/api");
});

test("Vercel handler returns JSON health and retains bounded background tasks", async () => {
  const { response, data } = await request("/api/health");
  assert.equal(response.status, 200); assert.deepEqual(data, { status: "ok", database: "connected" });
  assert.equal(response.headers.get("cache-control"), "no-store");
  await Promise.all(pending); assert.equal(dispatches, 1);
});

test("deep API paths, query strings and JSON request bodies reach the original routes", async (context) => {
  let filter;
  context.mock.method(Product, "find", (value) => { filter = value; return { sort() { return this; }, skip() { return this; }, limit() { return this; }, lean: async () => [] }; });
  context.mock.method(Product, "countDocuments", async () => 0);
  assert.equal((await request("/api/products?category=home&sale=true&limit=1")).response.status, 200);
  assert.equal(filter.categorySlug, "home"); assert.deepEqual(filter.$expr, { $gt: ["$compareAtPrice", "$price"] });
  context.mock.method(User, "findOne", ({ email }) => ({ select: async () => email === "user@example.test" ? { id: userId, name: "User", email, role: "customer", checkPassword: async (password) => password === "test-password" } : null }));
  const login = await request("/api/auth/login", { method: "POST", body: { email: "USER@example.test", password: "test-password" } });
  assert.equal(login.response.status, 200);
  assert.equal(jwt.verify(login.data.token, process.env.JWT_SECRET).sub, userId);
  assert.equal(login.data.user.password, undefined);
  assert.equal((await request("/api/auth/login", { method: "POST", body: { email: "user@example.test", password: "wrong" } })).response.status, 401);
});

test("protected and unknown API endpoints remain JSON responses", async () => {
  for (const path of ["/api/admin/products", "/api/super-admin/settings", "/api/auth/me"]) assert.equal((await request(path)).response.status, 401);
  for (const path of ["/api", "/api/not-existing", "/api/auth/not-existing/deep"]) assert.equal((await request(path)).response.status, 404);
  const malformed = await request("/api/auth/login", { method: "POST", body: "{not-json" });
  assert.equal(malformed.response.status, 400); assert.equal(malformed.data.message, "Request body must be valid JSON.");
});

test("missing JWT and database configuration return JSON 503 without terminating the process", async () => {
  const secret = process.env.JWT_SECRET, uri = process.env.MONGO_URI;
  try {
    delete process.env.JWT_SECRET;
    assert.equal((await request("/api/health")).response.status, 503);
    assert.equal((await request("/api/auth/login", { method: "POST", body: {} })).response.status, 503);
    process.env.JWT_SECRET = secret;
    mongoose.connection.readyState = 0; delete process.env.MONGO_URI;
    const health = await request("/api/health");
    assert.equal(health.response.status, 503); assert.equal(health.data.database, "disconnected");
    assert.equal((await request("/api/products")).response.status, 503);
  } finally { process.env.JWT_SECRET = secret; if (uri) process.env.MONGO_URI = uri; else delete process.env.MONGO_URI; }
});

test("MongoDB connects once for concurrent cold requests, reuses warm pools and retries failure", async (context) => {
  mongoose.connection.readyState = 0;
  const oldUri = process.env.MONGO_URI;
  process.env.MONGO_URI = "mongodb://example.invalid/test";
  let calls = 0, fail = true;
  context.mock.method(mongoose, "connect", async (uri, options) => {
    calls++; assert.equal(options.maxPoolSize, 5); assert.equal(options.bufferCommands, false);
    await new Promise((resolve) => setTimeout(resolve, 5));
    if (fail) throw new Error("Sensitive connection data must not be returned");
    mongoose.connection.readyState = 1; return mongoose;
  });
  context.mock.method(console, "error", () => {});
  try {
    const first = await Promise.allSettled([connectDatabase(), connectDatabase(), connectDatabase()]);
    assert.equal(calls, 1); assert.ok(first.every((result) => result.status === "rejected"));
    assert.doesNotMatch(first[0].reason.message, /Sensitive/);
    fail = false;
    await Promise.all([connectDatabase(), connectDatabase()]); assert.equal(calls, 2);
    await connectDatabase(); assert.equal(calls, 2);
  } finally { if (oldUri) process.env.MONGO_URI = oldUri; else delete process.env.MONGO_URI; }
});

test("same-origin Vercel aliases work and arbitrary cross-origin requests stay blocked", async () => {
  const same = await request("/api/health", { headers: { Origin: base } });
  assert.equal(same.response.status, 200); assert.equal(same.response.headers.get("access-control-allow-origin"), base);
  assert.equal((await request("/api/health", { headers: { Origin: "https://untrusted.example" } })).response.status, 403);
});

test("Razorpay signed raw bodies reach the webhook without JSON reserialization", async () => {
  const old = process.env.RAZORPAY_WEBHOOK_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = "isolated-webhook-secret";
  const body = '{ "event": "not.a.capture", "payload": {} }';
  const signature = createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET).update(body).digest("hex");
  try {
    assert.equal((await request("/api/payments/webhook", { method: "POST", body, headers: { "x-razorpay-signature": signature } })).response.status, 200);
    assert.equal((await request("/api/payments/webhook", { method: "POST", body })).response.status, 400);
  } finally { if (old) process.env.RAZORPAY_WEBHOOK_SECRET = old; else delete process.env.RAZORPAY_WEBHOOK_SECRET; }
});

test("scheduled queue retries require a valid secret and never expose one", async () => {
  assert.equal((await request("/api/internal/notifications")).response.status, 401);
  const result = await request("/api/internal/notifications", { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
  assert.equal(result.response.status, 200); assert.equal(typeof result.data.processed, "number");
  assert.ok(!JSON.stringify(result.data).includes(process.env.CRON_SECRET));
});

test("deployment routing sends /api before the SPA and keeps static assets and deep links separate", async () => {
  const config = JSON.parse(await readFile(new URL("../../vercel.json", import.meta.url), "utf8"));
  assert.equal(config.framework, "vite"); assert.equal(config.outputDirectory, "dist");
  assert.match(config.installCommand, /--prefix server ci/);
  assert.equal(config.functions["api/index.js"].includeFiles, "{dist/index.html,server/assets/fonts/**}");
  assert.equal(config.rewrites[0].destination, "/api/index");
  const fallback = new RegExp(`^${config.rewrites.at(-1).source}$`);
  for (const path of ["/api", "/api/health", "/api/auth/login", "/api/payments/webhook"]) assert.equal(fallback.test(path), false);
  for (const path of ["/", "/login", "/products/id"]) assert.equal(fallback.test(path), true);
});
