import { test, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User, SuperAdminInvitation, Product, Category, Order, AuditLog } from "../db/models.js";
import { hashInvitation } from "../super-admin/services/superAdminAuth.js";
import { authDestination } from "../../src/authValidation.js";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "isolated-super-admin-module-secret-at-least-32-characters";
const { app } = await import("../app.js");
const ownerId = "aaaaaaaaaaaaaaaaaaaaaaaa", adminId = "bbbbbbbbbbbbbbbbbbbbbbbb", customerId = "cccccccccccccccccccccccc";
let server, base, users, invitations, audits, aggregateCalls, userFilters, catalogFilters, orderFilters, passwordHash;
const query = (get) => ({ session() { return this; }, select() { return this; }, sort() { return this; }, skip() { return this; }, limit() { return this; }, populate() { return this; }, lean: async () => get(), then: (resolve, reject) => Promise.resolve(get()).then(resolve, reject) });
const matches = (value, condition) => {
  if (condition?.$in) return condition.$in.includes(value);
  if (condition && typeof condition === "object" && "$ne" in condition) return value !== condition.$ne;
  return value === condition;
};
const makeUser = (id, role, email = `${role}@example.test`) => ({ id, _id: id, name: role, email, role, isActive: true, authVersion: 0, createdAt: new Date(), checkPassword: (password) => bcrypt.compare(password, passwordHash) });
const tokenFor = (id, extra = {}) => jwt.sign({ sub: id, version: users[id]?.authVersion || 0, ...extra }, process.env.JWT_SECRET, { expiresIn: "1h" });
async function request(path, { token, method = "GET", body } = {}) {
  const response = await fetch(base + "/api" + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json(), headers: response.headers };
}
async function invite(email = "new-owner@example.test") {
  const result = await request("/super-admin/invitations", { token: tokenFor(ownerId), method: "POST", body: { email } });
  assert.equal(result.status, 201);
  return result.data.invitation;
}
const registration = (invitation, overrides = {}) => ({ name: "New Owner", email: invitation.email, password: "Owner-password-123!", invitationToken: invitation.token, ...overrides });

before(async () => {
  passwordHash = await bcrypt.hash("Owner-password-123!", 4);
  mongoose.connection.readyState = 1;
  let transactionTail = Promise.resolve();
  mock.method(mongoose, "startSession", async () => ({
    withTransaction(operation) {
      // Model stubs exercise HTTP, JWT, policies and transaction rollback without touching the configured database.
      const result = transactionTail.then(async () => {
        const beforeUsers = { ...users }, beforeInvitations = structuredClone(invitations);
        try { return await operation(); }
        catch (error) { users = beforeUsers; invitations = beforeInvitations; throw error; }
      });
      transactionTail = result.catch(() => {});
      return result;
    }, endSession: async () => {},
  }));
  mock.method(User, "findById", (id) => query(() => users[String(id)] || null));
  mock.method(User, "findOne", ({ email }) => query(() => Object.values(users).find((user) => user.email === email) || null));
  mock.method(User, "exists", async ({ email }) => Object.values(users).some((user) => user.email === email));
  mock.method(User, "create", async (input) => {
    const details = Array.isArray(input) ? input[0] : input;
    if (Object.values(users).some((user) => user.email === details.email)) throw Object.assign(new Error("Duplicate email"), { code: 11000 });
    const user = { ...makeUser(new mongoose.Types.ObjectId().toString(), details.role, details.email), name: details.name };
    users[user.id] = user;
    return Array.isArray(input) ? [user] : user;
  });
  mock.method(User, "updateOne", async ({ _id }, update) => { users[_id].authVersion += update.$inc.authVersion; return { modifiedCount: 1 }; });
  mock.method(User, "find", (filter) => { userFilters.push(filter); return query(() => Object.values(users).filter((user) => Object.entries(filter).every(([key, condition]) => key === "$or" || matches(user[key], condition)))); });
  mock.method(User, "countDocuments", async (filter = {}) => Object.values(users).filter((user) => Object.entries(filter).every(([key, condition]) => matches(user[key], condition))).length);
  mock.method(SuperAdminInvitation, "create", async (input) => { invitations.push({ ...input, acceptedAt: null }); return input; });
  mock.method(SuperAdminInvitation, "findOneAndUpdate", async (filter, update) => {
    const invitation = invitations.find((item) => item.tokenHash === filter.tokenHash && item.email === filter.email && item.acceptedAt === null && new Date(item.expiresAt) > filter.expiresAt.$gt);
    if (!invitation) return null;
    Object.assign(invitation, update.$set);
    return invitation;
  });
  mock.method(AuditLog, "create", async (entry) => { audits.push(entry); });
  mock.method(AuditLog, "find", () => query(() => [{ _id: "activity1", action: "PATCH", resource: "/api/super-admin/settings", actor: { name: "Owner" }, createdAt: new Date() }]));
  mock.method(Product, "countDocuments", async () => 48);
  mock.method(Product, "find", (filter) => { catalogFilters.push(filter); return query(() => []); });
  mock.method(Category, "countDocuments", async () => 4);
  mock.method(Order, "countDocuments", async () => 3);
  mock.method(Order, "find", (filter) => { orderFilters.push(filter); return query(() => []); });
  mock.method(User, "aggregate", async (pipeline) => { aggregateCalls.push(pipeline); return [{ _id: "2026-10", count: 3 }]; });
  mock.method(Order, "aggregate", async (pipeline) => { aggregateCalls.push(pipeline); return pipeline[0].$match?.paymentStatus ? [{ _id: "INR", total: 2500 }] : pipeline[0].$match?.createdAt ? [{ _id: "2026-10", count: 2 }] : pipeline[0].$group ? [{ _id: "placed", count: 2 }] : [{ _id: "INR", orderValue: 3000 }]; });
  await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(() => {
  users = { [ownerId]: makeUser(ownerId, "superadmin"), [adminId]: makeUser(adminId, "admin"), [customerId]: makeUser(customerId, "customer") };
  invitations = []; audits = []; aggregateCalls = []; userFilters = []; catalogFilters = []; orderFilters = [];
});
after(async () => { await new Promise((resolve) => server.close(resolve)); mock.restoreAll(); mongoose.connection.readyState = 0; });

test("dedicated login validates credentials, rejects customer/admin/blocked accounts and expires owner tokens in two hours", async () => {
  for (const id of [adminId, customerId]) {
    const result = await request("/super-admin/auth/login", { method: "POST", body: { email: users[id].email, password: "Owner-password-123!" } });
    assert.equal(result.status, 403); assert.equal(result.data.token, undefined);
  }
  const result = await request("/super-admin/auth/login", { method: "POST", body: { email: "SUPERADMIN@example.test", password: "Owner-password-123!" } });
  assert.equal(result.status, 200);
  const payload = jwt.verify(result.data.token, process.env.JWT_SECRET);
  assert.equal(payload.exp - payload.iat, 7200);
  assert.equal(result.data.user.password, undefined); assert.equal(result.data.user.authVersion, undefined);
  users[ownerId].isActive = false;
  assert.equal((await request("/super-admin/auth/login", { method: "POST", body: { email: users[ownerId].email, password: "Owner-password-123!" } })).status, 401);
});

test("invitation creation requires the current database superadmin role and stores a hash only", async () => {
  const body = { email: "NEW-OWNER@example.test" };
  for (const token of [undefined, tokenFor(adminId, { role: "superadmin" }), tokenFor(customerId)]) {
    assert.equal((await request("/super-admin/invitations", { method: "POST", token, body })).status, token ? 403 : 401);
  }
  const invitation = await invite(body.email);
  assert.match(invitation.token, /^[a-f0-9]{64}$/);
  assert.equal(invitation.email, "new-owner@example.test");
  assert.equal(invitations[0].tokenHash, hashInvitation(invitation.token));
  assert.equal(invitations[0].token, undefined);
  assert.ok(new Date(invitation.expiresAt) - Date.now() <= 86400000);
  assert.equal(SuperAdminInvitation.schema.path("tokenHash").options.select, false);
  assert.ok(audits.every((entry) => !JSON.stringify(entry).includes(invitation.token)));
});

test("invitation registration creates the authorized owner and cannot replay the token", async () => {
  const invitation = await invite();
  const result = await request("/super-admin/auth/register", { method: "POST", body: registration(invitation, { role: "customer", isActive: false }) });
  assert.equal(result.status, 201); assert.equal(result.data.user.role, "superadmin");
  assert.equal(result.data.user.password, undefined);
  assert.equal((await request("/super-admin/integrations", { token: result.data.token })).status, 200);
  assert.equal((await request("/super-admin/auth/register", { method: "POST", body: registration(invitation) })).status, 400);
});

test("concurrent invitation acceptance has only one successful claimant", async () => {
  const invitation = await invite();
  const results = await Promise.all([1, 2].map(() => request("/super-admin/auth/register", { method: "POST", body: registration(invitation) })));
  assert.deepEqual(results.map((result) => result.status).sort(), [201, 400]);
  assert.equal(Object.values(users).filter((user) => user.email === invitation.email).length, 1);
});

test("missing, malformed, mismatched, expired and revoked-inviter invitations cannot grant privileges", async () => {
  const invitation = await invite();
  for (const overrides of [{ invitationToken: "" }, { invitationToken: "f".repeat(64) }, { email: "different@example.test" }, { name: "x" }, { password: "short" }, { password: "a".repeat(73) }, { password: "🔒".repeat(20) }]) {
    assert.equal((await request("/super-admin/auth/register", { method: "POST", body: registration(invitation, overrides) })).status, 400);
  }
  invitations[0].expiresAt = new Date(Date.now() - 1);
  assert.equal((await request("/super-admin/auth/register", { method: "POST", body: registration(invitation) })).status, 400);
  invitations[0].expiresAt = new Date(Date.now() + 60000);
  for (const changes of [{ role: "admin", isActive: true }, { role: "superadmin", isActive: false }]) {
    Object.assign(users[ownerId], changes);
    assert.equal((await request("/super-admin/auth/register", { method: "POST", body: registration(invitation) })).status, 400);
    assert.equal(invitations[0].acceptedAt, null);
  }
});

test("account creation failure rolls back the invitation claim", async () => {
  const invitation = await invite();
  users["dddddddddddddddddddddddd"] = makeUser("dddddddddddddddddddddddd", "customer", invitation.email);
  const result = await request("/super-admin/auth/register", { method: "POST", body: registration(invitation) });
  assert.equal(result.status, 409); assert.equal(invitations[0].acceptedAt, null);
});

test("logout revokes existing tokens on the server and a fresh login is accepted", async () => {
  const token = tokenFor(ownerId);
  assert.equal((await request("/auth/logout", { method: "POST" })).status, 401);
  assert.equal((await request("/auth/logout", { token, method: "POST" })).status, 200);
  for (const path of ["/auth/me", "/super-admin/overview", "/admin/products"]) assert.equal((await request(path, { token })).status, 401);
  const result = await request("/super-admin/auth/login", { method: "POST", body: { email: users[ownerId].email, password: "Owner-password-123!" } });
  assert.equal((await request("/auth/me", { token: result.data.token })).status, 200);
  assert.equal((await request("/auth/me", { token: jwt.sign({ sub: ownerId, exp: 1 }, process.env.JWT_SECRET) })).status, 401);
});

test("overview returns database counts, currency-specific paid revenue, trends and recent activity", async () => {
  const result = await request("/super-admin/overview", { token: tokenFor(ownerId) });
  assert.equal(result.status, 200);
  assert.equal(result.data.overview.administrators, 1);
  assert.equal(result.data.overview.products, 48);
  assert.deepEqual(result.data.overview.revenueByCurrency, [{ _id: "INR", total: 2500 }]);
  assert.equal(result.data.statistics.users[0].count, 3);
  assert.equal(result.data.recentActivity.length, 1);
  assert.ok(aggregateCalls.some((pipeline) => pipeline[0].$match?.paymentStatus === "paid"));
  assert.equal(result.headers.get("cache-control"), "no-store");
});

test("administrator list applies server role/status/search filters and validates invalid filters", async () => {
  const result = await request("/super-admin/users?group=owners&status=active&search=%5B.*", { token: tokenFor(ownerId) });
  assert.equal(result.status, 200);
  assert.equal(userFilters[0].role, "superadmin");
  assert.deepEqual(userFilters[0].isActive, { $ne: false });
  assert.equal(userFilters[0].$or[0].name.$regex, "\\[\\.\\*");
  for (const suffix of ["group=admins&role=customer", "role=root", "status=invalid"]) assert.equal((await request(`/super-admin/users?${suffix}`, { token: tokenFor(ownerId) })).status, 400);
});

test("paginated catalog/order APIs apply safe search and filters while retaining legacy unpaginated responses", async () => {
  const token = tokenFor(ownerId);
  const products = await request("/admin/products?page=2&search=%5B.*&status=low_stock", { token });
  assert.equal(products.status, 200); assert.equal(products.data.page, 2); assert.equal(products.data.pages, 2); assert.equal(products.data.total, 48);
  assert.deepEqual(catalogFilters[0].stock, { $gt: 0, $lte: 5 });
  assert.equal(catalogFilters[0].$or[0].name.$regex, "\\[\\.\\*");
  const orders = await request("/admin/orders?page=1&search=customer&status=shipped", { token });
  assert.equal(orders.status, 200); assert.equal(orders.data.total, 3);
  assert.equal(orderFilters[0].status, "shipped");
  assert.ok(orderFilters[0].$or.some((item) => item["shippingAddress.email"]?.$regex === "customer"));
  for (const path of ["/admin/products?page=0", "/admin/products?page=1.5", "/admin/products?page=1&status=unknown", "/admin/orders?page=1&status=paid"]) assert.equal((await request(path, { token })).status, 400);
  const legacy = await request("/admin/products", { token });
  assert.equal(legacy.status, 200); assert.equal(legacy.data.pages, undefined); assert.ok(Array.isArray(legacy.data.products));
  assert.equal((await request("/admin/orders?page=1", { token: tokenFor(customerId) })).status, 403);
});

test("retired admin tokens cannot mutate management data or assign privileges", async () => {
  const token = tokenFor(adminId, { role: "superadmin" });
  for (const [path, method, body] of [
    ["/admin/products", "POST", { name: "Injected product" }],
    ["/admin/categories", "POST", { name: "Injected collection" }],
    ["/admin/inventory/adjust", "POST", { stock: 100 }],
    ["/admin/coupons", "POST", { code: "INJECTED" }],
    [`/admin/orders/${customerId}`, "PATCH", { status: "shipped" }],
    ["/super-admin/invitations", "POST", { email: "injected@example.test" }],
  ]) assert.equal((await request(path, { token, method, body })).status, 403, path);
  for (const body of [{ role: "admin" }, { role: "superadmin" }, { permissions: ["catalog"] }]) {
    assert.equal((await request(`/super-admin/users/${customerId}`, { token: tokenFor(ownerId), method: "PATCH", body })).status, 400);
  }
  assert.equal(users[adminId].role, "admin");
  assert.equal(users[customerId].role, "customer");
  assert.equal(invitations.length, 0);
});

test("sign-in destinations expose one owner panel and keep retired admins out of management", () => {
  assert.equal(authDestination("superadmin"), "/super-admin/dashboard");
  for (const role of ["admin", "customer"]) {
    for (const path of ["/admin", "/super-admin/dashboard", "/super-admin/commerce"]) assert.equal(authDestination(role, path), "/profile");
  }
  assert.equal(authDestination("seller"), "/seller");
  assert.equal(authDestination("seller", "/super-admin/products"), "/seller");
});
