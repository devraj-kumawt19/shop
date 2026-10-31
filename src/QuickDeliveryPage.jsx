import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Check, ChevronRight, Clock3, MapPin, PackageCheck, ShoppingBag, Truck, Zap } from "lucide-react";
import { useProducts } from "./hooks/useProducts.js";
import { ProductGrid, StatusMessage } from "./components.jsx";
import { useMoney, useShop } from "./ShopContext.jsx";
import api, { getErrorMessage } from "./api.js";

export default function QuickDeliveryPage() {
  const money = useMoney(); const { settings, cart } = useShop(); const navigate = useNavigate();
  const [pin, setPin] = useState(() => localStorage.getItem("luxecarts_delivery_pin") || ""), [result, setResult] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const catalog = useProducts({ quick: "true", limit: "100" });
  useEffect(() => { document.title = `Quick · 15-minute delivery | ${settings.siteName}`; }, [settings.siteName]);
  async function check(event) { event.preventDefault(); setBusy(true); setError(""); setResult(null); try { const { data } = await api.get(`/delivery/check?postalCode=${encodeURIComponent(pin)}`); setResult(data); if (data.available) localStorage.setItem("luxecarts_delivery_pin", pin); } catch (error) { setError(getErrorMessage(error)); } finally { setBusy(false); } }
  function checkout() { localStorage.setItem("luxecarts_delivery_pin", pin); navigate("/checkout", { state: { deliveryMethod: "express15", postalCode: pin } }); }
  return <main id="main-content" className="quick-page"><div className="page-width">
    <div className="breadcrumbs"><Link to="/">Home</Link><ChevronRight size={13} />
    <span>Quick by LUXE CARTS</span></div>
    <section className="quick-hero"><div className="quick-hero-copy">
      <span className="quick-brand"><span><Zap size={18} fill="currentColor" />
      </span>quick<small>by LUXE CARTS</small></span>
      <span className="quick-hero-kicker">GOOD THINGS DON'T ALWAYS NEED TO WAIT.</span>
      <h1>Your everyday.<br /><span>At your door.</span><br />In <em>15 minutes.</em></h1>
      <p>Your local shelf, a little closer. Selected essentials, carefully packed and delivered in a hurry.</p>
      <form className="quick-pin-form" onSubmit={check}><label htmlFor="quick-pin"><MapPin size={16} /> Where should we bring your good things?</label>
      <div><input id="quick-pin" inputMode="numeric" autoComplete="postal-code" pattern="[0-9]{6}" maxLength={6} minLength={6} required placeholder="Enter 6-digit PIN code" value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setResult(null); }} /><button disabled={busy}>{busy ? "Checking…" : "Check area"}<ArrowRight size={16} /></button></div></form>{result && <div className={`quick-service-result ${result.available ? "available" : ""}`}>{result.available ? <Check size={19} /> : <MapPin size={19} />}<span><strong>{result.available ? "Good news. We're in your neighborhood." : "We're not at your doorstep just yet."}</strong><small>{result.message}{result.available ? ` Delivery fee ${money(result.fee)}.` : " Standard delivery is available at checkout."}</small></span></div>}{error && <StatusMessage tone="error">{error}</StatusMessage>}<small className="quick-estimate-note">15 minutes is an estimate for serviceable areas during operating hours. Actual delivery can vary with stock, traffic and order volume.</small></div>
      <div className="quick-hero-art"><div className="quick-orbit" /><div className="quick-time-disc"><Clock3 size={30} /><strong>15</strong><span>MINUTES</span></div><div className="quick-bag"><div className="quick-bag-handle" /><ShoppingBag size={86} strokeWidth={1} /><strong>good things.<br />coming through.</strong><span>quick <Zap size={14} fill="currentColor" /></span></div><span className="quick-float-pill pill-one"><PackageCheck size={18} />Packed with care</span><span className="quick-float-pill pill-two"><Zap size={17} fill="currentColor" />A little quicker.</span><span className="quick-star">✦</span></div>
    </section>
    <div className="quick-how"><article><span>01</span><div><h3>Your neighborhood first.</h3><p>Check your PIN for local availability.</p></div><MapPin size={22} /></article><article><span>02</span><div><h3>Pick your good things.</h3><p>Choose products marked Quick eligible.</p></div><ShoppingBag size={22} /></article><article><span>03</span><div><h3>We'll take it from here.</h3><p>Choose 15-minute delivery at checkout.</p></div><Truck size={22} /></article></div>
    <section className="quick-catalog"><div className="section-heading"><div><span className="eyebrow"><Zap size={14} /> THE LOCAL GOOD-THINGS SHELF</span><h2>Everyday finds.<br /><em>Less everyday waiting.</em></h2></div>{result?.available && cart.length > 0 ? <button className="button button-dark" onClick={checkout}>Express checkout <ArrowRight size={16} /></button> : <Link className="subtle-link" to="/products">Browse the full shop <ArrowUpRight size={15} /></Link>}</div>{catalog.error && <StatusMessage tone="error">{catalog.error}</StatusMessage>}<ProductGrid products={catalog.products.filter((p) => p.quickEligible)} loading={catalog.loading} emptyMessage="Your local shelf is getting ready." />{!settings.quickDeliveryEnabled && <p className="quick-launch-note">Quick delivery is being set up. Availability appears here when the store enables service areas and eligible inventory.</p>}</section>
    <section className="quick-bottom"><Clock3 size={31} /><div><h2>Small moments. A little more time.</h2><p>Skip the extra trip. Check your area and let the good things come to you.</p></div><a href="#quick-pin" className="button button-dark">Find my area <MapPin size={16} /></a></section>
  </div></main>;
}
