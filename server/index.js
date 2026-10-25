import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { Category, Order, Product, User } from "./models.js";
import { requireSuperAdmin } from "./adminPolicy.js";
import { auditAdminChanges, getStoreSettings, superAdminRouter } from "./superAdmin.js";
import { shippingFor } from "./storeSettings.js";
import { createPaymentsRouter, paymentsConfigured, razorpayWebhook } from "./payments.js";
import { dispatchNotifications, enqueueOrderEmails, startNotificationWorker } from "./notifications.js";
import { Notification } from "./models.js";

const app = express();
const port = Number(process.env.PORT) || 5000;
const tokenSecret = process.env.JWT_SECRET;
const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:5173,http://127.0.0.1:5173")
  .split(",").map((origin) => origin.trim()).filter(Boolean);

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    const error = new Error("This origin is not allowed by the API CORS policy.");
    error.status = 403;
    return callback(error);
  },
  credentials: true,
}));
app.post("/api/payments/webhook", express.raw({ type: "application/json", limit: "256kb" }), (req, res, next) => requireDatabase(req, res, next), razorpayWebhook);
app.use(express.json({ limit: "1mb" }));
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: "draft-7", legacyHeaders: false }));

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const requireDatabase = (req, res, next) => {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ message: "The store database is not connected. Configure MONGO_URI on the API server." });
  next();
};
const signToken = (user) => jwt.sign({ sub: user.id, role: user.role }, tokenSecret, { expiresIn: "7d" });
const publicUser = (user) => ({ id: user.id, name: user.name, email: user.email, role: user.role });

async function authenticate(req, res, next) {
  const authorization = req.headers.authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return res.status(401).json({ message: "Please sign in to continue." });
  try {
    const payload = jwt.verify(token, tokenSecret);
    const user = await User.findById(payload.sub);
    if (!user || user.isActive === false) return res.status(401).json({ message: "This account is unavailable or blocked. Please contact support." });
    req.user = user;
    return next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Your session has expired. Please sign in again." });
    }
    return next(error);
  }
}

function requireAdmin(req, res, next) {
  if (!["admin", "superadmin"].includes(req.user.role)) return res.status(403).json({ message: "Admin access is required." });
  next();
}

function validateAddress(address) {
  const fields = ["firstName", "lastName", "email", "street", "city", "state", "postalCode", "phone"];
  if (!address || fields.some((field) => typeof address[field] !== "string" || !address[field].trim())) {
    return "Please complete every shipping address field.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address.email)) return "Enter a valid email address.";
  return "";
}

function isHttpUrl(value) {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

app.get("/api/health", (req, res) => res.json({ status: "ok", database: mongoose.connection.readyState === 1 ? "connected" : "disconnected" }));
app.get("/api/settings", requireDatabase, asyncRoute(async (req, res) => res.json({ settings: await getStoreSettings() })));
app.use("/api/payments", requireDatabase, createPaymentsRouter(authenticate));

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

app.post("/api/auth/login", requireDatabase, asyncRoute(async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== "string" || typeof password !== "string") return res.status(400).json({ message: "Enter your email and password." });
  const user = await User.findOne({ email: email.trim().toLowerCase() }).select("+password");
  if (!user || user.isActive === false || !(await user.checkPassword(password))) return res.status(401).json({ message: "Email or password is incorrect, or the account is unavailable." });
  return res.json({ user: publicUser(user), token: signToken(user) });
}));

app.get("/api/auth/me", requireDatabase, authenticate, (req, res) => res.json({ user: publicUser(req.user) }));
app.patch("/api/auth/profile", requireDatabase, authenticate, asyncRoute(async (req, res) => {
  const { name, email } = req.body || {};
  if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 80) return res.status(400).json({ message: "Enter a name between 2 and 80 characters." });
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: "Enter a valid email address." });
  const normalizedEmail = email.trim().toLowerCase();
  if (await User.exists({ email: normalizedEmail, _id: { $ne: req.user.id } })) return res.status(409).json({ message: "That email is already in use." });
  req.user.name = name.trim();
  req.user.email = normalizedEmail;
  await req.user.save();
  return res.json({ user: publicUser(req.user) });
}));

app.get("/api/categories", requireDatabase, asyncRoute(async (req, res) => {
  const categories = await Category.find().sort({ name: 1 }).lean();
  return res.json({ categories });
}));

app.get("/api/products", requireDatabase, asyncRoute(async (req, res) => {
  const { category, search, featured, sort, sale } = req.query;
  const filter = {};
  if (typeof category === "string" && category) filter.categorySlug = category.toLowerCase();
  if (featured === "true") filter.featured = true;
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
  const product = await Product.findById(req.params.id).lean();
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
  if (!["cash_on_delivery", "razorpay"].includes(paymentMethod)) return res.status(400).json({ message: "Choose an available payment method." });
  if (paymentMethod === "razorpay" && (!storeSettings.onlinePaymentsEnabled || !paymentsConfigured())) return res.status(503).json({ message: "Online payment is not configured. Choose cash on delivery." });
  const combined = new Map();
  for (const item of items) {
    if (!mongoose.isValidObjectId(item.product) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) {
      return res.status(400).json({ message: "One or more products or quantities are invalid." });
    }
    combined.set(item.product, (combined.get(item.product) || 0) + item.quantity);
    if (combined.get(item.product) > 99) return res.status(400).json({ message: "You can order up to 99 of each product." });
  }
  const productIds = [...combined.keys()];
  const session = await mongoose.startSession();
  let order;
  try {
    await session.withTransaction(async () => {
      const products = await Product.find({ _id: { $in: productIds } }).session(session).lean();
      if (products.length !== productIds.length) {
        const unavailable = new Error("One or more items are no longer available.");
        unavailable.status = 400;
        throw unavailable;
      }
      if (paymentMethod === "razorpay" && process.env.RAZORPAY_KEY_ID?.startsWith("rzp_live_") && products.some((product) => product.isDemo)) throw Object.assign(new Error("Sample products can use test payments only. Remove demo products from your bag before a live payment."), { status: 400 });
      const orderItems = products.map((product) => ({
        product: product._id,
        name: product.name,
        image: product.image,
        quantity: combined.get(String(product._id)),
        price: product.price,
      }));
      for (const item of orderItems) {
        if (paymentMethod === "razorpay") {
          if (!products.some((product) => String(product._id) === String(item.product) && product.stock >= item.quantity)) throw Object.assign(new Error("An item is out of stock. Please review your bag."), { status: 409 });
          continue;
        }
        const update = await Product.updateOne(
          { _id: item.product, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity } },
          { session },
        );
        if (update.modifiedCount !== 1) {
          const soldOut = new Error("A product sold out while placing your order. Please review your bag.");
          soldOut.status = 409;
          throw soldOut;
        }
      }
      const subtotal = Math.round(orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0) * 100) / 100;
      const shipping = shippingFor(subtotal, storeSettings);
      [order] = await Order.create([{
        orderNumber: `SS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        user: req.user.id, items: orderItems, shippingAddress, subtotal, shipping, total: Math.round((subtotal + shipping) * 100) / 100, paymentMethod,
        currency: storeSettings.currency,
        status: paymentMethod === "razorpay" ? "awaiting_payment" : "placed",
        inventoryCommitted: paymentMethod !== "razorpay",
        containsDemoProducts: products.some((product) => product.isDemo),
      }], { session });
      if (paymentMethod === "cash_on_delivery") await enqueueOrderEmails(order, storeSettings, session);
    });
  } catch (error) {
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

app.use("/api/super-admin", requireDatabase, authenticate, requireSuperAdmin, auditAdminChanges, superAdminRouter);
app.use("/api/admin", requireDatabase, authenticate, requireAdmin, auditAdminChanges);
app.get("/api/admin/products", asyncRoute(async (req, res) => res.json({ products: await Product.find().sort({ createdAt: -1 }).lean() })));
app.post("/api/admin/products", asyncRoute(async (req, res) => {
  const { name, category, description, image, price, compareAtPrice, stock, badge } = req.body || {};
  if (![name, category, description, image].every((value) => typeof value === "string" && value.trim())) return res.status(400).json({ message: "Name, category, description, and image URL are required." });
  const parsedImage = new URL(image);
  if (!["http:", "https:"].includes(parsedImage.protocol)) return res.status(400).json({ message: "Image URL must use HTTP or HTTPS." });
  if (!Number.isFinite(price) || price <= 0 || !Number.isInteger(stock) || stock < 0) return res.status(400).json({ message: "Enter a positive price and a valid stock quantity." });
  const slug = String(req.body.categorySlug || category).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  if (!await Category.exists({ slug })) return res.status(400).json({ message: "Choose an existing product category." });
  const product = await Product.create({ ...req.body, category: category.trim(), categorySlug: slug, price, compareAtPrice: Number(compareAtPrice) || 0, stock, featured: Boolean(req.body.featured) });
  return res.status(201).json({ product });
}));
app.patch("/api/admin/products/:id", asyncRoute(async (req, res) => {
  const allowed = ["name", "category", "categorySlug", "description", "image", "price", "compareAtPrice", "stock", "badge", "featured", "isDemo"];
  const updates = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => allowed.includes(key)));
  if (updates.category && !updates.categorySlug) updates.categorySlug = updates.category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  if (updates.categorySlug && !await Category.exists({ slug: updates.categorySlug })) return res.status(400).json({ message: "Choose an existing product category." });
  if (updates.image) {
    const image = new URL(updates.image);
    if (!["http:", "https:"].includes(image.protocol)) return res.status(400).json({ message: "Image URL must use HTTP or HTTPS." });
  }
  const product = await Product.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (!product) return res.status(404).json({ message: "We couldn't find that product." });
  return res.json({ product });
}));
app.delete("/api/admin/products/:id", asyncRoute(async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) return res.status(404).json({ message: "We couldn't find that product." });
  return res.json({ message: "Product removed." });
}));

app.get("/api/admin/categories", asyncRoute(async (req, res) => res.json({ categories: await Category.find().sort({ name: 1 }).lean() })));
app.post("/api/admin/categories", asyncRoute(async (req, res) => {
  const { name, slug, description = "", image = "" } = req.body || {};
  if (typeof name !== "string" || name.trim().length < 2) return res.status(400).json({ message: "Enter a category name." });
  if (image && (typeof image !== "string" || !isHttpUrl(image))) return res.status(400).json({ message: "Category image URL must use HTTP or HTTPS." });
  const normalizedSlug = (typeof slug === "string" && slug.trim() ? slug : name).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const category = await Category.create({ name: name.trim(), slug: normalizedSlug, description, image });
  return res.status(201).json({ category });
}));
app.patch("/api/admin/categories/:id", asyncRoute(async (req, res) => {
  const session = await mongoose.startSession();
  let category;
  try {
    await session.withTransaction(async () => {
      category = await Category.findById(req.params.id).session(session);
      if (!category) {
        const missing = new Error("We couldn't find that category.");
        missing.status = 404;
        throw missing;
      }
      const previousSlug = category.slug;
      const nextName = typeof req.body.name === "string" ? req.body.name.trim() : category.name;
      const nameChanged = nextName !== category.name;
      category.name = nextName;
      if (typeof req.body.slug === "string" && req.body.slug.trim()) {
        category.slug = req.body.slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      }
      if (typeof req.body.description === "string") category.description = req.body.description;
      if (typeof req.body.image === "string") {
        if (req.body.image && !isHttpUrl(req.body.image)) {
          const invalidImage = new Error("Category image URL must use HTTP or HTTPS.");
          invalidImage.status = 400;
          throw invalidImage;
        }
        category.image = req.body.image;
      }
      await category.save({ session });
      if (previousSlug !== category.slug || nameChanged) {
        await Product.updateMany(
          { categorySlug: previousSlug },
          { categorySlug: category.slug, category: category.name },
          { session },
        );
      }
    });
  } catch (error) {
    if (error.status === 404) return res.status(404).json({ message: error.message });
    if (error.status === 400) return res.status(400).json({ message: error.message });
    throw error;
  } finally {
    await session.endSession();
  }
  return res.json({ category });
}));
app.delete("/api/admin/categories/:id", asyncRoute(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) return res.status(404).json({ message: "We couldn't find that category." });
  if (await Product.exists({ categorySlug: category.slug })) return res.status(409).json({ message: "Move or remove this category's products before deleting it." });
  await category.deleteOne();
  return res.json({ message: "Category removed." });
}));
app.get("/api/admin/orders", asyncRoute(async (req, res) => {
  const orders = await Order.find().populate("user", "name email").sort({ createdAt: -1 }).lean();
  return res.json({ orders });
}));
app.post("/api/admin/orders/:id/notifications", asyncRoute(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: "Order not found." });
  if (order.status === "awaiting_payment") return res.status(409).json({ message: "Order emails are sent only after payment is confirmed." });
  await enqueueOrderEmails(order, await getStoreSettings());
  await Notification.updateMany({ order: order.id, status: { $ne: "sent" } }, { $set: { status: "pending", attempts: 0, nextAttempt: new Date() } });
  dispatchNotifications().catch(() => console.error("Notification queue could not be processed."));
  res.json({ message: "Unsent order emails have been queued for retry. Sent emails will not be duplicated." });
}));
app.patch("/api/admin/orders/:id", asyncRoute(async (req, res) => {
  const allowed = ["placed", "processing", "shipped", "delivered", "cancelled"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ message: "Choose a valid order status." });
  const session = await mongoose.startSession();
  let order;
  try {
    await session.withTransaction(async () => {
      order = await Order.findById(req.params.id).session(session);
      if (!order) {
        const missing = new Error("We couldn't find that order.");
        missing.status = 404;
        throw missing;
      }
      const nextStatus = req.body.status;
      if (order.status === "awaiting_payment" || order.paymentStatus === "refund_required") throw Object.assign(new Error("Payment must be resolved before this order can be changed."), { status: 409 });
      if (nextStatus === "cancelled" && ["shipped", "delivered"].includes(order.status)) {
        const alreadyFulfilled = new Error("Only orders that haven't shipped can be cancelled.");
        alreadyFulfilled.status = 409;
        throw alreadyFulfilled;
      }
      if (order.status !== nextStatus && nextStatus === "cancelled" && order.inventoryCommitted !== false) {
        for (const item of order.items) {
          await Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } }, { session });
        }
        order.inventoryCommitted = false;
        if (order.paymentMethod === "razorpay" && order.paymentStatus === "paid") order.paymentStatus = "refund_required";
      } else if (order.status === "cancelled" && nextStatus !== "cancelled") {
        for (const item of order.items) {
          const update = await Product.updateOne(
            { _id: item.product, stock: { $gte: item.quantity } },
            { $inc: { stock: -item.quantity } },
            { session },
          );
          if (update.modifiedCount !== 1) {
            const unavailable = new Error("The order cannot be reopened because one or more items are out of stock.");
            unavailable.status = 409;
            throw unavailable;
          }
        }
        order.inventoryCommitted = true;
      }
      order.status = nextStatus;
      await order.save({ session });
    });
  } catch (error) {
    if (error.status === 404 || error.status === 409) return res.status(error.status).json({ message: error.message });
    throw error;
  } finally {
    await session.endSession();
  }
  return res.json({ order });
}));

app.use((req, res) => res.status(404).json({ message: "That API route was not found." }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (Number.isInteger(error.status) && error.status >= 400 && error.status <= 599) return res.status(error.status).json({ message: error.message });
  if (error.code === 11000) return res.status(409).json({ message: "That email, category, or product already exists." });
  if (error.name === "ValidationError" || error.name === "CastError") return res.status(400).json({ message: "Some submitted information is invalid." });
  if (error instanceof URIError || error.name === "TypeError" && req.path.startsWith("/api/admin/products")) return res.status(400).json({ message: "Enter a valid image URL." });
  console.error("API request failed:", error);
  return res.status(500).json({ message: "The server couldn't complete that request. Please try again." });
});

if (!tokenSecret || tokenSecret.length < 32) {
  console.error("JWT_SECRET must be set to a random string with at least 32 characters.");
  process.exit(1);
}

export { app };

if (process.env.NODE_ENV !== "test" && process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI)
    .then(() => {
      console.log("Connected to MongoDB.");
      startNotificationWorker();
      app.listen(port, () => console.log(`ShopSphere API listening on port ${port}.`));
    })
    .catch((error) => {
      console.error("MongoDB connection failed:", error.message);
      process.exit(1);
    });
} else if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => console.warn(`ShopSphere API listening on ${port}; set MONGO_URI to enable database features.`));
}
