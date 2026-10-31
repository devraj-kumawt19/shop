import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Check, ChevronRight, CreditCard, LockKeyhole, PackageCheck, ShieldCheck, ShoppingBag, Truck, WalletCards, Zap } from "lucide-react";
import api, { getErrorMessage } from "./api.js";
import { StatusMessage } from "./components.jsx";
import { useMoney, useShop } from "./ShopContext.jsx";
import { shippingFor } from "../server/storeSettings.js";
import { payForOrder } from "./payment.js";

export default function CheckoutPage() {
  const { cart, user, setCart, setToast, settings } = useShop();
  const money = useMoney();
  const navigate = useNavigate();
  const location = useLocation();
  const checkoutRequest = useRef(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [method, setMethod] = useState("cash_on_delivery");
  const [onlineEnabled, setOnlineEnabled] = useState(false);
  const [pendingOrder, setPendingOrder] = useState(null);
  const [couponCode, setCouponCode] = useState("");
  const [coupon, setCoupon] = useState(null);
  const [applying, setApplying] = useState(false);
  const [wallet, setWallet] = useState(null);
  const [postalCode, setPostalCode] = useState(location.state?.postalCode || localStorage.getItem("luxecarts_delivery_pin") || "");
  const [deliveryMethod, setDeliveryMethod] = useState("standard");
  const [service, setService] = useState(null);
  const [checkingArea, setCheckingArea] = useState(false);
  const quickItems = cart.length > 0 && cart.every(({ product }) => product.quickEligible);
  const discount = pendingOrder?.discount ?? coupon?.discount ?? 0;
  const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const shipping = pendingOrder?.shipping ?? (deliveryMethod === "express15" ? settings.quickDeliveryFee : shippingFor(subtotal - discount, settings));
  const total = pendingOrder?.total ?? Math.round((subtotal - discount + shipping) * 100) / 100;
  useEffect(() => { if (user) api.get("/wallet").then(({ data }) => setWallet(data)).catch(() => {}); }, [user?.id]);
  useEffect(() => {
    setService(null); setDeliveryMethod("standard");
    if (!/^\d{6}$/.test(postalCode) || !quickItems) { setCheckingArea(false); return; }
    const controller = new AbortController(); setCheckingArea(true);
    const timer = setTimeout(() => api.get(`/delivery/check?postalCode=${postalCode}`, { signal: controller.signal }).then(({ data }) => { setService(data); if (data.available && location.state?.deliveryMethod === "express15") setDeliveryMethod("express15"); }).catch(() => {}).finally(() => { if (!controller.signal.aborted) setCheckingArea(false); }), 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [postalCode, quickItems]);
  useEffect(() => { setCoupon(null); }, [cart, settings.currency]);
  const preview = cart.some(({ product }) => String(product._id).startsWith("sphere-"));
  useEffect(() => { api.get("/payments/config").then(({ data }) => setOnlineEnabled(data.enabled)).catch(() => setOnlineEnabled(false)); }, []);
  if (!user) return <Navigate to="/login" state={{ from: "/checkout" }} replace />;
  if (!cart.length) return <Navigate to="/cart" replace />;
  if (!settings.checkoutEnabled) return <main id="main-content" className="page-width empty-state"><ShoppingBag size={35} /><h1>Orders are paused.</h1><p>We are temporarily not accepting new orders. Please check back soon.</p><Link to="/products" className="button button-dark">Keep browsing</Link></main>;

  async function applyCoupon() {
    setApplying(true); setError("");
    try { const { data } = await api.post("/coupons/quote", { code: couponCode, items: cart.map(({ product, quantity, variantSku }) => ({ product: product._id, quantity, variantSku })) }); setCoupon(data); }
    catch (error) { setCoupon(null); setError(getErrorMessage(error)); }
    finally { setApplying(false); }
  }

  async function submit(event) {
    event.preventDefault(); setLoading(true); setError("");
    const address = Object.fromEntries([...new FormData(event.currentTarget)].filter(([key]) => ["firstName", "lastName", "email", "street", "city", "state", "postalCode", "phone"].includes(key)));
    try {
      let order = pendingOrder;
      if (!order) {
        const body = { items: cart.map(({ product, quantity, variantSku }) => ({ product: product._id, quantity, variantSku })), shippingAddress: address, paymentMethod: method, deliveryMethod, couponCode: coupon?.code, expectedCurrency: settings.currency, expectedSubtotal: Math.round(subtotal * 100) / 100 };
        const fingerprint = JSON.stringify(body);
        if (checkoutRequest.current?.fingerprint !== fingerprint) checkoutRequest.current = { fingerprint, key: crypto.randomUUID() };
        const response = await api.post("/orders", { ...body, checkoutKey: checkoutRequest.current.key });
        order = response.data.order;
        if (method === "razorpay") setPendingOrder(order);
      }
      if (order.paymentMethod === "razorpay") {
        order = await payForOrder(order._id);
        if (order.paymentStatus === "refund_required") { navigate(`/my-orders/${order._id}`); return; }
        if (order.paymentStatus !== "paid") throw new Error("Payment is still pending. Check your order before trying again.");
      }
      setCart([]);
      setToast("Order confirmed. Your confirmation email has been queued.");
      navigate(`/my-orders/${order._id}`);
    } catch (requestError) { setError(requestError.response ? getErrorMessage(requestError) : requestError.message || getErrorMessage(requestError)); }
    finally { setLoading(false); }
  }

  return <main id="main-content" className="page-width checkout-page">
    <div className="breadcrumbs"><Link to="/">Home</Link><ChevronRight size={13} /><Link to="/cart">Your bag</Link><ChevronRight size={13} /><span>Checkout</span></div>
    <div className="checkout-stepbar"><span><Check size={14} /> Shopping bag</span><i /><span className="current"><LockKeyhole size={14} /> Secure checkout</span><i /><span><PackageCheck size={14} /> All yours</span></div>
    <div className="cart-heading"><div><span className="eyebrow">THE LAST STEP TO SOMETHING GOOD</span><h1>Make it <em>yours.</em></h1></div><span className="checkout-email">{user.email}</span></div>
    {preview && <StatusMessage>Demo products are for browsing. Connect the database and seed the catalog before placing real orders.</StatusMessage>}
    {error && <StatusMessage tone="error">{error}</StatusMessage>}
    {pendingOrder && <StatusMessage>Your order {pendingOrder.orderNumber} is saved and awaiting payment. Retry below or open <Link to={`/my-orders/${pendingOrder._id}`}>order details</Link>.</StatusMessage>}
    <form className="checkout-layout" onSubmit={submit}>
      <div className="checkout-form">
        <section className="checkout-surface"><div className="checkout-section-title"><span>01</span><div><h2>Delivery details</h2><p>Your good finds are going places.</p></div><Truck size={22} /></div>
          <fieldset className="checkout-address-fields" disabled={loading || Boolean(pendingOrder)}>
            <div className="form-grid"><label>First name<input name="firstName" autoComplete="given-name" required maxLength={80} /></label><label>Last name<input name="lastName" autoComplete="family-name" required maxLength={80} /></label></div>
            <label>Email address<input name="email" type="email" defaultValue={user.email} autoComplete="email" required maxLength={254} /></label><small className="checkout-field-note">Your order confirmation will arrive here.</small>
            <label>Street address<input name="street" autoComplete="street-address" required maxLength={250} /></label>
            <div className="form-grid"><label>City<input name="city" autoComplete="address-level2" required maxLength={100} /></label><label>State / region<input name="state" autoComplete="address-level1" required maxLength={100} /></label></div>
            <div className="form-grid"><label>ZIP / postal code<input name="postalCode" autoComplete="postal-code" required maxLength={20} value={postalCode} onChange={(e) => setPostalCode(e.target.value)} /></label><label>Phone<input name="phone" type="tel" autoComplete="tel" required maxLength={30} /></label></div>
          </fieldset>
        </section>
        <section className="checkout-surface"><div className="checkout-section-title"><span><Zap size={15} /></span><div><h2>Your delivery, your pace.</h2><p>Choose what works for your good things.</p></div><Truck size={22} /></div><label className={`payment-choice ${deliveryMethod === "standard" ? "selected" : ""}`}><input type="radio" name="delivery-choice" checked={deliveryMethod === "standard"} disabled={loading || Boolean(pendingOrder)} onChange={() => setDeliveryMethod("standard")} /><span><strong>Standard delivery</strong><small>Delivery timing will be shared with your shipment.</small></span><Truck size={20} /></label><label className={`payment-choice ${deliveryMethod === "express15" ? "selected" : ""} ${!service?.available || !quickItems ? "unavailable" : ""}`}><input type="radio" name="delivery-choice" checked={deliveryMethod === "express15"} disabled={loading || Boolean(pendingOrder) || !service?.available || !quickItems || checkingArea} onChange={() => setDeliveryMethod("express15")} /><span><strong>Quick · 15-minute delivery</strong><small>{checkingArea ? "Checking your neighborhood…" : !quickItems ? "Available when every item in your bag is Quick eligible." : service?.available ? `Estimated in 15 minutes · ${money(settings.quickDeliveryFee)} delivery fee` : service?.message || "Enter your 6-digit PIN code to check availability."}</small></span><Zap size={20} /></label><small className="checkout-delivery-note">Express delivery times are estimates and can vary with local conditions.</small></section>
        <section className="checkout-surface"><div className="checkout-section-title"><span>02</span><div><h2>How would you like to pay?</h2><p>A simple, secure finish.</p></div><CreditCard size={22} /></div>
          <label className={`payment-choice ${method === "wallet" ? "selected" : ""} ${!wallet?.enabled || (wallet?.wallet.balanceMinor || 0) < Math.round(total * 100) ? "unavailable" : ""}`}><input type="radio" name="payment-choice" value="wallet" checked={method === "wallet"} disabled={loading || Boolean(pendingOrder) || !wallet?.enabled || wallet.wallet.balanceMinor < Math.round(total * 100)} onChange={() => setMethod("wallet")} /><span><strong>Shop Wallet</strong><small>{wallet ? `${money(wallet.wallet.balanceMinor / 100, "INR")} available${wallet.wallet.balanceMinor < Math.round(total * 100) ? " · Add money to pay this order" : " · Pay instantly with your balance"}` : "Loading your wallet balance…"}</small></span><WalletCards size={21} /></label><Link className="checkout-wallet-link" to="/wallet">Manage wallet / add money <ArrowRight size={13} /></Link>
          <label className={`payment-choice ${method === "cash_on_delivery" ? "selected" : ""}`}><input type="radio" name="payment-choice" value="cash_on_delivery" checked={method === "cash_on_delivery"} disabled={loading || Boolean(pendingOrder)} onChange={() => setMethod("cash_on_delivery")} /><span><strong>Cash on delivery</strong><small>Pay when your order arrives.</small></span><span className="payment-choice-tag">COD</span></label>
          <label className={`payment-choice ${method === "razorpay" ? "selected" : ""} ${!onlineEnabled ? "unavailable" : ""}`}><input type="radio" name="payment-choice" value="razorpay" checked={method === "razorpay"} disabled={!onlineEnabled || loading || Boolean(pendingOrder)} onChange={() => setMethod("razorpay")} /><span><strong>Pay online with Razorpay</strong><small>{onlineEnabled ? settings.currency === "INR" ? "UPI, cards and other available methods." : "Cards and methods supported by your currency." : "Online payment is currently unavailable."}</small></span><CreditCard size={21} /></label>
          <p className="checkout-secure-note"><ShieldCheck size={15} /> Online payments are verified before your order is confirmed.</p>
        </section>
      </div>
      <aside className="order-summary checkout-summary"><div className="checkout-summary-title"><ShoppingBag size={20} /><h2>Your good things</h2><span>{cart.reduce((sum, item) => sum + item.quantity, 0)}</span></div>
        {cart.map(({ product, quantity, cartKey, variantLabel }) => <div className="checkout-product" key={cartKey || product._id}><img src={product.image} alt="" /><span>{product.name}<small>{variantLabel && `${variantLabel} ? `}Qty {quantity}</small></span><b>{money(product.price * quantity)}</b></div>)}
        <div className="coupon-entry"><label htmlFor="coupon-code">Have a little extra savings?</label><div><input id="coupon-code" placeholder="Coupon code" value={couponCode} disabled={Boolean(pendingOrder) || loading} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} /><button type="button" disabled={applying || loading || Boolean(pendingOrder) || !couponCode.trim()} onClick={applyCoupon}>{applying ? "Checking..." : "Apply"}</button></div>{coupon && <p>{coupon.code} applied ? <button type="button" disabled={Boolean(pendingOrder) || loading} onClick={() => setCoupon(null)}>Remove</button></p>}</div>
        <div className="summary-line"><span>Subtotal</span><span>{money(pendingOrder?.subtotal ?? subtotal)}</span></div>{discount > 0 && <div className="summary-line"><span>Discount</span><span>-{money(discount)}</span></div>}<div className="summary-line"><span>{deliveryMethod === "express15" ? "15-minute delivery" : "Shipping"}</span><span>{shipping ? money(shipping) : "On us"}</span></div><div className="summary-line summary-total"><span>Total</span><strong>{money(total)}</strong></div>
        <button className="button button-dark full-button" disabled={loading || preview}>{loading ? "Please wait..." : pendingOrder ? "Retry secure payment" : method === "razorpay" ? "Continue to payment" : "Place your order"}<ArrowRight size={17} /></button>
        <p className="payment-note"><LockKeyhole size={13} />{method === "wallet" ? "Paid securely with Shop Wallet" : method === "razorpay" ? "Secured by Razorpay" : "Pay at your doorstep"}</p>
        <div className="checkout-reassurance"><span><Truck size={15} /> Thoughtful delivery</span><span><PackageCheck size={15} /> Easy returns</span></div>
      </aside>
    </form>
  </main>;
}
