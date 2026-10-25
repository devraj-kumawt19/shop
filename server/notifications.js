import { Notification, Order } from "./models.js";
import { formatMoney } from "./storeSettings.js";

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
export function buildOrderEmail(order, settings, kind) {
  const refundRequired = order.paymentStatus === "refund_required";
  const headline = refundRequired ? "Your payment needs attention" : kind === "owner" ? "A new order just arrived" : "Your order is confirmed";
  const payment = order.paymentMethod === "razorpay" ? (refundRequired ? "Payment received; refund review required" : "Paid online") : "Cash on delivery — pay when your order arrives";
  const lines = order.items.map((item) => `${item.name} × ${item.quantity} — ${formatMoney(item.price * item.quantity, order.currency)}`);
  const text = `${settings.siteName}\n${headline}\nOrder: ${order.orderNumber}\n${lines.join("\n")}\nShipping: ${formatMoney(order.shipping, order.currency)}\nTotal: ${formatMoney(order.total, order.currency)}\n${payment}\nDeliver to: ${order.shippingAddress.firstName} ${order.shippingAddress.lastName}, ${order.shippingAddress.street}, ${order.shippingAddress.city}, ${order.shippingAddress.state} ${order.shippingAddress.postalCode}\n${refundRequired ? "We could not allocate stock for this payment. Contact the store for a refund; this order will not be fulfilled.\n" : ""}Questions? ${settings.supportEmail}`;
  return {
    from: process.env.RESEND_FROM,
    to: [kind === "owner" ? process.env.ORDER_NOTIFICATION_EMAIL : order.shippingAddress.email],
    subject: `${refundRequired ? "Payment review" : kind === "owner" ? "New order" : "Order confirmed"} ${order.orderNumber} | ${settings.siteName}`.replace(/[\r\n]/g, " "),
    text,
    html: `<div style="font-family:Arial,sans-serif;max-width:580px;margin:auto;color:#172b4d;padding:32px"><p style="color:#2563eb;font-weight:bold">${escapeHtml(settings.siteName)}</p><h1 style="font-size:25px">${escapeHtml(headline)}</h1><p>${escapeHtml(order.orderNumber)}</p><div style="padding:20px;background:#f3f7ff;border-radius:12px">${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}<hr style="border:0;border-top:1px solid #dce5f3"><p>Shipping: ${escapeHtml(formatMoney(order.shipping, order.currency))}</p><strong>Total: ${escapeHtml(formatMoney(order.total, order.currency))}</strong></div><p>${escapeHtml(payment)}</p>${refundRequired ? "<p>Stock could not be allocated. Please contact the store for a refund review.</p>" : "<p>We will take it from here. Thank you for shopping with us.</p>"}<p style="font-size:12px;color:#7b8aa2">${escapeHtml(settings.supportEmail)}</p></div>`,
  };
}

export function emailConfigured() { return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM); }

export async function enqueueOrderEmails(order, settings, session) {
  for (const kind of ["customer", "owner"]) {
    if (kind === "owner" && !process.env.ORDER_NOTIFICATION_EMAIL) continue;
    const key = `order-confirmation/${order.id}/${kind}`;
    const payload = buildOrderEmail(order, settings, kind);
    // Sender is filled when dispatching, so queued messages can survive initial missing configuration.
    delete payload.from;
    await Notification.updateOne({ key }, { $setOnInsert: { key, order: order.id, kind, payload } }, { upsert: true, ...(session ? { session } : {}) });
    await Order.updateOne({ _id: order.id, [`emailStatus.${kind}`]: { $ne: "sent" } }, { $set: { [`emailStatus.${kind}`]: "queued" } }, session ? { session } : {});
  }
}

export async function dispatchNotifications() {
  if (!emailConfigured()) return;
  for (let count = 0; count < 10; count++) {
    const now = new Date();
    const job = await Notification.findOneAndUpdate({ status: "pending", attempts: { $lt: 8 }, nextAttempt: { $lte: now }, lockedUntil: { $lte: now } }, { $set: { lockedUntil: new Date(Date.now() + 60000) }, $inc: { attempts: 1 } }, { new: true }).lean();
    if (!job) return;
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST", signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": job.key },
        body: JSON.stringify({ ...job.payload, from: process.env.RESEND_FROM }),
      });
      if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
      await Notification.updateOne({ _id: job._id }, { $set: { status: "sent", lockedUntil: new Date(0), lastError: "" } });
      await Order.updateOne({ _id: job.order }, { $set: { [`emailStatus.${job.kind}`]: "sent" } });
    } catch (error) {
      const failed = job.attempts >= 8;
      await Notification.updateOne({ _id: job._id }, { $set: { status: failed ? "failed" : "pending", lockedUntil: new Date(0), nextAttempt: new Date(Date.now() + Math.min(3600000, 30000 * 2 ** job.attempts)), lastError: error.name === "TimeoutError" ? "Email provider timed out" : "Email delivery failed" } });
      await Order.updateOne({ _id: job.order }, { $set: { [`emailStatus.${job.kind}`]: failed ? "failed" : "queued" } });
    }
  }
}

export function startNotificationWorker() {
  const run = () => dispatchNotifications().catch(() => console.error("Notification queue could not be processed."));
  run();
  const timer = setInterval(run, 15000);
  timer.unref();
  return timer;
}
