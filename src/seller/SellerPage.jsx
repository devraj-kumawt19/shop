import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowRight, ArrowUpRight, Boxes, Check, ChevronRight, CircleHelp, ExternalLink, LayoutDashboard, LogOut, Mail, Menu, Package, PackagePlus, PackageX, Plus, RefreshCw, ShieldCheck, Sparkles, Store, UserRound, X } from "lucide-react";
import api, { getErrorMessage } from "../api.js";
import { StatusMessage } from "../components.jsx";
import { useShop } from "../ShopContext.jsx";
import { RequireAuth } from "../pages.jsx";
import SellerCatalog from "./SellerCatalog.jsx";
import SellerProductEditor from "./SellerProductEditor.jsx";
import "./seller.css";
import Brand from "../Brand.jsx";

const sections = { overview: "Overview", catalog: "My catalogs", inventory: "Inventory", help: "Help & support", account: "My account" };
const menu = [["overview", LayoutDashboard, "Overview"], ["catalog", Package, "My catalogs"], ["inventory", Boxes, "Inventory"]];

function SellerWorkspace() {
  const { user, settings, logout } = useShop();
  const [params, setParams] = useSearchParams();
  const section = Object.hasOwn(sections, params.get("view")) ? params.get("view") : "overview";
  const filter = ["in_stock", "low_stock", "out_of_stock"].includes(params.get("stock")) ? params.get("stock") : "";
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState(undefined);
  const [mobileMenu, setMobileMenu] = useState(false);
  const sidebarRef = useRef(null);
  const [notice, setNotice] = useState("");
  const changed = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (!mobileMenu) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sidebarRef.current?.querySelector(".seller-mobile-close")?.focus();
    function keyboard(event) {
      if (event.key === "Escape") { event.preventDefault(); setMobileMenu(false); }
      if (event.key !== "Tab") return;
      const elements = [...sidebarRef.current.querySelectorAll('button, a[href]')].filter((element) => element.getClientRects().length);
      if (event.shiftKey && document.activeElement === elements[0]) { event.preventDefault(); elements.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === elements.at(-1)) { event.preventDefault(); elements[0]?.focus(); }
    }
    document.addEventListener("keydown", keyboard);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", keyboard); previousFocus?.focus(); };
  }, [mobileMenu]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    api.get("/seller/dashboard", { signal: controller.signal })
      .then(({ data }) => setSummary(data.summary))
      .catch((error) => { if (!controller.signal.aborted) setError(getErrorMessage(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [user.id, revision]);
  function navigate(view, stock = "") {
    setParams({ view, ...(stock ? { stock } : {}) });
    setMobileMenu(false);
  }
  function addProduct() { setEditor(null); setMobileMenu(false); }
  const metric = (key) => loading || error ? "\u2014" : summary?.[key] ?? "\u2014";
  const inStock = summary ? summary.products - summary.outOfStock : 0;
  const checklist = [["Your seller account is ready", true], ["Publish your first catalog", Boolean(summary?.products)], ["Keep your products in stock", inStock > 0]];
  return <div className="seller-workspace">
    {mobileMenu && <button className="seller-sidebar-backdrop" aria-label="Close navigation" onClick={() => setMobileMenu(false)} />}
    <aside className={`seller-sidebar ${mobileMenu ? "is-open" : ""}`} ref={sidebarRef} role={mobileMenu ? "dialog" : undefined} aria-modal={mobileMenu ? "true" : undefined} aria-label="Seller navigation">
      <Link className="seller-brand" to="/" aria-label={`${settings.siteName} home`}><Brand name={settings.siteName} /></Link>
      <button className="seller-mobile-close seller-icon-button" aria-label="Close navigation" onClick={() => setMobileMenu(false)}><X size={20} /></button>
      <div className="seller-store-badge"><span>{user.name.charAt(0).toUpperCase()}</span><div><strong>{user.name}</strong><small><span />Seller account</small></div><ShieldCheck size={17} /></div>
      <span className="seller-nav-label">MANAGE YOUR BUSINESS</span>
      <nav aria-label="Seller navigation">
        {menu.map(([key, Icon, label]) => <button key={key} className={section === key ? "selected" : ""} aria-current={section === key ? "page" : undefined} onClick={() => navigate(key)}><Icon size={19} /><span>{label}</span>{key === "catalog" && summary && <small>{summary.products}</small>}</button>)}
        <button onClick={addProduct}><PackagePlus size={19} /><span>Add a catalog</span><Plus size={15} /></button>
      </nav>
      <span className="seller-nav-label seller-nav-divider">SUPPORT & ACCOUNT</span>
      <nav aria-label="Seller account navigation"><button className={section === "help" ? "selected" : ""} aria-current={section === "help" ? "page" : undefined} onClick={() => navigate("help")}><CircleHelp size={19} />Help & support</button><button className={section === "account" ? "selected" : ""} aria-current={section === "account" ? "page" : undefined} onClick={() => navigate("account")}><UserRound size={19} />My account</button></nav>
      <div className="seller-sidebar-note"><span><Sparkles size={20} /></span><strong>A little care. More good finds.</strong><p>Clear photos and accurate stock help customers find their next favorite.</p><button onClick={() => navigate("help")}>View listing guide <ArrowRight size={14} /></button></div>
      <Link className="seller-visit-store" to="/"><ExternalLink size={17} />Visit storefront<ArrowUpRight size={15} /></Link>
      <button className="seller-signout" onClick={logout}><LogOut size={17} />Sign out</button>
      <span className="seller-sidebar-footer">{settings.siteName} &middot; Seller Center</span>
    </aside>
    <div className="seller-main">
      <header className="seller-topbar"><div className="seller-topbar-title"><button className="seller-mobile-menu seller-icon-button" aria-expanded={mobileMenu} aria-label="Open seller navigation" onClick={() => setMobileMenu(true)}><Menu size={21} /></button><span>Supplier Panel</span><ChevronRight size={14} /><strong>{sections[section]}</strong></div><div className="seller-top-actions"><button onClick={() => navigate("help")}><CircleHelp size={17} /><span>Need help?</span></button><span className="seller-top-divider" /><button className="seller-top-profile" onClick={() => navigate("account")}><span>{user.name.charAt(0).toUpperCase()}</span><strong>{user.name.split(" ")[0]}<small>Seller account</small></strong><ChevronRight size={15} /></button></div></header>
      <main id="main-content" className="seller-content">
        <div className="seller-heading"><div><span className="seller-eyebrow">YOUR BUSINESS, ALL IN ONE PLACE</span><h1>{section === "overview" ? `Hello, ${user.name.split(" ")[0]}.` : sections[section]}</h1><p>{({ overview: "Here's what's happening with your store today.", catalog: "Every good find starts with a great listing. Manage yours here.", inventory: "Stay on top of stock. Keep your next sale ready to go.", help: "A little guidance to get your business growing.", account: "Your seller details and account shortcuts." })[section]}</p></div><div className="seller-heading-actions"><button className="seller-secondary-button seller-refresh" disabled={loading} onClick={changed} aria-label="Refresh seller data"><RefreshCw size={16} className={loading ? "spin" : ""} /></button><button className="seller-primary-button" onClick={addProduct}><Plus size={17} />Add product</button></div></div>
        {error && <StatusMessage tone="error">{error} <button onClick={changed}>Try again</button></StatusMessage>}
        {notice && <div className="seller-notice" role="status"><Check size={17} />{notice}<button aria-label="Dismiss notification" onClick={() => setNotice("")}><X size={16} /></button></div>}
        {section === "overview" && <div className="seller-welcome-grid"><section className="seller-growth-banner"><div className="seller-banner-copy"><span className="seller-banner-pill"><Sparkles size={12} />LET'S GROW TOGETHER</span><h2>Your next big sale<br />starts with a good find.</h2><p>Bring your products to life. Add a catalog and make it easy for customers to discover you.</p><button className="seller-primary-button" onClick={addProduct}>Add your products<ArrowRight size={16} /></button></div><div className="seller-banner-art" aria-hidden="true"><span className="seller-art-orbit" /><span className="seller-art-star">&#10022;</span><div className="seller-art-back"><Package size={40} strokeWidth={1.3} /></div><div className="seller-art-front"><Store size={54} strokeWidth={1.2} /><span>Made for your next big thing.</span></div><span className="seller-art-check"><Check size={21} /></span><span className="seller-art-dots">&#10022;</span></div></section><section className="seller-start-card"><div><span className="seller-getting-icon"><Store size={19} /></span><h2>You're on your way</h2></div><p>Small steps. A great start.</p><div className="seller-progress-track"><span style={{ width: `${checklist.filter(([, done]) => done).length / 3 * 100}%` }} /></div><ul>{checklist.map(([label, done], index) => <li key={label}><span className={done ? "done" : ""}>{done ? <Check size={12} /> : index + 1}</span>{label}</li>)}</ul></section></div>}
        {["overview", "catalog", "inventory"].includes(section) && <>
          <div className="seller-summary-heading"><h2>Catalog at a glance</h2><span><span />{loading ? "Refreshing catalog data..." : error ? "Connection unavailable" : "Live catalog data"}</span></div>
          <section className="seller-metrics" aria-label="Catalog summary">
            {[["Total catalogs", metric("products"), Package, "all", "All your product listings", ""], ["In stock", loading || error ? "\u2014" : inStock, Boxes, "green", "Ready for customers to shop", "in_stock"], ["Low stock", metric("lowStock"), AlertTriangle, "amber", "5 or fewer units remaining", "low_stock"], ["Out of stock", metric("outOfStock"), PackageX, "red", "Restock to keep selling", "out_of_stock"]].map(([label, value, Icon, tone, note, stock]) => <button key={label} className={`seller-metric ${tone}`} onClick={() => navigate(stock ? "inventory" : "catalog", stock)}><span className="seller-metric-top"><span>{label}</span><span className="seller-metric-icon"><Icon size={18} /></span></span><strong>{value}</strong><small>{note}<ArrowUpRight size={13} /></small></button>)}
          </section>
          {summary?.lowStock > 0 && !loading && !error && <div className="seller-stock-alert"><span><AlertTriangle size={18} /></span><p><strong>A little restock goes a long way.</strong> {summary.lowStock} {summary.lowStock === 1 ? "product is" : "products are"} running low on stock.</p><button onClick={() => navigate("inventory", "low_stock")}>Review inventory <ArrowRight size={15} /></button></div>}
          <SellerCatalog filter={filter} onFilter={(stock) => navigate(section, stock)} revision={revision} onChange={changed} onEdit={setEditor} onCreate={addProduct} inventory={section === "inventory"} />
          <div className="seller-bottom-help"><ShieldCheck size={15} /><span>Your listings are linked securely to your seller ID.</span><button onClick={() => navigate("help")}>Seller help <ArrowUpRight size={13} /></button></div>
        </>}
        {section === "help" && <section className="seller-help-grid">{[["01", "Make a great first impression", "Use a clear product photo URL, a specific title and a description that tells customers exactly what they're getting."], ["02", "Set up your catalog", "Choose a category, set a price and add available stock. Add size or color options when each needs its own SKU, price and stock."], ["03", "Keep your inventory current", "Use Inventory to find low-stock or sold-out products. Edit the product to update quantities. Existing variant SKUs stay the same."], ["04", "Your account, your products", "Your account can edit only the products you own. Products in active orders cannot be deleted. Contact support if you need help."]].map(([step, title, description]) => <article key={step}><span>{step}</span><h2>{title}</h2><p>{description}</p></article>)}<div className="seller-contact-card"><Mail size={23} /><div><h2>We're here to help</h2><p>Have your seller ID ready when contacting support.</p><a href={`mailto:${settings.supportEmail}`}>{settings.supportEmail}<ArrowUpRight size={14} /></a></div></div></section>}
        {section === "account" && <section className="seller-account-card"><span className="seller-account-avatar">{user.name.charAt(0).toUpperCase()}</span><h2>{user.name}</h2><span className="seller-status in_stock">Active seller account</span><dl><div><dt>Seller ID</dt><dd>{user.id}</dd></div><div><dt>Email address</dt><dd>{user.email}</dd></div><div><dt>Account role</dt><dd>{user.role}</dd></div></dl><Link className="seller-primary-button" to="/profile">Edit profile <ArrowUpRight size={15} /></Link></section>}
        <footer className="seller-content-footer"><span>&copy; {new Date().getFullYear()} {settings.siteName}. Let's build something good.</span><span>Seller Center <span>&middot;</span> <button onClick={() => navigate("help")}>Help & support</button></span></footer>
      </main>
    </div>
    {editor !== undefined && <SellerProductEditor product={editor} onClose={() => setEditor(undefined)} onSaved={() => { setNotice(editor ? "Product updated. Your catalog is up to date." : "Your product is live. Here's to your next good sale!"); setEditor(undefined); changed(); }} />}
  </div>;
}

export default function SellerPage() {
  const { user } = useShop();
  if (user?.role === "superadmin") return <Navigate to="/super-admin/dashboard" replace />;
  return <RequireAuth seller><SellerWorkspace /></RequireAuth>;
}
