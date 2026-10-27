import { test, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { User, StoreSettings, AuditLog } from "../models.js";
import { validateSettings, validateUserUpdate } from "../adminPolicy.js";
import { defaultStoreSettings, shippingFor } from "../storeSettings.js";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-only-secret-for-super-admin-tests-at-least-32-characters";
const { app } = await import("../index.js");
const ids = { owner: "aaaaaaaaaaaaaaaaaaaaaaaa", admin: "bbbbbbbbbbbbbbbbbbbbbbbb", customer: "cccccccccccccccccccccccc", blocked: "dddddddddddddddddddddddd" };
let server, base, users, stored, activity;
const account = (key, role, isActive = true) => ({ id: ids[key], _id: ids[key], name: key, email: `${key}@example.test`, role, isActive, createdAt: new Date().toISOString(), save: async function () { users[this.id] = this; } });
const token = (key, role) => jwt.sign({ sub: ids[key], role }, process.env.JWT_SECRET);
async function request(path, { key, role, method = "GET", body } = {}) {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${token(key, role)}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() };
}

before(async () => {
  // Exercise real Express authentication, JWT verification, routing and validation with isolated model stubs.
  mongoose.connection.readyState = 1;
  mock.method(User, "findById", async (id) => users[id] || null);
  mock.method(User, "findOne", ({ email }) => ({ select: async () => Object.values(users).find((user) => user.email === email) || null }));
  mock.method(User, "findOneAndUpdate", (filter, update) => ({ select: async () => {
    const user = users[filter._id];
    if (!user || user.role === "superadmin") return null;
    Object.assign(user, update.$set);
    return user;
  } }));
  mock.method(User, "exists", async () => false);
  mock.method(User, "create", async (input) => { const user = { ...input, id: "eeeeeeeeeeeeeeeeeeeeeeee", role: input.role || "customer" }; users[user.id] = user; return user; });
  mock.method(StoreSettings, "findById", () => ({ lean: async () => stored }));
  mock.method(StoreSettings, "findByIdAndUpdate", async (id, update) => { stored = { ...stored, ...update.$set }; return stored; });
  mock.method(AuditLog, "create", async (entry) => { activity.push(entry); return entry; });
  await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(() => {
  users = { [ids.owner]: account("owner", "superadmin"), [ids.admin]: account("admin", "admin"), [ids.customer]: account("customer", "customer"), [ids.blocked]: account("blocked", "admin", false) };
  stored = { ...defaultStoreSettings };
  activity = [];
});
after(async () => { await new Promise((resolve) => server.close(resolve)); mock.restoreAll(); mongoose.connection.readyState = 0; });

test("super admin APIs reject anonymous, customer and regular-admin access", async () => {
  assert.equal((await request("/super-admin/settings")).status, 401);
  assert.equal((await request("/super-admin/settings", { key: "customer" })).status, 403);
  assert.equal((await request("/super-admin/settings", { key: "admin" })).status, 403);
  assert.equal((await request("/super-admin/settings", { key: "owner" })).status, 200);
});
test("authorization uses the database role even when a signed token claims superadmin", async () => {
  assert.equal((await request("/super-admin/settings", { key: "customer", role: "superadmin" })).status, 403);
});
test("blocked sessions cannot access profile, admin or super admin APIs", async () => {
  for (const path of ["/auth/me", "/admin/products", "/super-admin/settings"]) assert.equal((await request(path, { key: "blocked" })).status, 401);
  assert.equal((await request("/auth/login", { method: "POST", body: { email: "blocked@example.test", password: "irrelevant-password" } })).status, 401);
});
test("login verifies the password and returns a signed bearer token", async () => {
  users[ids.customer].checkPassword = async (password) => password === "correct-password";
  const result = await request("/auth/login", { method: "POST", body: { email: "CUSTOMER@example.test", password: "correct-password" } });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.user, { id: ids.customer, name: "customer", email: "customer@example.test", role: "customer", profileImage: "" });
  assert.equal(result.body.user.password, undefined);
  const payload = jwt.verify(result.body.token, process.env.JWT_SECRET);
  assert.equal(payload.sub, ids.customer);
  assert.equal(payload.role, "customer");
  assert.ok(Number.isInteger(payload.iat));
  assert.ok(Number.isInteger(payload.exp));
  assert.equal((await request("/auth/login", { method: "POST", body: { email: "customer@example.test", password: "wrong-password" } })).status, 401);
});
test("public registration cannot inject super admin role or blocked status", async () => {
  const result = await request("/auth/register", { method: "POST", body: { name: "Test User", email: "new@example.test", password: "example-password-123", role: "superadmin", isActive: false } });
  assert.equal(result.status, 201);
  assert.equal(result.body.user.role, "customer");
  assert.equal(users[result.body.user.id].isActive, undefined);
});
test("customers can save and retrieve a validated profile photo", async () => {
  const imageBytes = Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3, 0xff, 0xd9]);
  const profileImage = `data:image/jpeg;base64,${imageBytes.toString("base64")}`;
  const result = await request("/auth/profile", { key: "customer", method: "PATCH", body: { name: "Customer Name", email: "CUSTOMER@example.test", profileImage } });
  assert.equal(result.status, 200);
  assert.equal(result.body.user.profileImage, profileImage);
  assert.equal(result.body.user.email, "customer@example.test");
  assert.equal(users[ids.customer].profileImage, profileImage);
  assert.equal(result.body.user.password, undefined);
});
test("customers can remove their profile photo", async () => {
  users[ids.customer].profileImage = "data:image/jpeg;base64,old-photo";
  const result = await request("/auth/profile", { key: "customer", method: "PATCH", body: { name: "customer", email: "customer@example.test", profileImage: null } });
  assert.equal(result.status, 200);
  assert.equal(result.body.user.profileImage, "");
  assert.equal(users[ids.customer].profileImage, "");
});
test("profile photo updates reject malformed and oversized image data", async () => {
  const prefix = "data:image/jpeg;base64,";
  const oversizedBytes = Buffer.alloc(180 * 1024 + 1);
  oversizedBytes.set([0xff, 0xd8, 0xff]);
  oversizedBytes.set([0xff, 0xd9], oversizedBytes.length - 2);
  const invalidImages = [
    "data:image/png;base64,iVBORw0KGgo=",
    `${prefix}not-base64`,
    `${prefix}${oversizedBytes.toString("base64")}`,
  ];
  for (const profileImage of invalidImages) {
    const result = await request("/auth/profile", { key: "customer", method: "PATCH", body: { name: "customer", email: "customer@example.test", profileImage } });
    assert.equal(result.status, 400);
  }
  assert.equal(users[ids.customer].profileImage, undefined);
});
test("super admin can update customer access; blocking takes effect on existing tokens", async () => {
  assert.equal((await request(`/super-admin/users/${ids.customer}`, { key: "owner", method: "PATCH", body: { role: "admin" } })).status, 200);
  assert.equal((await request(`/super-admin/users/${ids.customer}`, { key: "owner", method: "PATCH", body: { isActive: false } })).status, 200);
  assert.equal((await request("/auth/me", { key: "customer" })).status, 401);
  assert.equal(activity.length, 2);
  assert.equal(activity[0].actor, ids.owner);
});
test("self-lockout, owner modification, privilege escalation and password injection are rejected", async () => {
  for (const body of [{ role: "customer" }, { isActive: false }]) assert.equal((await request(`/super-admin/users/${ids.owner}`, { key: "owner", method: "PATCH", body })).status, 400);
  for (const body of [{ role: "superadmin" }, { password: "injected-password" }, { isActive: "false" }, []]) assert.equal((await request(`/super-admin/users/${ids.customer}`, { key: "owner", method: "PATCH", body })).status, 400);
  assert.equal(activity.length, 0);
});
test("settings persist through the public endpoint and record an activity entry", async () => {
  const result = await request("/super-admin/settings", { key: "owner", method: "PATCH", body: { siteName: "My Store", shippingFee: 9.5, freeShippingThreshold: 100, checkoutEnabled: false } });
  assert.equal(result.status, 200);
  const publicSettings = await request("/settings");
  assert.equal(publicSettings.body.settings.siteName, "My Store");
  assert.equal(publicSettings.body.settings.shippingFee, 9.5);
  assert.equal(publicSettings.body.settings.checkoutEnabled, false);
  assert.equal(activity.length, 1);
  assert.equal((await request("/orders", { key: "customer", method: "POST", body: {} })).status, 503);
});
test("malformed and unsafe website settings are rejected", async () => {
  for (const body of [{ shippingFee: -1 }, { shippingFee: "0" }, { shippingFee: .001 }, { heroImage: "javascript:alert(1)" }, { primaryColor: "red" }, { supportEmail: "invalid" }, { siteName: "" }, { checkoutEnabled: "false" }, { toString: "bad" }, { password: "bad" }]) {
    assert.equal((await request("/super-admin/settings", { key: "owner", method: "PATCH", body })).status, 400, JSON.stringify(body));
  }
  assert.equal(activity.length, 0);
});
test("settings and role policies protect sensitive fields and shipping boundaries", () => {
  assert.equal(validateSettings(defaultStoreSettings), "");
  assert.notEqual(validateSettings(JSON.parse('{"__proto__":{"polluted":true}}')), "");
  assert.notEqual(validateUserUpdate(users[ids.owner], users[ids.owner], { role: "admin" }), "");
  assert.equal(shippingFor(7138.49), 661.50);
  assert.equal(shippingFor(7138.50), 0);
  assert.equal(shippingFor(95, { freeShippingThreshold: 100, shippingFee: 9.5 }), 9.5);
  assert.equal(User.schema.path("password").options.select, false);
  assert.equal(User.schema.path("isActive").defaultValue, true);
});
