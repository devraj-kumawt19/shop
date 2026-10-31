import assert from "node:assert/strict";

const target = process.argv[2];
if (!target) {
  console.error("Usage: npm run verify:production -- https://your-actual-deployment");
  process.exit(1);
}
const deployment = new URL(target);
if (deployment.protocol !== "https:" || deployment.username || deployment.password || /^(localhost|127\.)/.test(deployment.hostname)) throw new Error("Use your actual public HTTPS deployment URL.");

async function request(path, expectedStatus, { method = "GET", body, token } = {}) {
  const response = await fetch(new URL(path, deployment.origin), {
    method, signal: AbortSignal.timeout(30000),
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal(response.status, expectedStatus, `${method} ${path}: expected ${expectedStatus}, received ${response.status}`);
  assert.match(response.headers.get("content-type") || "", /application\/json/i, `${path} must return JSON, not the SPA or a platform error`);
  const data = await response.json();
  console.log(`PASS ${method} ${path}: ${response.status} JSON`);
  return data;
}

try {
  const health = await request("/api/health", 200);
  assert.equal(health.database, "connected", "Production MongoDB must be connected");
  assert.equal(health.status, "ok");
  const catalog = await request("/api/products?limit=1", 200);
  assert.ok(Array.isArray(catalog.products));
  await request("/api/auth/login", 400, { method: "POST", body: {} });
  await request("/api/auth/me", 401);
  await request("/api/not-an-existing-route", 404);
  const spa = await fetch(new URL("/login", deployment.origin), { signal: AbortSignal.timeout(30000) });
  assert.equal(spa.status, 200);
  assert.match(spa.headers.get("content-type") || "", /text\/html/i);
  console.log("PASS /login: SPA deep link returns HTML");
  if (process.env.LUXE_CARTS_SMOKE_EMAIL && process.env.LUXE_CARTS_SMOKE_PASSWORD) {
    const session = await request("/api/auth/login", 200, { method: "POST", body: { email: process.env.LUXE_CARTS_SMOKE_EMAIL, password: process.env.LUXE_CARTS_SMOKE_PASSWORD } });
    assert.ok(session.token);
    const profile = await request("/api/auth/me", 200, { token: session.token });
    assert.equal(profile.user.id, session.user.id);
    console.log("PASS existing-account login and bearer authentication (credentials and token not logged)");
  } else console.log("SKIP valid-account login: set LUXE_CARTS_SMOKE_EMAIL and LUXE_CARTS_SMOKE_PASSWORD locally to include it.");
  console.log("Production API smoke checks passed.");
} catch (error) {
  console.error("Production is NOT verified:", error.message);
  process.exitCode = 1;
}
