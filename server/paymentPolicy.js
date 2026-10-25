import { createHmac, timingSafeEqual } from "node:crypto";

export const minorUnits = (amount) => Math.round(Number(amount) * 100);
export function validSignature(value, signature, secret) {
  if (!secret || typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(value).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
export function matchesCapturedPayment(order, payment) {
  return payment?.status === "captured" && /^pay_[a-zA-Z0-9]+$/.test(payment.id || "")
    && payment.order_id === order.gatewayOrderId && payment.currency === (order.currency || "USD")
    && payment.amount === minorUnits(order.total);
}
