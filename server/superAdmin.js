import { Router } from "express";
import mongoose from "mongoose";
import { User, Product, Category, Order, StoreSettings, AuditLog } from "./models.js";
import { validateSettings, validateUserUpdate } from "./adminPolicy.js";
import { defaultStoreSettings } from "./storeSettings.js";
import { deferTask } from "./background.js";

export const superAdminRouter = Router();
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
  const [products, categories, users, blockedUsers, orders, pendingOrders, lowStock, totals, recentOrders] = await Promise.all([
    Product.countDocuments(), Category.countDocuments(), User.countDocuments(), User.countDocuments({ isActive: false }),
    Order.countDocuments(), Order.countDocuments({ status: { $in: ["placed", "processing"] } }), Product.countDocuments({ stock: { $lte: 5 } }),
    Order.aggregate([{ $match: { status: { $nin: ["cancelled", "awaiting_payment"] } } }, { $group: { _id: { $ifNull: ["$currency", "USD"] }, orderValue: { $sum: "$total" } } }]),
    Order.find().sort({ createdAt: -1 }).limit(6).populate("user", "name email").lean(),
  ]);
  res.json({ overview: { products, categories, users, blockedUsers, orders, pendingOrders, lowStock, orderValueByCurrency: totals }, recentOrders });
}));

superAdminRouter.get("/integrations", (req, res) => res.json({
  ai: Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL), courier: Boolean(process.env.SHIPROCKET_TOKEN),
  razorpay: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_WEBHOOK_SECRET),
  email: Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM), ownerEmail: Boolean(process.env.ORDER_NOTIFICATION_EMAIL),
}));

superAdminRouter.get("/users", route(async (req, res) => {
  const requestedPage = Number(req.query.page);
  const page = Number.isFinite(requestedPage) ? Math.min(100000, Math.max(1, Math.floor(requestedPage))) : 1;
  const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const filter = search ? { $or: [{ name: { $regex: escaped, $options: "i" } }, { email: { $regex: escaped, $options: "i" } }] } : {};
  const [users, total] = await Promise.all([
    User.find(filter).select("name email role isActive permissions createdAt").sort({ createdAt: -1 }).skip((page - 1) * 25).limit(25).lean(), User.countDocuments(filter),
  ]);
  res.json({ users, page, pages: Math.ceil(total / 25), total });
}));

superAdminRouter.patch("/users/:id", route(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Account not found." });
  const target = await User.findById(req.params.id);
  if (!target) return res.status(404).json({ message: "Account not found." });
  const input = { ...(req.body || {}) };
  if (input.role === "admin" && target.role !== "admin" && !("permissions" in input)) input.permissions = [];
  if (input.role === "customer") input.permissions = [];
  const error = validateUserUpdate(req.user, target, input);
  if (error) return res.status(400).json({ message: error });
  // Include the role in the write condition so concurrent promotion cannot alter a super admin.
  const user = await User.findOneAndUpdate({ _id: target.id, role: { $ne: "superadmin" } }, { $set: input }, { new: true, runValidators: true }).select("name email role isActive permissions createdAt");
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
  await StoreSettings.findByIdAndUpdate("store", { $set: updates }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true });
  return res.json({ settings: await getStoreSettings() });
}));

superAdminRouter.get("/activity", route(async (req, res) => {
  const activity = await AuditLog.find().sort({ createdAt: -1 }).limit(100).populate("actor", "name email").lean();
  res.json({ activity });
}));
