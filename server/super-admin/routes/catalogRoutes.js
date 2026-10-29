import { Router } from "express";
import mongoose from "mongoose";
import { Category, Order, Product, StockMovement, Notification } from "../../db/models.js";
import { requireDatabase } from "../../db/connection.js";
import { adminListQuery } from "../policies/superAdminPolicy.js";
import { can, permit } from "../permissions.js";
import { auditAdminChanges, getStoreSettings } from "./superAdminRoutes.js";
import { normalizeVariants, roundMoney } from "../../commercePolicy.js";
import { changeStock, releaseCoupon } from "../../orderLogic.js";
import { notifyProductChange, queueOrderUpdate } from "../../customerEvents.js";
import { refundWalletOrder } from "../../routes/wallet.js";
import { enqueueOrderEmails, dispatchNotifications } from "../../notifications.js";
import { deferTask } from "../../background.js";

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

function requireOwner(req, res, next) {
  if (req.user.role !== "superadmin") return res.status(403).json({ message: "Super Admin access is required." });
  next();
}

function isHttpUrl(value) {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function createCatalogRouter(authenticate) {
  const router = Router();
  router.use(requireDatabase, authenticate, (req, res, next) => {
    if (req.user.role === "seller") {
      const scope = req.path.split("/")[1];
      if (scope === "products" || scope === "categories" && req.method === "GET") return next();
      return res.status(403).json({ message: "Seller access is limited to your own products and product categories." });
    }
    return requireOwner(req, res, next);
  }, (req, res, next) => {
    if (req.user.role === "seller") return next();
    const scope = req.path.split("/")[1];
    const permissions = scope === "orders" ? (req.method === "GET" ? ["orders", "support"] : ["orders"]) : ["catalog"];
    return permit(...permissions)(req, res, next);
  }, auditAdminChanges);
  router.get("/products", asyncRoute(async (req, res) => {
    const filter = req.user.role === "seller" ? { seller: req.user.id } : {};
    if (req.query.page !== undefined) {
      const { page, limit, filter: searchFilter } = adminListQuery(req.query, "products");
      const combined = { ...searchFilter, ...filter };
      const [products, total] = await Promise.all([Product.find(combined).populate("seller", "name email").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), Product.countDocuments(combined)]);
      return res.json({ products, total, page, pages: Math.ceil(total / limit) });
    }
    const products = await Product.find(filter).populate("seller", "name email").sort({ createdAt: -1 }).lean();
    return res.json({ products });
  }));
  router.post("/products", asyncRoute(async (req, res) => {
    const { name, category, description, image, price, compareAtPrice, stock, badge } = req.body || {};
    if (![name, category, description, image].every((value) => typeof value === "string" && value.trim())) return res.status(400).json({ message: "Name, category, description, and image URL are required." });
    const parsedImage = new URL(image);
    if (!["http:", "https:"].includes(parsedImage.protocol)) return res.status(400).json({ message: "Image URL must use HTTP or HTTPS." });
    if (!Number.isFinite(price) || price <= 0 || !Number.isInteger(stock) || stock < 0) return res.status(400).json({ message: "Enter a positive price and a valid stock quantity." });
    const slug = String(req.body.categorySlug || category).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    if (!await Category.exists({ slug })) return res.status(400).json({ message: "Choose an existing product category." });
    const variants = normalizeVariants(req.body.variants || []);
    if (!can(req.user, "inventory") && req.user.role !== "seller" && (stock > 0 || variants.length)) return res.status(403).json({ message: "Inventory permission is required to set initial stock or product options." });
    const session = await mongoose.startSession(); let product;
    try { await session.withTransaction(async () => {
    [product] = await Product.create([{ name: name.trim(), description, image, badge, category: category.trim(), categorySlug: slug, price: variants.length ? Math.min(...variants.map((v) => v.price)) : price, compareAtPrice: Number(compareAtPrice) || 0, stock: variants.length ? variants.reduce((sum, v) => sum + v.stock, 0) : stock, variants, featured: req.user.role === "seller" ? false : Boolean(req.body.featured), isDemo: req.user.role === "seller" ? false : Boolean(req.body.isDemo), quickEligible: req.user.role === "seller" ? false : Boolean(req.body.quickEligible), ...(req.user.role === "seller" ? { seller: req.user.id, isPublished: true } : {}) }], { session });
    const initial = variants.length ? variants.filter((v) => v.stock > 0).map((v) => ({ product: product.id, variantSku: v.sku, delta: v.stock, reason: "Initial inventory", actor: req.user.id })) : stock > 0 ? [{ product: product.id, delta: stock, reason: "Initial inventory", actor: req.user.id }] : [];
    if (initial.length) await StockMovement.create(initial, { session, ordered: true });
    }); } finally { await session.endSession(); }
    return res.status(201).json({ product });
  }));
  router.patch("/products/:id", asyncRoute(async (req, res) => {
    const allowed = ["name", "category", "categorySlug", "description", "image", "price", "compareAtPrice", "stock", "badge", "featured", "isDemo", "variants", "quickEligible"];
    const sellerFields = ["name", "category", "categorySlug", "description", "image", "price", "compareAtPrice", "stock", "badge", "variants"];
    const updates = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => (req.user.role === "seller" ? sellerFields : allowed).includes(key)));
    for (const key of ["price", "compareAtPrice", "stock"]) if (key in updates && (!Number.isFinite(updates[key]) || updates[key] < 0 || (key === "stock" ? !Number.isInteger(updates[key]) : roundMoney(updates[key]) !== updates[key]) || key === "price" && updates[key] === 0)) return res.status(400).json({ message: "Use a positive price, non-negative compare-at price and whole stock quantities." });
    if (updates.category && !updates.categorySlug) updates.categorySlug = updates.category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    if (updates.categorySlug && !await Category.exists({ slug: updates.categorySlug })) return res.status(400).json({ message: "Choose an existing product category." });
    if (updates.image) {
      const image = new URL(updates.image);
      if (!["http:", "https:"].includes(image.protocol)) return res.status(400).json({ message: "Image URL must use HTTP or HTTPS." });
    }
    const before = await Product.findOne({ _id: req.params.id, ...(req.user.role === "seller" ? { seller: req.user.id } : {}) }).lean();
    if (!before) return res.status(404).json({ message: "We couldn't find that product." });
    if (("stock" in updates || "variants" in updates) && !can(req.user, "inventory") && req.user.role !== "seller") return res.status(403).json({ message: "Inventory permission is required to edit stock or variants." });
    // Stock edits use the inventory ledger, avoiding races with checkout.
    if ("stock" in updates && updates.stock !== before.stock && req.user.role !== "seller") return res.status(409).json({ message: "Change stock in Commerce tools > Inventory to record an adjustment." });
    if ("variants" in updates) {
      updates.variants = normalizeVariants(updates.variants);
      for (const old of before.variants || []) {
        const next = updates.variants.find((v) => v.sku === old.sku);
        if (!next) return res.status(409).json({ message: "Existing SKUs cannot be removed. Set their stock to zero instead." });
        if (req.user.role !== "seller" && next.stock !== old.stock) return res.status(409).json({ message: "Keep existing SKUs and stock unchanged. Use Inventory to change stock." });
      }
      if (req.user.role !== "seller" && (before.variants?.length || before.stock > 0) && updates.variants.some((v) => !before.variants?.some((old) => old.sku === v.sku) && v.stock > 0)) return res.status(409).json({ message: "New options must start with zero stock. Restock in Inventory after saving." });
      if (!before.variants?.length && before.stock !== 0 && req.user.role !== "seller") return res.status(409).json({ message: "Set stock to zero through Inventory before adding variants." });
      if (updates.variants.length) { updates.stock = updates.variants.reduce((sum, v) => sum + v.stock, 0); updates.price = Math.min(...updates.variants.map((v) => v.price)); }
    }
    const session = await mongoose.startSession(); let product;
    try { await session.withTransaction(async () => {
      product = await Product.findOneAndUpdate({ _id: before._id, updatedAt: before.updatedAt, ...(req.user.role === "seller" ? { seller: req.user.id } : {}) }, updates, { session, new: true, runValidators: true });
      if (!product) throw Object.assign(new Error("Product changed. Refresh before editing."), { status: 409 });
      if (req.user.role === "seller" && "variants" in updates && updates.variants.length) {
        const movements = updates.variants.map((variant) => {
          const previous = before.variants?.find((item) => item.sku === variant.sku);
          return { product: product.id, variantSku: variant.sku, delta: variant.stock - (previous?.stock || 0), reason: "Seller inventory adjustment", actor: req.user.id };
        }).filter((movement) => movement.delta !== 0);
        if (movements.length) await StockMovement.create(movements, { session, ordered: true });
      } else if (req.user.role === "seller" && "stock" in updates && updates.stock !== before.stock) {
        await StockMovement.create([{ product: product.id, delta: updates.stock - before.stock, reason: "Seller inventory adjustment", actor: req.user.id }], { session });
      }
      await notifyProductChange(before, product, await getStoreSettings(), session);
    }); } finally { await session.endSession(); }
    return res.json({ product });
  }));
  router.delete("/products/:id", asyncRoute(async (req, res) => {
    const session = await mongoose.startSession();
    try { await session.withTransaction(async () => {
      const filter = { _id: req.params.id, ...(req.user.role === "seller" ? { seller: req.user.id } : {}) };
      if (!await Product.exists(filter).session(session)) throw Object.assign(new Error("We couldn't find that product."), { status: 404 });
      if (await Order.exists({ "items.product": req.params.id, status: { $in: ["awaiting_payment", "placed", "processing", "shipped"] } }).session(session)) throw Object.assign(new Error("This product is in an active order. Resolve the order before deleting it."), { status: 409 });
      const product = await Product.findOneAndDelete(filter, { session });
      if (!product) throw Object.assign(new Error("We couldn't find that product."), { status: 404 });
    }); } finally { await session.endSession(); }
    return res.json({ message: "Product removed." });
  }));

  router.get("/categories", asyncRoute(async (req, res) => res.json({ categories: await Category.find().sort({ name: 1 }).lean() })));
  router.post("/categories", asyncRoute(async (req, res) => {
    const { name, slug, description = "", image = "" } = req.body || {};
    if (typeof name !== "string" || name.trim().length < 2) return res.status(400).json({ message: "Enter a category name." });
    if (image && (typeof image !== "string" || !isHttpUrl(image))) return res.status(400).json({ message: "Category image URL must use HTTP or HTTPS." });
    const normalizedSlug = (typeof slug === "string" && slug.trim() ? slug : name).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const category = await Category.create({ name: name.trim(), slug: normalizedSlug, description, image });
    return res.status(201).json({ category });
  }));
  router.patch("/categories/:id", asyncRoute(async (req, res) => {
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
  router.delete("/categories/:id", asyncRoute(async (req, res) => {
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ message: "We couldn't find that category." });
    if (await Product.exists({ categorySlug: category.slug })) return res.status(409).json({ message: "Move or remove this category's products before deleting it." });
    await category.deleteOne();
    return res.json({ message: "Category removed." });
  }));
  router.get("/orders", asyncRoute(async (req, res) => {
    if (req.query.page !== undefined) {
      const { page, limit, filter } = adminListQuery(req.query, "orders");
      const [orders, total] = await Promise.all([Order.find(filter).populate("user", "name email").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), Order.countDocuments(filter)]);
      return res.json({ orders, total, page, pages: Math.ceil(total / limit) });
    }
    const orders = await Order.find().populate("user", "name email").sort({ createdAt: -1 }).lean();
    return res.json({ orders });
  }));
  router.post("/orders/:id/notifications", asyncRoute(async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found." });
    if (order.status === "awaiting_payment") return res.status(409).json({ message: "Order emails are sent only after payment is confirmed." });
    await enqueueOrderEmails(order, await getStoreSettings());
    await Notification.updateMany({ order: order.id, status: { $ne: "sent" } }, { $set: { status: "pending", attempts: 0, nextAttempt: new Date() } });
    deferTask(req, () => dispatchNotifications({ maxJobs: 2, deadline: Date.now() + 40000 }), "Notification queue could not be processed.");
    res.json({ message: "Unsent order emails have been queued for retry. Sent emails will not be duplicated." });
  }));
  router.patch("/orders/:id", asyncRoute(async (req, res) => {
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
            const before = await Product.findById(item.product).session(session).lean();
            await changeStock(item, item.quantity, { session, actor: req.user.id, reason: "Order cancelled", reference: order.id });
            await notifyProductChange(before, { ...before, stock: before.stock + item.quantity, updatedAt: new Date() }, await getStoreSettings(), session);
          }
          order.inventoryCommitted = false;
          await refundWalletOrder(order, session);
          if (order.paymentMethod === "razorpay" && order.paymentStatus === "paid") order.paymentStatus = "refund_required";
        } else if (order.status === "cancelled" && nextStatus !== "cancelled") {
          if (order.paymentMethod === "wallet") throw Object.assign(new Error("A refunded wallet order cannot be reopened. Place a new order."), { status: 409 });
          if (order.couponCode) throw Object.assign(new Error("Cancelled discounted orders cannot be reopened; place a new order."), { status: 409 });
          for (const item of order.items) await changeStock(item, -item.quantity, { session, actor: req.user.id, reason: "Order reopened", reference: order.id });
          order.inventoryCommitted = true;
        }
        const changed = order.status !== nextStatus;
        if (changed && nextStatus === "cancelled") await releaseCoupon(order, session);
        order.status = nextStatus;
        if (changed) order.timeline.push({ status: nextStatus, message: `Order ${nextStatus}` });
        await order.save({ session });
        if (changed) await queueOrderUpdate(order, session);
      });
    } catch (error) {
      if (error.status === 404 || error.status === 409) return res.status(error.status).json({ message: error.message });
      throw error;
    } finally {
      await session.endSession();
    }
    return res.json({ order });
  }));

  return router;
}
