import { WalletAdmin } from "./WalletPage.jsx";
import AdvancedAdmin from "./AdvancedAdmin.jsx";
import { staffPermissions } from "../server/permissions.js";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowUpRight, Boxes, ChevronLeft, ChevronRight, ClipboardList, FolderOpen, LayoutDashboard, LogOut, RefreshCw, Save, Search, Settings, ShieldCheck, Sparkles, Users } from "lucide-react";
import api, { getErrorMessage } from "./api.js";
import { useShop } from "./ShopContext.jsx";
import { StatusMessage } from "./components.jsx";
import { AdminPage, RequireAuth } from "./pages.jsx";
import { formatMoney } from "../server/storeSettings.js";
import "./super-admin.css";

const navigation = [
  ["overview", "Overview", LayoutDashboard], ["products", "Products", Boxes],
  ["categories", "Collections", FolderOpen], ["orders", "Orders", ClipboardList],
  ["commerce", "Commerce tools", Activity], ["wallet", "Shop Wallet", ShieldCheck], ["users", "Users & access", Users], ["settings", "Website settings", Settings], ["activity", "Activity log", Activity],
];
const money = formatMoney;
const date = (value) => new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

export default function SuperAdminPage() {
  return <RequireAuth superAdmin><SuperAdminDashboard /></RequireAuth>;
}

export function SuperAdminDashboard() {
  const { user, settings: liveSettings, refreshSettings, logout } = useShop();
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(null);
  const [integrations, setIntegrations] = useState(null);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const catalogTab = ["products", "categories", "orders"].includes(tab);
  useEffect(() => {
    if (tab !== "settings") return;
    const controller = new AbortController();
    api.get("/super-admin/integrations", { signal: controller.signal }).then(({ data }) => setIntegrations(data)).catch(() => {});
    return () => controller.abort();
  }, [tab, revision]);

  useEffect(() => {
    if (catalogTab || tab === "commerce" || tab === "wallet") { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    setData(null);
    setError("");
    const path = tab === "users" ? `users?search=${encodeURIComponent(search)}&page=${page}` : tab;
    api.get(`/super-admin/${path}`, { signal: controller.signal })
      .then(({ data: result }) => { setData(result); if (tab === "settings") setDraft(result.settings); })
      .catch((requestError) => { if (!controller.signal.aborted) setError(getErrorMessage(requestError)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [tab, catalogTab, search, page, revision]);

  function selectTab(next) { if (next === tab) return; setData(null); setLoading(!["products", "categories", "orders", "commerce", "wallet"].includes(next)); setTab(next); setError(""); setNotice(""); }

  async function updateUser(account, updates) {
    const action = "permissions" in updates && !("role" in updates) ? `update permissions for ${account.name}` : "role" in updates ? `change ${account.name}'s role to ${updates.role}` : `${updates.isActive ? "unblock" : "block"} ${account.name}'s account`;
    if (!window.confirm(`Are you sure you want to ${action}?`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await api.patch(`/super-admin/users/${account._id}`, updates);
      setNotice("Account access updated.");
      setRevision((value) => value + 1);
    } catch (requestError) { setError(getErrorMessage(requestError)); }
    finally { setBusy(false); }
  }

  async function saveSettings(event) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const { data: result } = await api.patch("/super-admin/settings", draft);
      setDraft(result.settings);
      await refreshSettings();
      setNotice("Website settings saved. The storefront now uses your changes.");
    } catch (requestError) { setError(getErrorMessage(requestError)); }
    finally { setBusy(false); }
  }

  function field(key, value) { setDraft((current) => ({ ...current, [key]: value })); }
  const title = navigation.find(([key]) => key === tab)?.[1];
  const overview = data?.overview;

  return <div className="control-layout">
    <aside className="control-sidebar">
      <Link className="control-brand" to="/"><span><Sparkles size={21} /></span>{liveSettings.siteName}</Link>
      <div className="control-workspace"><ShieldCheck size={19} /><div><strong>Owner workspace</strong><small>Super administrator</small></div><span className="workspace-dot" /></div>
      <span className="control-nav-label">MANAGE YOUR STORE</span>
      <nav aria-label="Super admin navigation">{navigation.map(([key, label, Icon]) => <button key={key} className={tab === key ? "selected" : ""} onClick={() => selectTab(key)} aria-current={tab === key ? "page" : undefined}><Icon size={18} />{label}{tab === key && <ChevronRight size={15} />}</button>)}</nav>
      <div className="control-sidebar-note"><ShieldCheck size={23} /><strong>You are in control.</strong><p>Manage your storefront and your team's access from one place.</p><Link to="/">View storefront <ArrowUpRight size={14} /></Link></div>
      <div className="control-user"><span>{user?.name?.slice(0, 1).toUpperCase()}</span><div><strong>{user?.name}</strong><small>{user?.email}</small></div><button aria-label="Sign out" onClick={logout}><LogOut size={18} /></button></div>
    </aside>
    <main id="main-content" className="control-main">
      <header className="control-topbar"><div><span>Workspace</span><ChevronRight size={13} /><strong>{title}</strong></div><Link to="/" className="control-store-link">View website <ArrowUpRight size={16} /></Link></header>
      <div className="control-body">
        <div className="control-heading"><div><span className="control-eyebrow"><span /> WEBSITE CONTROL CENTER</span><h1>{tab === "overview" ? `Welcome back, ${user?.name?.split(" ")[0]}.` : title}</h1><p>{({ overview: "A clear view of your store. Everything you need to take the next step.", products: "Manage your catalog, inventory, pricing and homepage favorites.", categories: "Organize the collections customers discover across your website.", orders: "Keep every order moving, from checkout to delivery.", users: "Manage customer accounts and give your team the right access.", settings: "Make the storefront yours. Your changes are published when you save.", activity: "Review the latest successful changes made by your administrators." })[tab]}</p></div>{!catalogTab && <button className="control-refresh" disabled={loading || busy} onClick={() => { setRevision((value) => value + 1); refreshSettings(); }}><RefreshCw size={15} className={loading ? "spin" : ""} /> Refresh</button>}</div>
        {error && <StatusMessage tone="error">{error}</StatusMessage>}
        {notice && <StatusMessage tone="success">{notice}</StatusMessage>}
        {loading && !catalogTab && <div className="control-loading" role="status"><RefreshCw className="spin" size={24} /><p>Loading your workspace...</p></div>}
        {!loading && error && !data && !catalogTab && <div className="control-panel control-unavailable"><ShieldCheck size={32} /><h2>We could not load this section.</h2><p>Your data will appear when the API and database are connected. Refresh to try again.</p></div>}

        {tab === "overview" && overview && <>
          <div className="control-stats">{[
            ["Active order value", overview.orderValueByCurrency?.map((item) => money(item.orderValue, item._id)).join(" / ") || "—", "Excludes cancelled and unpaid orders", ClipboardList],
            ["Total orders", overview.orders, `${overview.pendingOrders} awaiting fulfillment`, Boxes],
            ["Registered users", overview.users, `${overview.blockedUsers} blocked accounts`, Users],
            ["Products", overview.products, `${overview.lowStock} low-stock products`, Boxes],
          ].map(([label, value, caption, Icon]) => <div key={label}><span className="stat-icon"><Icon size={19} /></span><small>{label}</small><strong>{value}</strong><p>{caption}</p></div>)}</div>
          <div className="control-overview-grid"><section className="control-panel"><div className="control-panel-heading"><div><h2>Recent orders</h2><p>The latest activity in your store.</p></div><button onClick={() => selectTab("orders")}>View all <ArrowUpRight size={14} /></button></div><OrdersTable orders={data.recentOrders} /></section>
          <section className="control-panel control-quick"><span className="quick-icon"><Sparkles size={24} /></span><h2>Your store, your way.</h2><p>Update the homepage, refine your catalog, or manage your team.</p><button onClick={() => selectTab("settings")}><Settings size={17} /> Customize website <ChevronRight size={16} /></button><button onClick={() => selectTab("products")}><Boxes size={17} /> Manage products <ChevronRight size={16} /></button><button onClick={() => selectTab("users")}><Users size={17} /> Manage access <ChevronRight size={16} /></button><div className="quick-checkout"><span className={liveSettings.checkoutEnabled ? "live-dot" : "paused-dot"} />Checkout {liveSettings.checkoutEnabled ? "enabled" : "paused"}<small>{overview.categories} collections</small></div></section></div>
        </>}

        {tab === "commerce" && <AdvancedAdmin embedded />}
        {tab === "wallet" && <WalletAdmin />}
        {catalogTab && <div className="control-panel control-catalog"><AdminPage key={`${tab}-${revision}`} embedded initialTab={tab} /></div>}

        {tab === "users" && <section className="control-panel">
          <div className="control-panel-heading"><div><h2>People & permissions</h2><p>Customers shop. Admins manage the catalog and orders. Super admins control the website.</p></div></div>
          <form className="control-search" onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()); setPage(1); }}><Search size={17} /><input aria-label="Search users by name or email" placeholder="Search by name or email..." value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /><button disabled={loading}>Search</button></form>
          {data && <><div className="control-table-wrap"><table className="control-table"><thead><tr><th>USER</th><th>ROLE</th><th>STATUS</th><th>JOINED</th><th>ACCESS</th></tr></thead><tbody>{data.users.map((account) => { const protectedAccount = account.role === "superadmin" || account._id === user?.id; return <tr key={account._id}><td><div className="control-person"><span>{account.name.slice(0, 1).toUpperCase()}</span><div><strong>{account.name}</strong><small>{account.email}</small></div></div></td><td>{protectedAccount ? <span className="role-badge">Super admin</span> : <select aria-label={`Role for ${account.name}`} value={account.role} disabled={busy} onChange={(event) => updateUser(account, { role: event.target.value, permissions: [] })}><option value="customer">Customer</option><option value="admin">Admin</option></select>}{!protectedAccount && account.role === "admin" && <PermissionForm account={account} busy={busy} save={updateUser} />}</td><td><span className={`control-status ${account.isActive === false ? "blocked" : "active"}`}>{account.isActive === false ? "Blocked" : "Active"}</span></td><td>{new Date(account.createdAt).toLocaleDateString("en-IN")}</td><td>{protectedAccount ? <span className="protected-account"><ShieldCheck size={13} /> Protected</span> : <button className={account.isActive === false ? "unblock-action" : "block-action"} disabled={busy} onClick={() => updateUser(account, { isActive: account.isActive === false })}>{account.isActive === false ? "Unblock" : "Block account"}</button>}</td></tr>; })}</tbody></table></div>{!data.users.length && <p className="control-empty">No accounts match your search.</p>}<div className="control-pagination"><span>{data.total} accounts · Page {page} of {Math.max(1, data.pages)}</span><div><button aria-label="Previous page" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={17} /></button><button aria-label="Next page" disabled={page >= data.pages || loading} onClick={() => setPage((value) => value + 1)}><ChevronRight size={17} /></button></div></div></>}
        </section>}

        {tab === "settings" && !loading && data && draft && <form className="control-settings" onSubmit={saveSettings}>
          <div className="integration-status-grid"><div><strong>Razorpay</strong><span className={integrations?.razorpay ? "ready" : "needs-setup"}>{integrations?.razorpay ? "Keys configured" : "Needs gateway keys"}</span></div><div><strong>Order emails</strong><span className={integrations?.email ? "ready" : "needs-setup"}>{integrations?.email ? "Sender configured" : "Needs email provider setup"}</span></div><div><strong>Owner notifications</strong><span className={integrations?.ownerEmail ? "ready" : "needs-setup"}>{integrations?.ownerEmail ? "Recipient configured" : "Set owner notification email"}</span></div></div>
          <fieldset disabled={busy} className="control-panel"><legend>Shop Wallet & 15-minute delivery</legend><div className="control-form-grid"><label className="control-switch"><input type="checkbox" checked={draft.walletEnabled} onChange={(event) => field("walletEnabled", event.target.checked)} /><span><strong>Enable Shop Wallet</strong><small>INR payments, verified Razorpay top-ups and automatic wallet refunds on cancellation.</small></span></label><label className="control-switch"><input type="checkbox" checked={draft.quickDeliveryEnabled} onChange={(event) => field("quickDeliveryEnabled", event.target.checked)} /><span><strong>Enable 15-minute delivery</strong><small>Set only areas your team can serve, then mark eligible products in the catalog.</small></span></label><label className="control-wide">Serviceable PIN codes<textarea rows={3} maxLength={7000} value={draft.quickPincodes} placeholder="Enter 6-digit PIN codes, separated by commas" onChange={(event) => field("quickPincodes", event.target.value)} /></label><label>Express delivery fee (INR)<input type="number" min="0" max="1000" step=".01" value={draft.quickDeliveryFee} required onChange={(event) => field("quickDeliveryFee", Number(event.target.value))} /></label><div className="form-grid"><label>Opens at (IST hour)<input type="number" min="0" max="23" value={draft.quickOpenHour} required onChange={(event) => field("quickOpenHour", Number(event.target.value))} /></label><label>Closes at (IST hour)<input type="number" min="1" max="24" value={draft.quickCloseHour} required onChange={(event) => field("quickCloseHour", Number(event.target.value))} /></label></div></div><p className="settings-help">Express delivery is an estimate. Empty/unconfigured PIN codes cannot select express checkout. Existing wallet balances remain visible when new payments are paused.</p></fieldset>
          <fieldset disabled={busy} className="control-panel"><legend>Commerce intelligence</legend><div className="control-form-grid"><label>Low-stock threshold<input type="number" min="0" max="1000" required value={draft.lowStockThreshold} onChange={(event) => field("lowStockThreshold", Number(event.target.value))} /><small>Products at or below this level appear as low stock. New crossings queue an owner email when configured.</small></label><label className="control-switch"><input type="checkbox" checked={draft.aiAssistantEnabled} onChange={(event) => field("aiAssistantEnabled", event.target.checked)} /><span><strong>Show AI shopping assistant</strong><small>{integrations?.ai ? "OpenAI credentials configured. Enabling this uses your API account." : "Requires OPENAI_API_KEY and OPENAI_MODEL on the server."}</small></span></label></div><p className="settings-help">Courier integration: {integrations?.courier ? "Shiprocket token configured" : "Set SHIPROCKET_TOKEN for automatic tracking sync"}. Manual carrier tracking is available in Commerce tools.</p></fieldset>
          <fieldset disabled={busy} className="control-panel"><legend>Sale & promotions</legend><label>Sale event end (optional)<input type="datetime-local" value={draft.saleEndsAt ? new Date(new Date(draft.saleEndsAt).getTime() - new Date(draft.saleEndsAt).getTimezoneOffset() * 60000).toISOString().slice(0,16) : ""} onChange={(event) => field("saleEndsAt", event.target.value ? new Date(event.target.value).toISOString() : "")} /><small>The sale page shows a countdown only for a scheduled future end.</small></label><p className="settings-help">Discounted products are found automatically from their price and compare-at price, and shown before the regular collections.</p><div className="control-form-grid"><label className="control-switch control-wide"><input type="checkbox" checked={draft.saleEnabled} onChange={(event) => field("saleEnabled", event.target.checked)} /><span><strong>Show the sale prominently</strong><small>Display the sale banner, homepage sale edit and navigation link.</small></span></label><label className="control-wide">Sale headline<input required maxLength={100} value={draft.saleTitle} onChange={(event) => field("saleTitle", event.target.value)} /></label><label className="control-wide">Sale description<textarea required rows={2} maxLength={300} value={draft.saleDescription} onChange={(event) => field("saleDescription", event.target.value)} /></label></div></fieldset>
          <fieldset disabled={busy} className="control-panel"><legend>Online payment & currency</legend><div className="control-form-grid"><label>Catalog currency<select value={draft.currency} onChange={(event) => field("currency", event.target.value)}><option value="USD">USD — US Dollar</option><option value="INR">INR — Indian Rupee</option></select><small>Currency changes do not convert product prices. Reprice the catalog before changing currency. Existing orders retain their original currency.</small></label><label className="control-switch"><input type="checkbox" checked={draft.onlinePaymentsEnabled} onChange={(event) => field("onlinePaymentsEnabled", event.target.checked)} /><span><strong>Enable Razorpay checkout</strong><small>Requires gateway keys, a webhook secret and automatic capture. Use INR for UPI. USD requires support on your gateway account.</small></span></label></div><p className="settings-help">Cash on delivery stays available. Gateway and email credentials are configured securely on the server.</p></fieldset>
          <fieldset disabled={busy} className="control-panel"><legend>Brand & identity</legend><p className="settings-help">The name, color and contact details customers see.</p><div className="control-form-grid"><label>Website name<input required maxLength={60} value={draft.siteName} onChange={(event) => field("siteName", event.target.value)} /></label><label>Support email<input required type="email" maxLength={254} value={draft.supportEmail} onChange={(event) => field("supportEmail", event.target.value)} /></label><label className="control-wide">Tagline<input required maxLength={160} value={draft.tagline} onChange={(event) => field("tagline", event.target.value)} /></label><label className="control-wide">Announcement bar<input required maxLength={160} value={draft.announcement} onChange={(event) => field("announcement", event.target.value)} /></label><label>Brand accent color<div className="control-color"><input aria-label="Brand accent color" type="color" value={draft.primaryColor} onChange={(event) => field("primaryColor", event.target.value)} /><span>{draft.primaryColor}</span></div></label><label className="control-wide">Footer description<textarea required rows={2} maxLength={500} value={draft.footerDescription} onChange={(event) => field("footerDescription", event.target.value)} /></label></div></fieldset>
          <fieldset disabled={busy} className="control-panel"><legend>Homepage content</legend><p className="settings-help">Edit the first impression of your store.</p><div className="control-form-grid"><label>Hero headline<textarea required rows={2} maxLength={100} value={draft.heroHeading} onChange={(event) => field("heroHeading", event.target.value)} /><small>Use a new line to split the headline.</small></label><label>Highlighted headline<input required maxLength={60} value={draft.heroAccent} onChange={(event) => field("heroAccent", event.target.value)} /></label><label className="control-wide">Hero description<textarea required rows={3} maxLength={600} value={draft.heroDescription} onChange={(event) => field("heroDescription", event.target.value)} /></label><label className="control-wide">Hero image URL<input required type="url" maxLength={2000} value={draft.heroImage} onChange={(event) => field("heroImage", event.target.value)} /><small>Use an HTTP or HTTPS image URL.</small></label></div></fieldset>
          <fieldset disabled={busy} className="control-panel"><legend>Shipping & checkout</legend><p className="settings-help">Shipping prices are enforced by the server when an order is placed.</p><div className="control-form-grid"><label>Shipping fee ({draft.currency})<input type="number" min="0" max="100000" step="0.01" required value={draft.shippingFee} onChange={(event) => field("shippingFee", event.target.value === "" ? "" : Number(event.target.value))} /></label><label>Free shipping from ({draft.currency})<input type="number" min="0" max="100000" step="0.01" required value={draft.freeShippingThreshold} onChange={(event) => field("freeShippingThreshold", event.target.value === "" ? "" : Number(event.target.value))} /></label><label className="control-switch control-wide"><input type="checkbox" checked={draft.checkoutEnabled} onChange={(event) => field("checkoutEnabled", event.target.checked)} /><span><strong>Accept new orders</strong><small>Turn off to pause checkout while customers can still browse.</small></span></label></div></fieldset>
          <div className="control-savebar"><span>Changes apply to the live storefront after saving.</span><button className="button button-dark" disabled={busy}><Save size={16} />{busy ? "Saving..." : "Save website settings"}</button></div>
        </form>}

        {tab === "activity" && data && <section className="control-panel"><div className="control-panel-heading"><div><h2>Administrator activity</h2><p>Latest 100 successful product, collection, order, user and settings changes.</p></div><Activity size={20} /></div><div className="control-table-wrap"><table className="control-table"><thead><tr><th>ADMINISTRATOR</th><th>ACTION</th><th>RESOURCE</th><th>TIME</th></tr></thead><tbody>{data.activity.map((entry) => <tr key={entry._id}><td><strong>{entry.actor?.name || "Former administrator"}</strong><small className="activity-email">{entry.actor?.email}</small></td><td><span className={`activity-method method-${entry.action.toLowerCase()}`}>{entry.action}</span></td><td><code>{entry.resource}</code></td><td>{date(entry.createdAt)}</td></tr>)}</tbody></table></div>{!data.activity.length && <p className="control-empty">Changes made by administrators will appear here.</p>}</section>}
        <div className="control-bottom-note"><ShieldCheck size={13} /> Restricted to super administrators <span>{liveSettings.siteName} Control Center</span></div>
      </div>
    </main>
  </div>;
}

function OrdersTable({ orders }) {
  return orders.length ? <div className="control-table-wrap"><table className="control-table"><thead><tr><th>ORDER / CUSTOMER</th><th>STATUS</th><th>TOTAL</th></tr></thead><tbody>{orders.map((order) => <tr key={order._id}><td><strong>{order.orderNumber}</strong><small className="activity-email">{order.user?.name || order.shippingAddress.firstName}</small></td><td><span className={`order-status status-${order.status}`}>{order.status}</span></td><td><strong>{money(order.total, order.currency || "USD")}</strong></td></tr>)}</tbody></table></div> : <div className="control-empty"><ClipboardList size={30} /><p>No orders yet. New orders will appear here.</p></div>;
}

function PermissionForm({ account, busy, save }) {
  return <details className="staff-permissions"><summary>Staff permissions</summary><form onSubmit={(event) => { event.preventDefault(); const permissions = new FormData(event.currentTarget).getAll("permissions"); save(account, { permissions }); }}><p>Choose what this administrator can manage.</p>{staffPermissions.map((permission) => <label key={permission}><input type="checkbox" name="permissions" value={permission} defaultChecked={!Array.isArray(account.permissions) || account.permissions.includes(permission)} />{permission}</label>)}<button disabled={busy} className="button button-quiet">Save permissions</button></form></details>;
}
