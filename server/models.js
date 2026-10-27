import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { defaultStoreSettings } from "./storeSettings.js";

const { Schema, model } = mongoose;

const userSchema = new Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 8, select: false },
  role: { type: String, enum: ["customer", "admin", "superadmin"], default: "customer" },
  isActive: { type: Boolean, default: true },
  permissions: { type: [String], enum: ["catalog", "inventory", "orders", "reviews", "reports", "support"], default: undefined },
  profileImage: { type: String, default: "", maxlength: 245800 },
}, { timestamps: true });

userSchema.pre("save", async function hashPassword() {
  if (this.isModified("password")) this.password = await bcrypt.hash(this.password, 12);
});
userSchema.methods.checkPassword = function checkPassword(password) {
  return bcrypt.compare(password, this.password);
};

const productSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 140 },
  category: { type: String, required: true, trim: true },
  categorySlug: { type: String, required: true, trim: true, lowercase: true },
  description: { type: String, required: true, maxlength: 2000 },
  image: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  compareAtPrice: { type: Number, default: 0, min: 0 },
  stock: { type: Number, default: 0, min: 0 },
  rating: { type: Number, default: 0, min: 0, max: 5 },
  reviewCount: { type: Number, default: 0, min: 0 },
  badge: { type: String, default: "", maxlength: 32 },
  featured: { type: Boolean, default: false },
  quickEligible: { type: Boolean, default: false },
  isDemo: { type: Boolean, default: false },
  variants: [{ sku: { type: String, required: true }, size: String, color: String, price: { type: Number, required: true, min: 0 }, stock: { type: Number, required: true, min: 0 } }],
}, { timestamps: true });
productSchema.index({ name: "text", description: "text", category: "text" });

const categorySchema = new Schema({
  name: { type: String, required: true, trim: true, unique: true, maxlength: 80 },
  slug: { type: String, required: true, trim: true, lowercase: true, unique: true, maxlength: 80 },
  description: { type: String, default: "", maxlength: 500 },
  image: { type: String, default: "" },
}, { timestamps: true });

const orderItemSchema = new Schema({
  product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
  name: { type: String, required: true },
  image: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true, min: 0 },
  variantSku: { type: String, default: "" },
  variantLabel: { type: String, default: "" },
}, { _id: false });

const orderSchema = new Schema({
  orderNumber: { type: String, required: true, unique: true },
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  items: { type: [orderItemSchema], required: true },
  shippingAddress: {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true },
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    postalCode: { type: String, required: true },
    phone: { type: String, required: true },
  },
  subtotal: { type: Number, required: true },
  discount: { type: Number, default: 0, min: 0 },
  couponCode: { type: String, default: "" },
  coupon: { type: Schema.Types.ObjectId, ref: "Coupon" },
  couponCommitted: { type: Boolean, default: false },
  shipping: { type: Number, required: true },
  total: { type: Number, required: true },
  currency: { type: String, enum: ["USD", "INR"], default: "USD" },
  paymentMethod: { type: String, enum: ["cash_on_delivery", "razorpay", "wallet"], default: "cash_on_delivery" },
  paymentStatus: { type: String, enum: ["pending", "paid", "refund_required", "refunded"], default: "pending" },
  checkoutKey: { type: String },
  deliveryMethod: { type: String, enum: ["standard", "express15"], default: "standard" },
  estimatedDeliveryAt: Date,
  gatewayOrderId: { type: String, unique: true, sparse: true },
  gatewayPaymentId: { type: String, unique: true, sparse: true },
  paymentCreatingAt: Date,
  paidAt: Date,
  inventoryCommitted: { type: Boolean, default: true },
  containsDemoProducts: { type: Boolean, default: false },
  emailStatus: { customer: { type: String, default: "not_queued" }, owner: { type: String, default: "not_queued" } },
  tracking: { carrier: String, awb: String, url: String, eta: Date, providerStatus: String, syncedAt: Date },
  timeline: [{ status: String, message: String, location: String, at: { type: Date, default: Date.now } }],
  status: { type: String, enum: ["awaiting_payment", "placed", "processing", "shipped", "delivered", "cancelled"], default: "placed" },
}, { timestamps: true });
orderSchema.index({ user: 1, checkoutKey: 1 }, { unique: true, partialFilterExpression: { checkoutKey: { $type: "string" } } });

export const User = mongoose.models.User || model("User", userSchema);
export const Product = mongoose.models.Product || model("Product", productSchema);
export const Category = mongoose.models.Category || model("Category", categorySchema);
export const Order = mongoose.models.Order || model("Order", orderSchema);

const settingFields = Object.fromEntries(Object.entries(defaultStoreSettings).map(([key, value]) => [key, {
  type: typeof value === "number" ? Number : typeof value === "boolean" ? Boolean : String,
  default: value,
}]));
const settingsSchema = new Schema({ _id: { type: String, default: "store" }, ...settingFields }, { timestamps: true });
const auditSchema = new Schema({
  actor: { type: Schema.Types.ObjectId, ref: "User", required: true },
  action: { type: String, required: true },
  resource: { type: String, required: true },
}, { timestamps: true });
auditSchema.index({ createdAt: -1 });
export const StoreSettings = mongoose.models.StoreSettings || model("StoreSettings", settingsSchema);
export const AuditLog = mongoose.models.AuditLog || model("AuditLog", auditSchema);

const notificationSchema = new Schema({
  key: { type: String, required: true, unique: true }, order: { type: Schema.Types.ObjectId, ref: "Order" },
  kind: { type: String, enum: ["customer", "owner"], required: true }, payload: { type: Schema.Types.Mixed, required: true },
  status: { type: String, enum: ["pending", "sent", "failed"], default: "pending" }, attempts: { type: Number, default: 0 },
  nextAttempt: { type: Date, default: Date.now }, lockedUntil: { type: Date, default: () => new Date(0) }, lastError: String,
}, { timestamps: true });
notificationSchema.index({ status: 1, nextAttempt: 1, lockedUntil: 1 });
export const Notification = mongoose.models.Notification || model("Notification", notificationSchema);

const couponSchema = new Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  type: { type: String, enum: ["percent", "fixed"], required: true }, amount: { type: Number, required: true, min: 0 },
  currency: { type: String, enum: ["USD", "INR"], default: "USD" }, minimum: { type: Number, default: 0, min: 0 },
  maximumDiscount: { type: Number, default: 0, min: 0 }, maxUses: { type: Number, default: 0, min: 0 },
  uses: { type: Number, default: 0, min: 0 }, startsAt: Date, expiresAt: Date, active: { type: Boolean, default: true },
}, { timestamps: true });
const couponUseSchema = new Schema({ coupon: { type: Schema.Types.ObjectId, ref: "Coupon", required: true }, user: { type: Schema.Types.ObjectId, ref: "User", required: true }, order: { type: Schema.Types.ObjectId, ref: "Order", required: true } }, { timestamps: true });
couponUseSchema.index({ coupon: 1, user: 1 }, { unique: true });
const movementSchema = new Schema({ product: { type: Schema.Types.ObjectId, ref: "Product", required: true }, variantSku: { type: String, default: "" }, delta: { type: Number, required: true }, reason: { type: String, required: true, maxlength: 200 }, actor: { type: Schema.Types.ObjectId, ref: "User" }, reference: String }, { timestamps: true });
movementSchema.index({ product: 1, createdAt: -1 });
const reviewSchema = new Schema({ product: { type: Schema.Types.ObjectId, ref: "Product", required: true }, user: { type: Schema.Types.ObjectId, ref: "User", required: true }, order: { type: Schema.Types.ObjectId, ref: "Order", required: true }, rating: { type: Number, required: true, min: 1, max: 5 }, title: { type: String, maxlength: 100 }, text: { type: String, required: true, maxlength: 2000 }, photos: { type: [String], default: [] }, published: { type: Boolean, default: true } }, { timestamps: true });
reviewSchema.index({ product: 1, user: 1 }, { unique: true });
const alertSchema = new Schema({ user: { type: Schema.Types.ObjectId, ref: "User", required: true }, product: { type: Schema.Types.ObjectId, ref: "Product", required: true }, type: { type: String, enum: ["stock", "price"], required: true }, targetPrice: Number, currency: { type: String, default: "USD" }, active: { type: Boolean, default: true } }, { timestamps: true });
alertSchema.index({ user: 1, product: 1, type: 1 }, { unique: true });
const inboxSchema = new Schema({ user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true }, key: { type: String, unique: true, required: true }, title: String, message: String, href: String, readAt: Date }, { timestamps: true });
const cartSchema = new Schema({ user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true }, items: [orderItemSchema], subtotal: Number, currency: String, convertedAt: Date }, { timestamps: true });
export const Coupon = mongoose.models.Coupon || model("Coupon", couponSchema);
export const CouponUse = mongoose.models.CouponUse || model("CouponUse", couponUseSchema);
export const StockMovement = mongoose.models.StockMovement || model("StockMovement", movementSchema);
export const Review = mongoose.models.Review || model("Review", reviewSchema);
export const ProductAlert = mongoose.models.ProductAlert || model("ProductAlert", alertSchema);
export const Inbox = mongoose.models.Inbox || model("Inbox", inboxSchema);
export const CartState = mongoose.models.CartState || model("CartState", cartSchema);

const walletSchema = new Schema({ user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true }, currency: { type: String, enum: ["INR"], default: "INR" }, balanceMinor: { type: Number, default: 0, min: 0, max: Number.MAX_SAFE_INTEGER } }, { timestamps: true });
const walletEntrySchema = new Schema({ key: { type: String, required: true, unique: true }, user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true }, amountMinor: { type: Number, required: true }, balanceAfterMinor: { type: Number, required: true, min: 0 }, kind: { type: String, enum: ["topup", "purchase", "refund"], required: true }, description: String, order: { type: Schema.Types.ObjectId, ref: "Order" }, topup: { type: Schema.Types.ObjectId, ref: "WalletTopup" }, currency: { type: String, default: "INR" } }, { timestamps: true });
walletEntrySchema.index({ user: 1, createdAt: -1 });
const topupSchema = new Schema({ user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true }, amountMinor: { type: Number, required: true }, currency: { type: String, enum: ["INR"], default: "INR" }, requestKey: { type: String, required: true }, gatewayOrderId: { type: String, unique: true, sparse: true }, gatewayPaymentId: { type: String, unique: true, sparse: true }, paymentCreatingAt: Date, status: { type: String, enum: ["pending", "paid"], default: "pending" }, paidAt: Date }, { timestamps: true });
topupSchema.index({ user: 1, requestKey: 1 }, { unique: true });
export const Wallet = mongoose.models.Wallet || model("Wallet", walletSchema);
export const WalletEntry = mongoose.models.WalletEntry || model("WalletEntry", walletEntrySchema);
export const WalletTopup = mongoose.models.WalletTopup || model("WalletTopup", topupSchema);
