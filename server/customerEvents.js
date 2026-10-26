import { Inbox, ProductAlert, Notification } from "./models.js";
import { formatMoney } from "./storeSettings.js";
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

export async function queueMessage({ key, user, email, title, message, href, order, owner = false, session }) {
  const options = { upsert: true, ...(session ? { session } : {}) };
  if (user) await Inbox.updateOne({ key }, { $setOnInsert: { key, user, title, message, href } }, options);
  if (email) await Notification.updateOne({ key }, { $setOnInsert: { key, order, kind: owner ? "owner" : "customer", payload: { to: [email], subject: title.replace(/[\r\n]/g, " "), text: message, html: `<div style="font-family:Arial,sans-serif;max-width:560px;padding:28px;color:#172b4d"><h2>${escape(title)}</h2><p>${escape(message)}</p><p>Open your account on the store website for details.</p></div>` } } }, options);
}
export async function queueOrderUpdate(order, session) {
  const status = String(order.status).replaceAll("_", " ");
  const revision = new Date(order.updatedAt || Date.now()).getTime();
  await queueMessage({ key: `order-update/${order.id}/${revision}`, user: order.user, email: order.shippingAddress.email, title: `Order ${order.orderNumber}: ${status}`, message: `Your order is now ${status}.${order.tracking?.carrier ? ` Courier: ${order.tracking.carrier}. Tracking: ${order.tracking.awb || "pending"}.` : ""}`, href: `/my-orders/${order.id}`, order: order.id, session });
}
export async function notifyProductChange(before, after, settings, session) {
  const options = session ? { session } : {};
  if ((before.stock < 1 && after.stock > 0) || after.price < before.price) {
    let query = ProductAlert.find({ product: after._id, active: true, currency: settings.currency }).populate("user", "email isActive"); if (session) query = query.session(session);
    const alerts = await query;
    for (const alert of alerts) {
      if (!alert.user || alert.user.isActive === false) continue;
      const triggered = alert.type === "stock" ? before.stock < 1 && after.stock > 0 : after.price < before.price && after.price <= alert.targetPrice;
      if (!triggered) continue;
      const title = alert.type === "stock" ? `${after.name} is back in stock` : `Price drop: ${after.name}`;
      await queueMessage({ key: `product-alert/${alert.id}/${new Date(after.updatedAt || Date.now()).getTime()}`, user: alert.user._id, email: alert.user.email, title, message: `${after.name} is available at ${formatMoney(after.price, settings.currency)}. Availability and price can change before checkout.`, href: `/products/${after.id || after._id}`, session });
      alert.active = false; await alert.save(options);
    }
  }
  if (before.stock > settings.lowStockThreshold && after.stock <= settings.lowStockThreshold && process.env.ORDER_NOTIFICATION_EMAIL) await queueMessage({ key: `low-stock/${after._id}/${new Date(after.updatedAt || Date.now()).getTime()}`, email: process.env.ORDER_NOTIFICATION_EMAIL, owner: true, title: `Low stock: ${after.name}`, message: `${after.name} has ${after.stock} units remaining. Review inventory in the store management panel.`, session });
}
