import api from "./api.js";

let checkoutScript;
export function loadCheckout() {
  if (window.Razorpay) return Promise.resolve();
  if (!checkoutScript) checkoutScript = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    const timeout = setTimeout(() => { script.remove(); checkoutScript = null; reject(new Error("Payment checkout took too long to load. Please retry.")); }, 20000);
    script.onload = () => { clearTimeout(timeout); if (window.Razorpay) resolve(); else { checkoutScript = null; reject(new Error("Payment checkout could not load.")); } };
    script.onerror = () => { clearTimeout(timeout); script.remove(); checkoutScript = null; reject(new Error("Payment checkout could not load. Check your connection and retry.")); };
    document.head.appendChild(script);
  });
  return checkoutScript;
}

export async function topUpWallet(amount, requestKey) {
  const { data } = await api.post("/wallet/topups", { amount, requestKey });
  if (data.paid) return data;
  await loadCheckout();
  return new Promise((resolve, reject) => {
    let verifying = false;
    const checkout = new window.Razorpay({ key: data.key, amount: data.amount, currency: data.currency, name: data.name, description: "Add money to Shop Wallet", order_id: data.gatewayOrderId, prefill: data.prefill, theme: { color: "#2563eb" },
      handler: async (response) => { verifying = true; try { resolve((await api.post(`/wallet/topups/${data.id}/verify`, response)).data); } catch (error) { reject(error); } },
      modal: { ondismiss: () => { if (!verifying) reject(new Error("Top-up was not completed. If money was debited, use Check payment in your wallet.")); } },
    }); checkout.open();
  });
}

export async function payForOrder(orderId) {
  const { data } = await api.post(`/payments/orders/${orderId}`);
  if (data.paid) return data.order;
  await loadCheckout();
  return new Promise((resolve, reject) => {
    let verifying = false;
    const checkout = new window.Razorpay({
      key: data.key, amount: data.amount, currency: data.currency, name: data.name,
      description: "Your ShopSphere order", order_id: data.gatewayOrderId, prefill: data.prefill,
      theme: { color: "#2563eb" },
      handler: async (response) => {
        verifying = true;
        try { const verified = await api.post(`/payments/orders/${orderId}/verify`, response); resolve(verified.data.order); }
        catch (error) { reject(error); }
      },
      modal: { ondismiss: () => { if (!verifying) reject(new Error("Payment was not completed. Your order is saved; you can retry payment here or from your orders.")); } },
    });
    checkout.open();
  });
}
