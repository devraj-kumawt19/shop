import { bad } from "./commercePolicy.js";
export const paymentsConfigured = () => Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_WEBHOOK_SECRET);
export async function gateway(path, body) {
  const response = await fetch(`https://api.razorpay.com/v1/${path}`, {
    method: body ? "POST" : "GET", signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64")}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw bad("The payment service could not complete the request. Please try again.", 502);
  return response.json();
}
