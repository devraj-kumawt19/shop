import { Router } from "express";
import mongoose from "mongoose";
import { Product, Order, Coupon, Review, CartState, StockMovement } from "../../db/models.js";
import { requireDatabase } from "../../db/connection.js";
import { permit } from "../permissions.js";
import { auditAdminChanges, getStoreSettings } from "./superAdminRoutes.js";
import { bad, validateCoupon, parseCsv, csvCell } from "../../commercePolicy.js";
import { changeStock } from "../../orderLogic.js";
import { notifyProductChange, queueOrderUpdate } from "../../customerEvents.js";

const route = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const id = (value) => { if (!mongoose.isValidObjectId(value)) throw bad("Resource not found.", 404); return value; };
async function transaction(fn) { const session = await mongoose.startSession(); try { return await session.withTransaction(() => fn(session)); } finally { await session.endSession(); } }

// Rating and tracking validation are shared with the customer commerce router.
export function createCommerceToolsRouter(authenticate, { trackingInput, updateRating }) {
  const router = Router();
  const secure = [requireDatabase, authenticate];
  const staff = (permissions) => [...secure, (req, res, next) => req.user.role === "superadmin" ? next() : res.status(403).json({ message: "Only the Super Admin can access these store operations." }), permit(...permissions), auditAdminChanges];
  router.put("/admin/shipments/:id", ...staff(["orders", "support"]), route(async (req, res) => {
    const input = trackingInput(req.body || {});
    await transaction(async (session) => {
      const order = await Order.findById(id(req.params.id)).session(session); if (!order) throw bad("Order not found.", 404);
      if (["awaiting_payment", "cancelled"].includes(order.status) || order.paymentStatus === "refund_required") throw bad("Resolve payment and order status before adding a shipment.", 409);
      order.tracking = input;
      order.timeline.push({ status: "tracking", message: `${input.carrier}: ${input.awb}` });
      await order.save({ session }); await queueOrderUpdate(order, session);
    }); res.json({ saved: true });
  }));
  router.get("/admin/coupons", ...staff(["catalog"]), route(async (req, res) => res.json({ coupons: await Coupon.find().sort({ createdAt: -1 }).limit(200).lean() })));
  router.post("/admin/coupons", ...staff(["catalog"]), route(async (req, res) => res.status(201).json({ coupon: await Coupon.create(validateCoupon(req.body || {})) })));
  router.patch("/admin/coupons/:id", ...staff(["catalog"]), route(async (req, res) => {
    if (typeof req.body.active !== "boolean" || Object.keys(req.body).length !== 1) throw bad("Only coupon activation can be changed. Create a new code to change its terms.");
    const coupon = await Coupon.findByIdAndUpdate(id(req.params.id), { $set: { active: req.body.active } }, { returnDocument: "after" }); if (!coupon) throw bad("Coupon not found.", 404); res.json({ coupon });
  }));
  router.get("/admin/reviews", ...staff(["reviews"]), route(async (req, res) => res.json({ reviews: await Review.find().sort({ createdAt: -1 }).limit(100).populate("product", "name").populate("user", "name").lean() })));
  router.patch("/admin/reviews/:id", ...staff(["reviews"]), route(async (req, res) => {
    if (typeof req.body.published !== "boolean") throw bad("Choose whether to publish the review.");
    await transaction(async (session) => { const review = await Review.findByIdAndUpdate(id(req.params.id), { $set: { published: req.body.published } }, { session, returnDocument: "after" }); if (!review) throw bad("Review not found.", 404); await updateRating(review.product, session); }); res.json({ saved: true });
  }));
  router.get("/admin/inventory", ...staff(["inventory"]), route(async (req, res) => {
    const settings = await getStoreSettings();
    const [products, movements] = await Promise.all([Product.find().select("name stock variants price image").sort({ stock: 1 }).limit(500).lean(), StockMovement.find().sort({ createdAt: -1 }).limit(100).populate("product", "name").populate("actor", "name").lean()]); res.json({ products, movements, threshold: settings.lowStockThreshold });
  }));
  async function adjust(rows, user) {
    const seen = new Set();
    for (const row of rows) {
      id(row.productId); const key = `${row.productId}:${row.variantSku || ""}`;
      if (seen.has(key) || !/^\d+$/.test(String(row.stock)) || Number(row.stock) > 1000000 || typeof row.reason !== "string" || !row.reason.trim() || row.reason.length > 200) throw bad("Provide unique product options, a whole stock value (0–1000000) and a reason (1–200 characters).");
      seen.add(key);
    }
    await transaction(async (session) => {
      const settings = await getStoreSettings();
      for (const row of rows) {
        const before = await Product.findById(row.productId).session(session).lean(); if (!before) throw bad("Product not found.", 404);
        const variant = before.variants?.find((entry) => entry.sku === row.variantSku);
        if (before.variants?.length ? !variant : Boolean(row.variantSku)) throw bad(`Choose a valid SKU for ${before.name}.`);
        const delta = Number(row.stock) - (variant?.stock ?? before.stock);
        if (delta) await changeStock({ product: before._id, variantSku: row.variantSku }, delta, { session, actor: user, reason: row.reason.trim() });
        const after = await Product.findById(before._id).session(session);
        await notifyProductChange(before, after, settings, session);
      }
    });
  }
  router.post("/admin/inventory/adjust", ...staff(["inventory"]), route(async (req, res) => { await adjust([req.body || {}], req.user.id); res.json({ saved: true }); }));
  router.post("/admin/inventory/import", ...staff(["inventory"]), route(async (req, res) => { const rows = parseCsv(req.body.csv); await adjust(rows, req.user.id); res.json({ imported: rows.length }); }));
  router.get("/admin/reports", ...staff(["reports"]), route(async (req, res) => {
    const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    const since = new Date(Date.now() - days * 86400000);
    const match = { createdAt: { $gte: since }, status: { $nin: ["cancelled", "awaiting_payment"] } };
    const [daily, bestsellers, abandoned, totals] = await Promise.all([
      Order.aggregate([{ $match: match }, { $group: { _id: { date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "UTC" } }, currency: { $ifNull: ["$currency", "USD"] } }, orders: { $sum: 1 }, value: { $sum: "$total" }, discounts: { $sum: { $ifNull: ["$discount", 0] } } } }, { $sort: { "_id.date": 1 } }]),
      Order.aggregate([{ $match: match }, { $unwind: "$items" }, { $group: { _id: { product: "$items.product", currency: { $ifNull: ["$currency", "USD"] } }, name: { $last: "$items.name" }, units: { $sum: "$items.quantity" }, grossValue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } } } }, { $sort: { units: -1 } }, { $limit: 15 }]),
      CartState.find({ convertedAt: null, "items.0": { $exists: true }, updatedAt: { $gte: since, $lt: new Date(Date.now() - 30 * 60000) } }).sort({ updatedAt: -1 }).limit(100).populate("user", "name email").lean(),
      Order.aggregate([{ $match: match }, { $group: { _id: { $ifNull: ["$currency", "USD"] }, orders: { $sum: 1 }, value: { $sum: "$total" }, paid: { $sum: { $cond: [{ $eq: ["$paymentStatus", "paid"] }, "$total", 0] } } } }]),
    ]);
    if (req.query.format === "csv") {
      const rows = [["Date (UTC)", "Currency", "Orders", "Order value", "Discounts"], ...daily.map((row) => [row._id.date, row._id.currency, row.orders, row.value, row.discounts])];
      return res.type("text/csv").attachment("shopsphere-sales.csv").send(rows.map((row) => row.map(csvCell).join(",")).join("\r\n"));
    }
    res.json({ days, daily, bestsellers, abandoned, totals });
  }));
  return router;
}
