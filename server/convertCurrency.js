import mongoose from "mongoose";
import { Product, Coupon, ProductAlert, CartState, StoreSettings } from "./db/models.js";
import { toRupees, INR_RATE, INR_RATE_DATE } from "./currency.js";
import { defaultStoreSettings } from "./storeSettings.js";

export async function convertCatalogToInr() {
  const session = await mongoose.startSession(); let result;
  try { await session.withTransaction(async () => {
    const stored = await StoreSettings.findById("store").session(session).lean();
    if (stored?.currency === "INR") { result = { changed: false, message: "The catalog already uses INR; no prices were converted again." }; return; }
    if (stored?.currency && stored.currency !== "USD") throw new Error("This migration only converts a USD catalog to INR.");
    const products = await Product.find().session(session).lean();
    for (const product of products) await Product.updateOne({ _id: product._id }, { $set: { price: toRupees(product.price), compareAtPrice: toRupees(product.compareAtPrice || 0), variants: (product.variants || []).map((v) => ({ ...v, price: toRupees(v.price) })) } }, { session });
    const coupons = await Coupon.find({ currency: "USD" }).session(session).lean();
    for (const coupon of coupons) await Coupon.updateOne({ _id: coupon._id }, { $set: { currency: "INR", amount: coupon.type === "fixed" ? toRupees(coupon.amount) : coupon.amount, minimum: toRupees(coupon.minimum || 0), maximumDiscount: toRupees(coupon.maximumDiscount || 0) } }, { session });
    const alerts = await ProductAlert.find({ currency: "USD" }).session(session).lean();
    for (const alert of alerts) await ProductAlert.updateOne({ _id: alert._id }, { $set: { currency: "INR", ...(alert.type === "price" ? { targetPrice: toRupees(alert.targetPrice) } : {}) } }, { session });
    const carts = await CartState.find({ currency: "USD" }).session(session).lean();
    for (const cart of carts) await CartState.updateOne({ _id: cart._id }, { $set: { currency: "INR", subtotal: toRupees(cart.subtotal), items: cart.items.map((item) => ({ ...item, price: toRupees(item.price) })) } }, { session });
    const shippingFee = toRupees(stored?.shippingFee ?? 6.95), freeShippingThreshold = toRupees(stored?.freeShippingThreshold ?? 75);
    const announcement = (stored?.announcement || "Thoughtful finds, priced in rupees.").replace(/\$([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/g, (_, value) => `₹${toRupees(Number(value.replaceAll(",", ""))).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);
    await StoreSettings.updateOne({ _id: "store" }, { $set: { currency: "INR", shippingFee, freeShippingThreshold, announcement }, $setOnInsert: Object.fromEntries(Object.entries(defaultStoreSettings).filter(([key]) => !["currency", "shippingFee", "freeShippingThreshold", "announcement"].includes(key))) }, { session, upsert: true, setDefaultsOnInsert: false });
    result = { changed: true, products: products.length, coupons: coupons.length, alerts: alerts.length, carts: carts.length, rate: INR_RATE, rateDate: INR_RATE_DATE, shippingFee, freeShippingThreshold };
  }); } finally { await session.endSession(); }
  return result;
}
