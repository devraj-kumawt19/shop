import mongoose from "mongoose";
import { Product, Order, Coupon, CouponUse, StockMovement, CartState } from "./db/models.js";
import { bad, discountFor, roundMoney } from "./commercePolicy.js";

export async function priceCart(items, session) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 50) throw bad("Your bag must contain 1–50 product options.");
  const combined = new Map();
  for (const item of items) {
    if (!mongoose.isValidObjectId(item.product) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99 || (item.variantSku && !/^[A-Z0-9_-]{2,40}$/.test(item.variantSku))) throw bad("Invalid product, variant or quantity.");
    const key = `${item.product}:${item.variantSku || ""}`;
    const quantity = (combined.get(key)?.quantity || 0) + item.quantity;
    if (quantity > 99) throw bad("You can order up to 99 of each product option.");
    combined.set(key, { product: item.product, variantSku: item.variantSku || "", quantity });
  }
  let query = Product.find({ _id: { $in: [...new Set([...combined.values()].map((item) => item.product))] }, isPublished: { $ne: false } });
  if (session) query = query.session(session);
  const products = await query.lean();
  const orderItems = [...combined.values()].map((item) => {
    const product = products.find((entry) => String(entry._id) === item.product);
    if (!product) throw bad("A product in your bag is no longer available.");
    const variant = product.variants?.find((entry) => entry.sku === item.variantSku);
    if ((product.variants?.length && !variant) || (!product.variants?.length && item.variantSku)) throw bad(`Choose an available option for ${product.name}.`);
    if ((variant?.stock ?? product.stock) < item.quantity) throw bad(`${product.name} does not have enough stock.`, 409);
    return { product: product._id, name: product.name, image: product.image, quantity: item.quantity, price: variant?.price ?? product.price, variantSku: variant?.sku || "", variantLabel: variant ? [variant.size, variant.color].filter(Boolean).join(" / ") || variant.sku : "" };
  });
  return { products, orderItems, subtotal: roundMoney(orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0)) };
}

export async function quoteCoupon(code, subtotal, currency, userId, session) {
  if (!code) return { discount: 0, coupon: null };
  if (typeof code !== "string" || !/^[A-Z0-9_-]{3,30}$/i.test(code.trim())) throw bad("Enter a valid coupon code.");
  let query = Coupon.findOne({ code: code.trim().toUpperCase() });
  if (session) query = query.session(session);
  const coupon = await query;
  const discount = discountFor(coupon, subtotal, currency);
  let used = CouponUse.exists({ coupon: coupon.id, user: userId }); if (session) used = used.session(session);
  if (await used) throw bad("You have already used this coupon or have a pending order with it.");
  return { discount, coupon };
}

export async function reserveCoupon(coupon, user, orderId, session) {
  if (!coupon) return;
  const result = await Coupon.updateOne({ _id: coupon.id, active: true, $or: [{ maxUses: 0 }, { $expr: { $lt: ["$uses", "$maxUses"] } }] }, { $inc: { uses: 1 } }, { session });
  if (result.modifiedCount !== 1) throw bad("This coupon has reached its usage limit.", 409);
  try { await CouponUse.create([{ coupon: coupon.id, user, order: orderId }], { session }); }
  catch (error) { if (error.code === 11000) throw bad("You have already used this coupon.", 409); throw error; }
}
export async function releaseCoupon(order, session) {
  if (!order.couponCommitted || !order.coupon) return;
  await CouponUse.deleteOne({ coupon: order.coupon, order: order.id }, { session });
  await Coupon.updateOne({ _id: order.coupon, uses: { $gt: 0 } }, { $inc: { uses: -1 } }, { session });
  order.couponCommitted = false;
}
export async function changeStock(item, delta, { session, actor, reason, reference } = {}) {
  const filter = { _id: item.product };
  const updates = { stock: delta };
  if (delta < 0) filter.stock = { $gte: -delta };
  if (item.variantSku) { filter.variants = { $elemMatch: { sku: item.variantSku, ...(delta < 0 ? { stock: { $gte: -delta } } : {}) } }; updates["variants.$.stock"] = delta; }
  const result = await Product.updateOne(filter, { $inc: updates }, { session });
  if (result.modifiedCount !== 1) throw bad("Stock changed or this product option is unavailable. Please refresh.", 409);
  await StockMovement.create([{ product: item.product, variantSku: item.variantSku || "", delta, actor, reason: reason || "Order stock movement", reference }], { session });
}
export async function markCartConverted(user, session) { await CartState.updateOne({ user }, { $set: { convertedAt: new Date() } }, { session }); }
export async function expirePendingOrders() {
  const orders = await Order.find({ status: "awaiting_payment", createdAt: { $lt: new Date(Date.now() - 30 * 60000) } }).limit(20).select("_id").lean();
  for (const pending of orders) {
    const session = await mongoose.startSession();
    try { await session.withTransaction(async () => { const order = await Order.findOne({ _id: pending._id, status: "awaiting_payment" }).session(session); if (!order) return; await releaseCoupon(order, session); order.status = "cancelled"; await order.save({ session }); }); }
    finally { await session.endSession(); }
  }
}
