import { Router } from "express";
import mongoose from "mongoose";
import { changeStock, markCartConverted, releaseCoupon } from "../orderLogic.js";
import { Order, Product } from "../db/models.js";
import { getStoreSettings } from "../super-admin/routes/superAdminRoutes.js";
import { enqueueOrderEmails } from "../notifications.js";
import { matchesCapturedPayment, minorUnits, validSignature } from "../paymentPolicy.js";
import { paymentWindowOpen } from "../commercePolicy.js";
import { notifyProductChange } from "../customerEvents.js";

export { paymentsConfigured } from "../gateway.js";
import { paymentsConfigured, gateway } from "../gateway.js";
import { WalletTopup } from "../db/models.js";
import { finalizeTopup } from "./wallet.js";
import { deliveryQuote } from "../quickPolicy.js";
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const route = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);

export async function finalizePayment(payment) {
  const session = await mongoose.startSession();
  let order;
  try {
    await session.withTransaction(async () => {
      order = await Order.findOne({ gatewayOrderId: payment.order_id }).session(session);
      if (!order || !matchesCapturedPayment(order, payment)) throw fail("Payment amount, currency or order does not match.");
      if (["paid", "refund_required"].includes(order.paymentStatus)) {
        if (order.gatewayPaymentId !== payment.id) throw fail("A different payment is already recorded for this order.", 409);
        return;
      }
      const products = await Product.find({ _id: { $in: order.items.map((item) => item.product) } }).session(session).lean();
      let deliveryAvailable = true;
      if (order.deliveryMethod === "express15") { try { deliveryQuote("express15", order.shippingAddress.postalCode, products, await getStoreSettings()); } catch { deliveryAvailable = false; } }
      const enoughStock = deliveryAvailable && order.status === "awaiting_payment" && paymentWindowOpen(order) && order.items.every((item) => products.some((product) => String(product._id) === String(item.product) && (item.variantSku ? product.variants?.find((variant) => variant.sku === item.variantSku)?.stock ?? 0 : product.stock) >= item.quantity));
      if (enoughStock) {
        for (const item of order.items) {
          await changeStock(item, -item.quantity, { session, reason: "Online payment captured", reference: order.id });
          const product = products.find((p) => String(p._id) === String(item.product));
          const before = { ...product }; product.stock -= item.quantity;
          await notifyProductChange(before, product, await getStoreSettings(), session);
        }
        order.inventoryCommitted = true;
        order.paymentStatus = "paid";
        order.status = "placed";
        if (order.deliveryMethod === "express15") order.estimatedDeliveryAt = new Date(Date.now() + 15 * 60000);
        await markCartConverted(order.user, session);
      } else {
        order.paymentStatus = "refund_required";
        order.status = "cancelled";
        order.inventoryCommitted = false;
        await releaseCoupon(order, session);
      }
      order.gatewayPaymentId = payment.id;
      order.paidAt = new Date();
      await order.save({ session });
      await enqueueOrderEmails(order, await getStoreSettings(), session);
    });
  } finally { await session.endSession(); }
  return order;
}

export async function razorpayWebhook(req, res, next) {
  try {
    if (!Buffer.isBuffer(req.body) || !validSignature(req.body, req.headers["x-razorpay-signature"], process.env.RAZORPAY_WEBHOOK_SECRET)) return res.status(400).json({ message: "Invalid webhook signature." });
    const event = JSON.parse(req.body.toString("utf8"));
    if (event.event === "payment.captured") {
      const payment = event.payload?.payment?.entity;
      if (!payment || !/^pay_[a-zA-Z0-9]+$/.test(payment.id || "") || !payment.order_id) return res.status(400).json({ message: "Invalid payment event." });
      // Unknown provider orders may belong to another application on this merchant account.
      if (await Order.exists({ gatewayOrderId: payment.order_id })) await finalizePayment(await gateway(`payments/${payment.id}`));
      else if (await WalletTopup.exists({ gatewayOrderId: payment.order_id })) await finalizeTopup(await gateway(`payments/${payment.id}`));
    }
    return res.json({ received: true });
  } catch (error) { return next(error); }
}

export function createPaymentsRouter(authenticate) {
  const router = Router();
  router.get("/config", route(async (req, res) => {
    const settings = await getStoreSettings();
    res.json({ enabled: settings.onlinePaymentsEnabled && paymentsConfigured(), currency: settings.currency, cashOnDelivery: true });
  }));
  router.use(authenticate);
  router.post("/orders/:id", route(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw fail("Order not found.", 404);
    const order = await Order.findOne({ _id: req.params.id, user: req.user.id });
    if (!order) throw fail("Order not found.", 404);
    if (order.paymentMethod !== "razorpay") throw fail("This order uses cash on delivery.");
    if (order.containsDemoProducts && process.env.RAZORPAY_KEY_ID?.startsWith("rzp_live_")) throw fail("Sample orders can only use test payments. Place a new order with real products for live checkout.");
    if (order.paymentStatus === "paid") return res.json({ paid: true, order });
    const settings = await getStoreSettings();
    if (!settings.checkoutEnabled || !settings.onlinePaymentsEnabled || !paymentsConfigured()) throw fail("Online payments are currently unavailable.", 503);
    if (order.status !== "awaiting_payment") throw fail("This order cannot accept payment.", 409);
    if (!paymentWindowOpen(order)) throw fail("This payment session has expired. Place a new order from your bag.", 409);
    let gatewayOrderId = order.gatewayOrderId;
    if (!gatewayOrderId) {
      const lease = new Date();
      const claimed = await Order.findOneAndUpdate({ _id: order.id, gatewayOrderId: { $exists: false }, $or: [{ paymentCreatingAt: { $exists: false } }, { paymentCreatingAt: { $lt: new Date(Date.now() - 60000) } }] }, { $set: { paymentCreatingAt: lease } }, { returnDocument: "after" });
      if (!claimed) throw fail("A payment session is already being prepared. Please retry shortly.", 409);
      try {
        const created = await gateway("orders", { amount: minorUnits(order.total), currency: order.currency, receipt: order.orderNumber, notes: { storeOrderId: order.id } });
        if (!/^order_[a-zA-Z0-9]+$/.test(created.id || "") || created.amount !== minorUnits(order.total) || created.currency !== order.currency) throw fail("Payment session did not match the order.", 502);
        gatewayOrderId = created.id;
        const saved = await Order.updateOne({ _id: order.id, paymentCreatingAt: lease }, { $set: { gatewayOrderId }, $unset: { paymentCreatingAt: 1 } });
        if (saved.modifiedCount !== 1) throw fail("Payment session changed. Please reload your order before paying.", 409);
      } catch (error) {
        await Order.updateOne({ _id: order.id, paymentCreatingAt: lease }, { $unset: { paymentCreatingAt: 1 } });
        throw error;
      }
    }
    return res.json({ key: process.env.RAZORPAY_KEY_ID, amount: minorUnits(order.total), currency: order.currency, gatewayOrderId, name: settings.siteName, prefill: { name: `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`, email: order.shippingAddress.email, contact: order.shippingAddress.phone } });
  }));
  router.post("/orders/:id/verify", route(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw fail("Order not found.", 404);
    const order = await Order.findOne({ _id: req.params.id, user: req.user.id });
    if (!order || order.paymentMethod !== "razorpay" || !order.gatewayOrderId) throw fail("Payment order not found.", 404);
    const { razorpay_payment_id: paymentId, razorpay_order_id: gatewayOrderId, razorpay_signature: signature } = req.body || {};
    if (gatewayOrderId !== order.gatewayOrderId || typeof paymentId !== "string" || !/^pay_[a-zA-Z0-9]+$/.test(paymentId) || !validSignature(`${order.gatewayOrderId}|${paymentId}`, signature, process.env.RAZORPAY_KEY_SECRET)) throw fail("Payment verification failed. No order has been confirmed.");
    const payment = await gateway(`payments/${paymentId}`);
    if (payment.status !== "captured") throw fail("Payment is not captured yet. Please check your order again shortly.", 409);
    return res.json({ order: await finalizePayment(payment) });
  }));
  return router;
}
