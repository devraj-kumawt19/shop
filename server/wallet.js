import { Router } from "express";
import mongoose from "mongoose";
import rateLimit from "express-rate-limit";
import { Wallet, WalletEntry, WalletTopup } from "./models.js";
import { getStoreSettings, auditAdminChanges } from "./superAdmin.js";
import { requireDatabase } from "./database.js";
import { requireSuperAdmin } from "./adminPolicy.js";
import { bad } from "./commercePolicy.js";
import { validSignature } from "./paymentPolicy.js";
import { gateway, paymentsConfigured } from "./gateway.js";

export const validRequestKey = (key) => typeof key === "string" && /^[a-zA-Z0-9_-]{16,80}$/.test(key);
export function topupMinor(amount) {
  const minor = Math.round(amount * 100);
  if (typeof amount !== "number" || !Number.isFinite(amount) || Math.abs(amount * 100 - minor) > .00001 || minor < 10000 || minor > 1000000) throw bad("Add an amount between ₹100 and ₹10,000 with up to two decimals.");
  return minor;
}
export async function ensureWallet(user) {
  await Promise.all([Wallet.init(), WalletEntry.init(), WalletTopup.init()]);
  try { await Wallet.updateOne({ user }, { $setOnInsert: { user, currency: "INR", balanceMinor: 0 } }, { upsert: true }); }
  catch (error) { if (error.code !== 11000) throw error; }
  return Wallet.findOne({ user }).lean();
}
export async function changeWallet({ user, amountMinor, key, kind, description, order, topup }, session) {
  if (!session || !Number.isSafeInteger(amountMinor) || amountMinor === 0) throw bad("A valid wallet transaction is required.");
  const existing = await WalletEntry.findOne({ key }).session(session);
  if (existing) {
    if (String(existing.user) !== String(user) || existing.amountMinor !== amountMinor || existing.kind !== kind) throw bad("Wallet transaction does not match its original request.", 409);
    return existing;
  }
  const wallet = await Wallet.findOneAndUpdate({ user, currency: "INR", balanceMinor: amountMinor < 0 ? { $gte: -amountMinor } : { $lte: Number.MAX_SAFE_INTEGER - amountMinor } }, { $inc: { balanceMinor: amountMinor } }, { session, returnDocument: "after", runValidators: true });
  if (!wallet) throw bad(amountMinor < 0 ? "Your wallet balance is too low. Add money or choose another payment method." : "Wallet could not be credited. Please contact support.", 409);
  const [entry] = await WalletEntry.create([{ key, user, amountMinor, balanceAfterMinor: wallet.balanceMinor, kind, description, order, topup, currency: "INR" }], { session });
  return entry;
}
export async function refundWalletOrder(order, session) {
  if (order.paymentMethod !== "wallet" || order.paymentStatus !== "paid") return;
  if (order.total > 0) await changeWallet({ user: order.user, amountMinor: Math.round(order.total * 100), key: `refund/${order.id}`, kind: "refund", description: `Refund for ${order.orderNumber}`, order: order.id }, session);
  order.paymentStatus = "refunded";
}
export async function finalizeTopup(payment) {
  const session = await mongoose.startSession(); let topup;
  try { await session.withTransaction(async () => {
    topup = await WalletTopup.findOne({ gatewayOrderId: payment.order_id }).session(session);
    if (!topup || payment.status !== "captured" || !/^pay_[a-zA-Z0-9]+$/.test(payment.id || "") || payment.amount !== topup.amountMinor || payment.currency !== "INR") throw bad("Top-up payment amount, currency or order does not match.");
    if (topup.status === "paid") { if (topup.gatewayPaymentId !== payment.id) throw bad("A different payment is already recorded for this top-up.", 409); return; }
    await changeWallet({ user: topup.user, amountMinor: topup.amountMinor, key: `topup/${topup.id}`, kind: "topup", description: "Money added with Razorpay", topup: topup.id }, session);
    topup.status = "paid"; topup.gatewayPaymentId = payment.id; topup.paidAt = new Date(); await topup.save({ session });
  }); } finally { await session.endSession(); }
  return topup;
}
const route = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
export function createWalletRouter(authenticate) {
  const router = Router();
  router.get("/wallet", requireDatabase, authenticate, route(async (req, res) => {
    const settings = await getStoreSettings();
    const [wallet, transactions, pending] = await Promise.all([ensureWallet(req.user.id), WalletEntry.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(100).lean(), WalletTopup.find({ user: req.user.id, status: "pending", gatewayOrderId: { $exists: true } }).sort({ createdAt: -1 }).limit(10).select("amountMinor gatewayOrderId createdAt").lean()]);
    res.json({ wallet, transactions, pending, enabled: settings.walletEnabled && settings.currency === "INR", topupsEnabled: settings.walletEnabled && settings.currency === "INR" && settings.onlinePaymentsEnabled && paymentsConfigured() });
  }));
  router.post("/wallet/topups", requireDatabase, authenticate, rateLimit({ windowMs: 60000, limit: 6, standardHeaders: "draft-7", legacyHeaders: false, message: { message: "Please wait a minute before preparing another top-up." } }), route(async (req, res) => {
    const amountMinor = topupMinor(req.body.amount);
    if (!validRequestKey(req.body.requestKey)) throw bad("A valid top-up request key is required.");
    const settings = await getStoreSettings();
    if (!settings.walletEnabled || settings.currency !== "INR" || !settings.onlinePaymentsEnabled || !paymentsConfigured()) throw bad("Wallet top-ups are unavailable until INR online payments are configured.", 503);
    await ensureWallet(req.user.id);
    let topup = await WalletTopup.findOneAndUpdate({ user: req.user.id, requestKey: req.body.requestKey }, { $setOnInsert: { user: req.user.id, requestKey: req.body.requestKey, amountMinor, currency: "INR" } }, { upsert: true, returnDocument: "after", runValidators: true });
    if (topup.amountMinor !== amountMinor) throw bad("This request already belongs to a different top-up amount.", 409);
    if (topup.status === "paid") return res.json({ paid: true, topup });
    if (!topup.gatewayOrderId) {
      const lease = new Date();
      const claimed = await WalletTopup.findOneAndUpdate({ _id: topup.id, gatewayOrderId: { $exists: false }, $or: [{ paymentCreatingAt: { $exists: false } }, { paymentCreatingAt: { $lt: new Date(Date.now() - 60000) } }] }, { $set: { paymentCreatingAt: lease } }, { returnDocument: "after" });
      if (!claimed) throw bad("A top-up session is already being prepared. Please retry shortly.", 409);
      try {
        const created = await gateway("orders", { amount: amountMinor, currency: "INR", receipt: `wallet_${topup.id}`, notes: { walletTopupId: topup.id } });
        if (!/^order_[a-zA-Z0-9]+$/.test(created.id || "") || created.amount !== amountMinor || created.currency !== "INR") throw bad("Payment session does not match the wallet top-up.", 502);
        const result = await WalletTopup.updateOne({ _id: topup.id, paymentCreatingAt: lease }, { $set: { gatewayOrderId: created.id }, $unset: { paymentCreatingAt: 1 } });
        if (result.modifiedCount !== 1) throw bad("The top-up session changed. Reload your wallet before retrying.", 409);
        topup.gatewayOrderId = created.id;
      } catch (error) { await WalletTopup.updateOne({ _id: topup.id, paymentCreatingAt: lease }, { $unset: { paymentCreatingAt: 1 } }); throw error; }
    }
    res.json({ id: topup.id, key: process.env.RAZORPAY_KEY_ID, gatewayOrderId: topup.gatewayOrderId, amount: topup.amountMinor, currency: "INR", name: settings.siteName, prefill: { name: req.user.name, email: req.user.email } });
  }));
  router.post("/wallet/topups/:id/verify", requireDatabase, authenticate, route(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw bad("Top-up not found.", 404);
    const topup = await WalletTopup.findOne({ _id: req.params.id, user: req.user.id });
    if (!topup?.gatewayOrderId) throw bad("Top-up not found.", 404);
    const { razorpay_payment_id: paymentId, razorpay_order_id: gatewayOrderId, razorpay_signature: signature } = req.body || {};
    if (gatewayOrderId !== topup.gatewayOrderId || !/^pay_[a-zA-Z0-9]+$/.test(paymentId || "") || !validSignature(`${topup.gatewayOrderId}|${paymentId}`, signature, process.env.RAZORPAY_KEY_SECRET)) throw bad("Top-up payment verification failed.");
    const payment = await gateway(`payments/${paymentId}`);
    res.json({ topup: await finalizeTopup(payment), wallet: await Wallet.findOne({ user: req.user.id }).lean() });
  }));
  router.post("/wallet/topups/:id/reconcile", requireDatabase, authenticate, route(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw bad("Top-up not found.", 404);
    const topup = await WalletTopup.findOne({ _id: req.params.id, user: req.user.id }); if (!topup?.gatewayOrderId) throw bad("Top-up not found.", 404);
    if (topup.status !== "paid") {
      const payments = await gateway(`orders/${topup.gatewayOrderId}/payments`);
      const captured = payments.items?.find((p) => p.status === "captured" && p.order_id === topup.gatewayOrderId && p.amount === topup.amountMinor && p.currency === "INR");
      if (!captured) throw bad("No captured payment was found for this top-up yet.", 409);
      await finalizeTopup(captured);
    }
    res.json({ wallet: await Wallet.findOne({ user: req.user.id }).lean() });
  }));
  router.get("/super-admin/wallet", requireDatabase, authenticate, requireSuperAdmin, auditAdminChanges, route(async (req, res) => {
    const [totals, transactions] = await Promise.all([Wallet.aggregate([{ $group: { _id: null, balanceMinor: { $sum: "$balanceMinor" }, accounts: { $sum: 1 } } }]), WalletEntry.find().sort({ createdAt: -1 }).limit(100).populate("user", "name email").lean()]);
    res.json({ totals: totals[0] || { balanceMinor: 0, accounts: 0 }, transactions });
  }));
  return router;
}
