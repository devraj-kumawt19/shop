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
  isDemo: { type: Boolean, default: false },
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
  shipping: { type: Number, required: true },
  total: { type: Number, required: true },
  currency: { type: String, enum: ["USD", "INR"], default: "USD" },
  paymentMethod: { type: String, enum: ["cash_on_delivery", "razorpay"], default: "cash_on_delivery" },
  paymentStatus: { type: String, enum: ["pending", "paid", "refund_required"], default: "pending" },
  gatewayOrderId: { type: String, unique: true, sparse: true },
  gatewayPaymentId: { type: String, unique: true, sparse: true },
  paymentCreatingAt: Date,
  paidAt: Date,
  inventoryCommitted: { type: Boolean, default: true },
  containsDemoProducts: { type: Boolean, default: false },
  emailStatus: { customer: { type: String, default: "not_queued" }, owner: { type: String, default: "not_queued" } },
  status: { type: String, enum: ["awaiting_payment", "placed", "processing", "shipped", "delivered", "cancelled"], default: "placed" },
}, { timestamps: true });

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
  key: { type: String, required: true, unique: true }, order: { type: Schema.Types.ObjectId, ref: "Order", required: true },
  kind: { type: String, enum: ["customer", "owner"], required: true }, payload: { type: Schema.Types.Mixed, required: true },
  status: { type: String, enum: ["pending", "sent", "failed"], default: "pending" }, attempts: { type: Number, default: 0 },
  nextAttempt: { type: Date, default: Date.now }, lockedUntil: { type: Date, default: () => new Date(0) }, lastError: String,
}, { timestamps: true });
notificationSchema.index({ status: 1, nextAttempt: 1, lockedUntil: 1 });
export const Notification = mongoose.models.Notification || model("Notification", notificationSchema);
