import express from "express";
import { createWalletRouter, changeWallet, validRequestKey, ensureWallet } from "./routes/wallet.js";
import { quickService, deliveryQuote } from "./quickPolicy.js";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { Category, Order, Product, User } from "./db/models.js";
import { requireSuperAdmin } from "./super-admin/policies/superAdminPolicy.js";
import { auditAdminChanges, getStoreSettings, superAdminRouter } from "./super-admin/routes/superAdminRoutes.js";
import { shippingFor } from "./storeSettings.js";
import { createPaymentsRouter, paymentsConfigured, razorpayWebhook } from "./routes/payments.js";
import { dispatchNotifications, enqueueOrderEmails } from "./notifications.js";
import { connectDatabase, requireDatabase } from "./db/connection.js";
import { timingSafeEqual } from "node:crypto";
import { priceCart, quoteCoupon, reserveCoupon, changeStock, markCartConverted, expirePendingOrders } from "./orderLogic.js";
import { roundMoney } from "./commercePolicy.js";
import { notifyProductChange } from "./customerEvents.js";
import { createCommerceRouter } from "./routes/commerce.js";
import { seoRouter } from "./routes/seo.js";
import { isValidProfileImage } from "./profileImage.js";
import { createCatalogRouter } from "./super-admin/routes/catalogRoutes.js";
import { walletAdminRouter } from "./super-admin/routes/walletAdminRoutes.js";
import { acceptInvitation } from "./super-admin/services/superAdminAuth.js";

const app = express();
app.disable("x-powered-by");
if (process.env.VERCEL) app.set("trust proxy", 1);
app.use(helmet());
app.use(cors((req, callback) => callback(null, {
  origin(origin, callback) {
    const allowedOrigins = (process.env.FRONTEND_URL || "").split(",").map((value) => value.trim().replace(/\/$/, "")).filter(Boolean);
    if (!process.env.VERCEL && process.env.NODE_ENV !== "production") allowedOrigins.push("http://localhost:5173", "http://127.0.0.1:5173");
    for (const hostname of [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]) if (hostname) allowedOrigins.push(`https://${hostname}`);
    const sameOrigin = origin === `${req.protocol}://${req.get("host")}`;
    if (!origin || sameOrigin || allowedOrigins.includes(origin)) return callback(null, true);
    const error = new Error("This origin is not allowed by the API CORS policy.");
    error.status = 403;
    return callback(error);
  },
  credentials: true,
})));
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (req.path !== "/health" && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) return res.status(503).json({ message: "JWT_SECRET must be configured on the server with at least 32 characters." });
  return next();
});
app.post("/api/payments/webhook", express.raw({ type: "application/json", limit: "256kb" }), (req, res, next) => requireDatabase(req, res, next), razorpayWebhook);
app.use(express.json({ limit: "1mb" }));
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: "draft-7", legacyHeaders: false }));

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const signToken = (user) => jwt.sign({ sub: user.id, role: user.role, version: user.authVersion || 0 }, process.env.JWT_SECRET, { expiresIn: user.role === "superadmin" ? "2h" : "7d" });
const publicUser = (user) => ({ id: user.id, name: user.name, email: user.email, role: user.role, profileImage: user.profileImage || "", ...(Array.isArray(user.permissions) ? { permissions: user.permissions } : {}) });

async function authenticate(req, res, next) {
  const authorization = req.headers.authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return res.status(401).json({ message: "Please sign in to continue." });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user || user.isActive === false) return res.status(401).json({ message: "This account is unavailable or blocked. Please contact support." });
    if ((payload.version || 0) !== (user.authVersion || 0)) return res.status(401).json({ message: "Your session has ended. Please sign in again." });
    req.user = user;
    return next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Your session has expired. Please sign in again." });
    }
    return next(error);
  }
}

function validateAddress(address) {
  const fields = ["firstName", "lastName", "email", "street", "city", "state", "postalCode", "phone"];
  if (!address || fields.some((field) => typeof address[field] !== "string" || !address[field].trim())) {
    return "Please complete every shipping address field.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address.email)) return "Enter a valid email address.";
  return "";
}

app.get("/api/health", asyncRoute(async (req, res) => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) return res.status(503).json({ status: "misconfigured", database: "disconnected", message: "JWT_SECRET must be configured on the server with at least 32 characters." });
  try {
    await connectDatabase();
    return res.json({ status: "ok", database: "connected" });
  } catch (error) { return res.status(503).json({ status: "error", database: "disconnected", message: error.message }); }
}));
app.get("/api/internal/notifications", (req, res, next) => {
  if (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 32) return res.status(503).json({ message: "CRON_SECRET must be configured on the server with at least 32 characters." });
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET}`);
  const supplied = Buffer.from(req.get("authorization") || "");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return res.status(401).json({ message: "A valid scheduler authorization token is required." });
  return next();
}, requireDatabase, asyncRoute(async (req, res) => {
  await expirePendingOrders();
  const processed = await dispatchNotifications({ maxJobs: 10, deadline: Date.now() + 40000 });
  return res.json({ processed: processed || 0 });
}));
app.get("/api/settings", requireDatabase, asyncRoute(async (req, res) => res.json({ settings: await getStoreSettings() })));
app.use("/api/payments", requireDatabase, createPaymentsRouter(authenticate));
app.use("/api", createWalletRouter(authenticate));
app.use("/api", createCommerceRouter(authenticate));
app.get("/api/delivery/check", requireDatabase, asyncRoute(async (req, res) => res.json(quickService(await getStoreSettings(), req.query.postalCode))));
app.use(seoRouter);

app.post("/api/auth/register", requireDatabase, asyncRoute(async (req, res) => {
  const { name, email, password } = req.body || {};
  if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 80) return res.status(400).json({ message: "Enter a name between 2 and 80 characters." });
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: "Enter a valid email address." });
  if (typeof password !== "string" || password.length < 8 || password.length > 128) return res.status(400).json({ message: "Password must be between 8 and 128 characters." });
  const normalizedEmail = email.trim().toLowerCase();
  if (await User.exists({ email: normalizedEmail })) return res.status(409).json({ message: "An account with this email already exists." });
  const user = await User.create({ name: name.trim(), email: normalizedEmail, password });
  return res.status(201).json({ user: publicUser(user), token: signToken(user) });
}));

const login = (superAdminOnly = false) => asyncRoute(async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== "string" || email.length > 254 || typeof password !== "string" || !password || password.length > 128) return res.status(400).json({ message: "Enter your email and password." });
  const user = await User.findOne({ email: email.trim().toLowerCase() }).select("+password +authVersion");
  if (!user || user.isActive === false || !(await user.checkPassword(password))) return res.status(401).json({ message: "Email or password is incorrect, or the account is unavailable." });
  if (superAdminOnly && user.role !== "superadmin") return res.status(403).json({ message: "Super admin access is required. Use the store sign-in for your account." });
  return res.json({ user: publicUser(user), token: signToken(user) });
});
app.post("/api/auth/login", requireDatabase, login());
app.use("/api/super-admin/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: "draft-7", legacyHeaders: false }));
app.post("/api/super-admin/auth/login", requireDatabase, login(true));
app.post("/api/super-admin/auth/register", requireDatabase, asyncRoute(async (req, res) => {
  const user = await acceptInvitation(req.body);
  return res.status(201).json({ user: publicUser(user), token: signToken(user) });
}));
app.post("/api/auth/logout", requireDatabase, authenticate, asyncRoute(async (req, res) => {
  await User.updateOne({ _id: req.user.id }, { $inc: { authVersion: 1 } });
  return res.json({ message: "Signed out on all devices." });
}));

app.get("/api/auth/me", requireDatabase, authenticate, (req, res) => res.json({ user: publicUser(req.user) }));
app.patch("/api/auth/profile", requireDatabase, authenticate, asyncRoute(async (req, res) => {
  const { name, email, profileImage } = req.body || {};
  if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 80) return res.status(400).json({ message: "Enter a name between 2 and 80 characters." });
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: "Enter a valid email address." });
  if (Object.hasOwn(req.body, "profileImage") && profileImage !== null && !isValidProfileImage(profileImage)) {
    return res.status(400).json({ message: "Choose a valid JPEG profile photo under 180 KB." });
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (await User.exists({ email: normalizedEmail, _id: { $ne: req.user.id } })) return res.status(409).json({ message: "That email is already in use." });
  req.user.name = name.trim();
  req.user.email = normalizedEmail;
  if (Object.hasOwn(req.body, "profileImage")) req.user.profileImage = profileImage || "";
  await req.user.save();
  return res.json({ user: publicUser(req.user) });
}));

app.get("/api/categories", requireDatabase, asyncRoute(async (req, res) => {
  const categories = await Category.find().sort({ name: 1 }).lean();
  return res.json({ categories });
}));

app.get("/api/products", requireDatabase, asyncRoute(async (req, res) => {
  const { category, search, featured, sort, sale, quick } = req.query;
  const filter = { isPublished: { $ne: false } };
  if (typeof category === "string" && category) filter.categorySlug = category.toLowerCase();
  if (featured === "true") filter.featured = true;
  if (quick === "true") filter.quickEligible = true;
  if (sale === "true") filter.$expr = { $gt: ["$compareAtPrice", "$price"] };
  if (typeof search === "string" && search.trim()) filter.$text = { $search: search.trim().slice(0, 100) };
  const sortBy = sort === "price-low" ? { price: 1 } : sort === "price-high" ? { price: -1 } : sort === "rating" ? { rating: -1 } : { featured: -1, createdAt: -1 };
  const limit = Math.min(Math.max(Number(req.query.limit) || 40, 1), 100);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const [products, total] = await Promise.all([
    Product.find(filter).sort(sortBy).skip((page - 1) * limit).limit(limit).lean(),
    Product.countDocuments(filter),
  ]);
  return res.json({ products, total, page, pages: Math.ceil(total / limit) });
}));

app.get("/api/products/:id", requireDatabase, asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "We couldn't find that product." });
  const product = await Product.findOne({ _id: req.params.id, isPublished: { $ne: false } }).lean();
  if (!product) return res.status(404).json({ message: "We couldn't find that product." });
  return res.json({ product });
}));

app.post("/api/orders", requireDatabase, authenticate, asyncRoute(async (req, res) => {
  const storeSettings = await getStoreSettings();
  if (!storeSettings.checkoutEnabled) return res.status(503).json({ message: "The store is temporarily not accepting new orders. Please try again later." });
  const { items, shippingAddress, paymentMethod } = req.body || {};
  const addressError = validateAddress(shippingAddress);
  if (addressError) return res.status(400).json({ message: addressError });
  if (!Array.isArray(items) || items.length < 1 || items.length > 50) return res.status(400).json({ message: "Your order must contain between 1 and 50 products." });
  if (!["cash_on_delivery", "razorpay", "wallet"].includes(paymentMethod)) return res.status(400).json({ message: "Choose an available payment method." });
  if (paymentMethod === "razorpay" && (!storeSettings.onlinePaymentsEnabled || !paymentsConfigured())) return res.status(503).json({ message: "Online payment is not configured. Choose cash on delivery." });
  const checkoutKey = req.body.checkoutKey;
  if (checkoutKey !== undefined && !validRequestKey(checkoutKey) || paymentMethod === "wallet" && !validRequestKey(checkoutKey)) return res.status(400).json({ message: "A valid checkout request key is required." });
  if (checkoutKey) { await Order.init(); const existing = await Order.findOne({ user: req.user.id, checkoutKey }); if (existing) return res.status(200).json({ order: existing }); }
  if (paymentMethod === "wallet" && (!storeSettings.walletEnabled || storeSettings.currency !== "INR")) return res.status(503).json({ message: "Wallet payments are available for INR orders when the wallet is enabled." });
  if (paymentMethod === "wallet") await ensureWallet(req.user.id);
  const session = await mongoose.startSession();
  let order;
  try {
    await session.withTransaction(async () => {
      const { products, orderItems, subtotal } = await priceCart(items, session);
      const currentSettings = await getStoreSettings();
      if (currentSettings.currency !== storeSettings.currency || req.body.expectedCurrency && req.body.expectedCurrency !== storeSettings.currency || req.body.expectedSubtotal !== undefined && Math.abs(req.body.expectedSubtotal - subtotal) > .005) throw Object.assign(new Error("Catalog prices or currency changed. Refresh your bag before placing this order."), { status: 409 });
      if (paymentMethod === "razorpay" && process.env.RAZORPAY_KEY_ID?.startsWith("rzp_live_") && products.some((product) => product.isDemo)) throw Object.assign(new Error("Sample products can use test payments only."), { status: 400 });
      const { coupon, discount } = await quoteCoupon(req.body.couponCode, subtotal, storeSettings.currency, req.user.id, session);
      const delivery = deliveryQuote(req.body.deliveryMethod || "standard", shippingAddress.postalCode, products, storeSettings);
      const shipping = delivery.fee ?? shippingFor(subtotal - discount, storeSettings);
      const total = roundMoney(subtotal - discount + shipping);
      const orderId = new mongoose.Types.ObjectId();
      await reserveCoupon(coupon, req.user.id, orderId, session);
      if (paymentMethod === "wallet") {
        if (products.some((p) => p.isDemo)) throw Object.assign(new Error("Wallet funds cannot be used for sample products."), { status: 400 });
        if (total > 0) await changeWallet({ user: req.user.id, amountMinor: -Math.round(total * 100), key: `purchase/${orderId}`, kind: "purchase", description: "ShopSphere order", order: orderId }, session);
      }
      if (paymentMethod !== "razorpay") for (const item of orderItems) {
        await changeStock(item, -item.quantity, { session, actor: req.user.id, reason: paymentMethod === "wallet" ? "Wallet order" : "Cash on delivery order", reference: String(orderId) });
        const product = products.find((p) => String(p._id) === String(item.product)); const before = { ...product }; product.stock -= item.quantity;
        await notifyProductChange(before, product, storeSettings, session);
      }
      [order] = await Order.create([{
        _id: orderId, ...(checkoutKey ? { checkoutKey } : {}),
        deliveryMethod: delivery.method,
        ...(delivery.method === "express15" && paymentMethod !== "razorpay" ? { estimatedDeliveryAt: new Date(Date.now() + 15 * 60000) } : {}),
        paymentStatus: paymentMethod === "wallet" ? "paid" : "pending",
        ...(paymentMethod === "wallet" ? { paidAt: new Date() } : {}),
        orderNumber: `SS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        user: req.user.id, items: orderItems, shippingAddress, subtotal, discount, couponCode: coupon?.code || "", coupon: coupon?._id, couponCommitted: Boolean(coupon), shipping, total, paymentMethod,
        currency: storeSettings.currency,
        status: paymentMethod === "razorpay" ? "awaiting_payment" : "placed",
        inventoryCommitted: paymentMethod !== "razorpay",
        containsDemoProducts: products.some((product) => product.isDemo),
        timeline: [{ status: paymentMethod === "razorpay" ? "awaiting_payment" : "placed", message: paymentMethod === "razorpay" ? "Awaiting secure payment" : "Order placed" }],
      }], { session });
      if (paymentMethod !== "razorpay") { await markCartConverted(req.user.id, session); await enqueueOrderEmails(order, storeSettings, session); }
    });
  } catch (error) {
    if (error.code === 11000 && checkoutKey) { const existing = await Order.findOne({ user: req.user.id, checkoutKey }); if (existing) return res.status(200).json({ order: existing }); }
    if (error.status === 400 || error.status === 409) return res.status(error.status).json({ message: error.message });
    throw error;
  } finally {
    await session.endSession();
  }
  return res.status(201).json({ order });
}));

app.get("/api/orders/mine", requireDatabase, authenticate, asyncRoute(async (req, res) => {
  const orders = await Order.find({ user: req.user.id }).sort({ createdAt: -1 }).lean();
  return res.json({ orders });
}));

app.get("/api/orders/:id", requireDatabase, authenticate, asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "We couldn't find that order." });
  const order = await Order.findOne({ _id: req.params.id, user: req.user.id }).lean();
  if (!order) return res.status(404).json({ message: "We couldn't find that order." });
  return res.json({ order });
}));

app.use("/api/super-admin/wallet", requireDatabase, authenticate, requireSuperAdmin, walletAdminRouter);
app.use("/api/super-admin", requireDatabase, authenticate, requireSuperAdmin, auditAdminChanges, superAdminRouter);
app.use("/api/admin", createCatalogRouter(authenticate));

app.use((req, res) => res.status(404).json({ message: "That API route was not found." }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.type === "entity.parse.failed" || error instanceof SyntaxError) return res.status(400).json({ message: "Request body must be valid JSON." });
  if (Number.isInteger(error.status) && error.status >= 400 && error.status <= 599) return res.status(error.status).json({ message: error.message });
  if (error.code === 11000) return res.status(409).json({ message: "That email, category, or product already exists." });
  if (error.name === "ValidationError" || error.name === "CastError") return res.status(400).json({ message: "Some submitted information is invalid." });
  if (error instanceof URIError || error.name === "TypeError" && req.path.startsWith("/api/admin/products")) return res.status(400).json({ message: "Enter a valid image URL." });
  console.error("API request failed:", error.name, error.code || "");
  return res.status(500).json({ message: "The server couldn't complete that request. Please try again." });
});

export { app };
export default app;
