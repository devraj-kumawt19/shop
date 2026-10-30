import { Router } from "express";
import mongoose from "mongoose";
import { User, Product, Category, Order, StoreSettings, AuditLog } from "../../db/models.js";
import { validateSettings, validateUserUpdate } from "../policies/superAdminPolicy.js";
import { defaultStoreSettings } from "../../storeSettings.js";
import { deferTask } from "../../background.js";
import { createInvitation } from "../services/superAdminAuth.js";
import { can, adminPermissionOptions } from "../permissions.js";

export const superAdminRouter = Router();
export const peopleRouter = Router();
superAdminRouter.use(peopleRouter);
const route = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);

export async function getStoreSettings() {
  const stored = await StoreSettings.findById("store").lean();
  return Object.fromEntries(Object.entries(defaultStoreSettings).map(([key, value]) => [key, stored?.[key] ?? value]));
}

export function auditAdminChanges(req, res, next) {
  if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) {
    res.on("finish", () => {
      if (res.statusCode < 400) deferTask(req, () => AuditLog.create({ actor: req.user.id, action: req.method, resource: req.originalUrl.split("?")[0] }), "Could not record admin activity.");
    });
  }
  next();
}

superAdminRouter.get("/overview", route(async (req, res) => {
  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - 5, 1);
  since.setUTCHours(0, 0, 0, 0);
  const [products, categories, users, blockedUsers, orders, pendingOrders, lowStock, totals, recentOrders, administrators, revenue, userStatistics, orderStatistics, orderStatuses, recentActivity] = await Promise.all([
    Product.countDocuments(), Category.countDocuments(), User.countDocuments(), User.countDocuments({ isActive: false }),
    Order.countDocuments(), Order.countDocuments({ status: { $in: ["placed", "processing"] } }), Product.countDocuments({ stock: { $lte: 5 } }),
    Order.aggregate([{ $match: { status: { $nin: ["cancelled", "awaiting_payment"] } } }, { $group: { _id: { $ifNull: ["$currency", "USD"] }, orderValue: { $sum: "$total" } } }]),
    Order.find().sort({ createdAt: -1 }).limit(6).populate("user", "name email").lean(),
    User.countDocuments({ role: "superadmin" }),
    Order.aggregate([{ $match: { paymentStatus: "paid", status: { $nin: ["cancelled", "awaiting_payment"] } } }, { $group: { _id: { $ifNull: ["$currency", "USD"] }, total: { $sum: "$total" } } }]),
    User.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt", timezone: "UTC" } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Order.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt", timezone: "UTC" } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Order.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    AuditLog.find().sort({ createdAt: -1 }).limit(5).populate("actor", "name email").lean(),
  ]);
  res.json({ overview: { products, categories, users, blockedUsers, administrators, orders, pendingOrders, lowStock, orderValueByCurrency: totals, revenueByCurrency: revenue }, recentOrders, recentActivity, statistics: { since, users: userStatistics, orders: orderStatistics, orderStatuses } });
}));

superAdminRouter.post("/invitations", route(async (req, res) => {
  const invitation = await createInvitation(req.user, req.body?.email);
  return res.status(201).json({ invitation });
}));

superAdminRouter.get("/integrations", (req, res) => res.json({
  ai: Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL), courier: Boolean(process.env.SHIPROCKET_TOKEN),
  razorpay: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_WEBHOOK_SECRET),
  email: Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM), ownerEmail: Boolean(process.env.ORDER_NOTIFICATION_EMAIL),
}));

peopleRouter.get("/users", route(async (req, res) => {
  const requestedPage = Number(req.query.page);
  const page = Number.isFinite(requestedPage) ? Math.min(100000, Math.max(1, Math.floor(requestedPage))) : 1;
  const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const filter = search ? { $or: [{ name: { $regex: escaped, $options: "i" } }, { email: { $regex: escaped, $options: "i" } }] } : {};
  const staff = req.user.role === "admin";
  const ownersOnly = ["owners", "admins"].includes(req.query.group);
  if (staff && ownersOnly) return res.status(403).json({ message: "Only the owner can view administrator accounts." });
  const visibleRoles = staff ? ["seller", "customer"].filter((role) => can(req.user, role === "seller" ? "sellers" : "customers")) : [];
  if (staff && !visibleRoles.length) return res.status(403).json({ message: "The owner has not assigned account-management permissions." });
  if (staff) filter.role = { $in: visibleRoles };
  if (ownersOnly) filter.role = "superadmin";
  if (typeof req.query.role === "string" && req.query.role) {
    if (!["customer", "seller", "admin", "superadmin"].includes(req.query.role) || ownersOnly && req.query.role !== "superadmin") return res.status(400).json({ message: "Choose a valid account role." });
    if (staff && !visibleRoles.includes(req.query.role)) return res.status(403).json({ message: "The owner has not assigned access to this account group." });
    filter.role = req.query.role;
  }
  if (req.query.status === "active") filter.isActive = { $ne: false };
  else if (req.query.status === "blocked") filter.isActive = false;
  else if (req.query.status) return res.status(400).json({ message: "Choose a valid account status." });
  const [users, total] = await Promise.all([
    User.find(filter).select("name email role isActive permissions createdAt").sort({ createdAt: -1 }).skip((page - 1) * 25).limit(25).lean(), User.countDocuments(filter),
  ]);
  res.json({ users, page, pages: Math.ceil(total / 25), total });
}));

peopleRouter.post(["/sellers", "/admins"], route(async (req, res) => {
  const role = req.path === "/admins" ? "admin" : "seller";
  if (role === "admin" && req.user.role !== "superadmin") return res.status(403).json({ message: "Only the owner can create administrators." });
  if (role === "seller" && req.user.role === "admin" && !can(req.user, "sellers")) return res.status(403).json({ message: "The owner has not assigned seller-management permission." });
  const { name, email, password } = req.body || {};
  if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 80) return res.status(400).json({ message: "Enter a seller name between 2 and 80 characters." });
  if (typeof email !== "string" || email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return res.status(400).json({ message: "Enter a valid seller email address." });
  if (typeof password !== "string" || password.length < 12 || password.length > 128) return res.status(400).json({ message: "Seller passwords must be between 12 and 128 characters." });
  const normalizedEmail = email.trim().toLowerCase();
  if (await User.exists({ email: normalizedEmail })) return res.status(409).json({ message: "An account with this email already exists." });
  const permissions = role === "admin" ? req.body.permissions : [];
  if (role === "admin" && (!Array.isArray(permissions) || new Set(permissions).size !== permissions.length || permissions.some((permission) => !adminPermissionOptions.some((option) => option.value === permission)))) return res.status(400).json({ message: "Choose valid, unique administrator permissions." });
  const account = await User.create({ name: name.trim(), email: normalizedEmail, password, role, permissions });
  return res.status(201).json({ [role]: { id: account.id, name: account.name, email: account.email, role: account.role, permissions: account.permissions, isActive: account.isActive, createdAt: account.createdAt } });
}));

peopleRouter.patch("/users/:id", route(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Account not found." });
  const target = await User.findById(req.params.id);
  if (!target) return res.status(404).json({ message: "Account not found." });
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) return res.status(400).json({ message: "Enter valid account updates." });
  const input = { ...req.body };
  const error = validateUserUpdate(req.user, target, input);
  if (error) return res.status(400).json({ message: error });
  if (req.user.role === "admin") {
    for (const role of new Set([target.role, input.role].filter(Boolean))) {
      if (role === "seller" && !can(req.user, "sellers") || role === "customer" && !can(req.user, "customers")) return res.status(403).json({ message: "The owner has not assigned permission to manage this account group." });
    }
  }
  if ("role" in input && input.role !== "admin" || input.role === "admin" && !("permissions" in input)) input.permissions = [];
  // Refuse stale writes if another administrator changes the target role/status.
  const filter = { _id: target.id, role: target.role, isActive: target.isActive };
  const update = async (session) => User.findOneAndUpdate(filter, { $set: input, $inc: { authVersion: 1 } }, { returnDocument: "after", runValidators: true, ...(session ? { session } : {}) }).select("name email role isActive permissions createdAt");
  let user;
  if (target.role === "seller" || input.role === "seller") {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        user = await update(session);
        if (user) {
          const activeSeller = (input.role || target.role) === "seller" && (input.isActive ?? target.isActive) !== false;
          await Product.updateMany({ seller: target.id }, { $set: { isPublished: activeSeller } }, { session });
        }
      });
    } finally { await session.endSession(); }
  } else {
    user = await update();
  }
  if (!user) return res.status(409).json({ message: "This account changed. Refresh and try again." });
  return res.json({ user });
}));

superAdminRouter.get("/settings", route(async (req, res) => res.json({ settings: await getStoreSettings() })));
superAdminRouter.patch("/settings", route(async (req, res) => {
  const error = validateSettings(req.body);
  if (error) return res.status(400).json({ message: error });
  const mergedError = validateSettings({ ...(await getStoreSettings()), ...req.body });
  if (mergedError) return res.status(400).json({ message: mergedError });
  const updates = Object.fromEntries(Object.entries(req.body).map(([key, value]) => [key, typeof value === "string" ? value.trim() : value]));
  await StoreSettings.findByIdAndUpdate("store", { $set: updates }, { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true });
  return res.json({ settings: await getStoreSettings() });
}));

superAdminRouter.get("/activity", route(async (req, res) => {
  const activity = await AuditLog.find().sort({ createdAt: -1 }).limit(100).populate("actor", "name email").lean();
  res.json({ activity });
}));
