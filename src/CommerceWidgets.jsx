import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Bell, Download, Sparkles, Send, X, Truck, RefreshCw, ArrowUpRight, CheckCheck } from "lucide-react";
import api, { getErrorMessage } from "./api.js";
import { useMoney, useShop } from "./ShopContext.jsx";
import { StatusMessage } from "./components.jsx";

export async function downloadFile(path, filename) {
  const { data } = await api.get(path, { responseType: "blob" });
  const url = URL.createObjectURL(data); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function NotificationBell() {
  const { user } = useShop(); const [count, setCount] = useState(0); const location = useLocation();
  useEffect(() => {
    if (!user) { setCount(0); return; }
    const controller = new AbortController();
    const load = () => api.get("/notifications", { signal: controller.signal }).then(({ data }) => setCount(data.unread)).catch(() => {});
    load(); const timer = setInterval(load, 60000); return () => { controller.abort(); clearInterval(timer); };
  }, [user?.id, location.pathname]);
  if (!user) return null;
  return <Link to="/notifications" className="signature-icon notification-bell" aria-label={`Notifications${count ? `, ${count} unread` : ""}`}><Bell size={18} />{count > 0 && <span className="signature-count">{count > 9 ? "9+" : count}</span>}</Link>;
}
export function NotificationsPage() {
  const { user } = useShop(); const money = useMoney(); const [data, setData] = useState(null), [alerts, setAlerts] = useState([]), [error, setError] = useState("");
  async function load() {
    try { const [inbox, saved] = await Promise.all([api.get("/notifications"), api.get("/alerts")]); setData(inbox.data); setAlerts(saved.data.alerts); }
    catch (error) { setError(getErrorMessage(error)); }
  }
  useEffect(() => { if (user) load(); }, [user?.id]);
  async function read() { try { await api.patch("/notifications/read"); await load(); } catch (error) { setError(getErrorMessage(error)); } }
  async function remove(id) { try { await api.delete(`/alerts/${id}`); await load(); } catch (error) { setError(getErrorMessage(error)); } }
  if (!user) return <main id="main-content" className="page-width empty-state"><Bell /><h1>Your updates, together.</h1><Link className="button button-dark" to="/login">Sign in</Link></main>;
  return <main id="main-content" className="page-width account-page notifications-page"><div className="section-heading"><div><span className="eyebrow">STAY A LITTLE CLOSER</span><h1>Your <em>updates.</em></h1></div><button className="button button-quiet" onClick={read} disabled={!data?.unread}><CheckCheck size={16} /> Mark all read</button></div>{error && <StatusMessage tone="error">{error}</StatusMessage>}
    <div className="notifications-layout"><section><h2>What's new</h2>{data?.notifications.length ? data.notifications.map((item) => <Link className={`notification-card ${!item.readAt ? "unread" : ""}`} key={item._id} to={item.href?.startsWith("/") && !item.href.startsWith("//") ? item.href : "/notifications"}><span><Bell size={18} /></span><div><strong>{item.title}</strong><p>{item.message}</p><small>{new Date(item.createdAt).toLocaleString()}</small></div><ArrowUpRight size={17} /></Link>) : <div className="commerce-empty"><Bell size={25} /><h3>{data ? "You're all caught up." : "Loading your updates..."}</h3><p>Order and product alerts will appear here.</p></div>}</section>
      <aside className="commerce-panel"><h2>Watching for you</h2><p>Your active price and back-in-stock alerts.</p>{alerts.map((alert) => <div className="saved-alert" key={alert._id}><Link to={alert.product ? `/products/${alert.product._id}` : "/products"}><strong>{alert.product?.name || "Unavailable product"}</strong><small>{alert.type === "stock" ? "Back in stock" : `Price below ${money(alert.targetPrice, alert.currency)}`}</small></Link><button aria-label="Remove alert" onClick={() => remove(alert._id)}><X size={15} /></button></div>)}{!alerts.length && <small>No active alerts. Save one from a product page.</small>}</aside></div>
  </main>;
}
export function OrderExtras({ order }) {
  const [data, setData] = useState({ tracking: order.tracking, timeline: order.timeline || [], status: order.status }), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const load = () => api.get(`/orders/${order._id}/tracking`, { signal: controller.signal }).then(({ data }) => setData(data)).catch(() => {});
    load(); const timer = setInterval(load, 30000); return () => { controller.abort(); clearInterval(timer); };
  }, [order._id]);
  async function action(kind) {
    setBusy(true); setError("");
    try { if (kind === "invoice") await downloadFile(`/orders/${order._id}/invoice`, `${order.orderNumber}.pdf`); else setData((await api.post(`/orders/${order._id}/tracking/sync`)).data); }
    catch (error) { setError(getErrorMessage(error)); } finally { setBusy(false); }
  }
  const tracking = data.tracking;
  return <section className="order-extras"><div className="commerce-panel-heading"><h2><Truck size={20} /> Your order's journey</h2><button className="button button-quiet" disabled={busy} onClick={() => action("invoice")}><Download size={15} /> {order.status === "awaiting_payment" ? "Pro forma PDF" : "Invoice PDF"}</button></div>{error && <StatusMessage tone="error">{error}</StatusMessage>}
    {data.syncError && <StatusMessage>{data.syncError}</StatusMessage>}
    {tracking?.awb ? <div className="shipment-card"><div><span className="eyebrow">{tracking.carrier}</span><strong>{tracking.awb}</strong><p>{tracking.providerStatus || data.status?.replaceAll("_", " ")}</p>{tracking.eta && <small>Estimated delivery: {new Date(tracking.eta).toLocaleDateString()}</small>}{tracking.syncedAt && <small>Courier checked {new Date(tracking.syncedAt).toLocaleString()}</small>}</div><div>{/^https:\/\//i.test(tracking.url || "") && <a className="subtle-link" href={tracking.url} target="_blank" rel="noopener noreferrer">Track with courier <ArrowUpRight size={15} /></a>}{tracking.carrier?.toLowerCase() === "shiprocket" && <button className="button button-quiet" disabled={busy} onClick={() => action("sync")}><RefreshCw size={14} /> Refresh courier</button>}</div></div> : <p className="commerce-muted">Tracking details will appear after your shipment is assigned.</p>}
    <ol className="tracking-timeline">{[...(data.timeline?.length ? data.timeline : [{ status: order.status, message: `Order ${order.status.replaceAll("_", " ")}`, at: order.createdAt }])].sort((a, b) => new Date(b.at) - new Date(a.at)).map((item, i) => <li key={`${item.at}-${i}`}><span /><div><strong>{item.message}</strong>{item.location && <small>{item.location}</small>}<time>{new Date(item.at).toLocaleString()}</time></div></li>)}</ol>
  </section>;
}
export function ShoppingAssistant() {
  const { settings } = useShop(); const money = useMoney(); const location = useLocation();
  const [open, setOpen] = useState(false), [question, setQuestion] = useState(""), [reply, setReply] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const trigger = useRef(null), panel = useRef(null), input = useRef(null);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => {
    if (!open) return;
    function key(event) {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
      if (event.key === "Tab") {
        const nodes = [...panel.current.querySelectorAll('button:not([disabled]),input:not([disabled]),a[href]')];
        const first = nodes[0], last = nodes.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }
    document.addEventListener("keydown", key); return () => document.removeEventListener("keydown", key);
  }, [open]);
  if (!settings.aiAssistantEnabled || /\/(super-admin|admin|management|login|register)(\/|$)/.test(location.pathname)) return null;
  async function ask(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { setReply((await api.post("/assistant", { question })).data); } catch (error) { setError(getErrorMessage(error)); } finally { setBusy(false); }
  }
  return <><button ref={trigger} className="assistant-trigger" aria-haspopup="dialog" aria-expanded={open} aria-label="Open shopping assistant" onClick={() => setOpen(true)}><Sparkles size={20} /><span>A little help?</span></button>{open && <div className="assistant-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) { setOpen(false); trigger.current?.focus(); } }}><section ref={panel} role="dialog" aria-modal="true" aria-labelledby="assistant-title" className="assistant-panel"><header><span className="assistant-symbol"><Sparkles size={23} /></span><div><small>YOUR SHOPPING COMPANION</small><h2 id="assistant-title">Let's find your good thing.</h2></div><button aria-label="Close assistant" onClick={() => { setOpen(false); trigger.current?.focus(); }}><X size={20} /></button></header><div className="assistant-content"><p>Tell me what you're looking for. I'll help you explore the store's catalog.</p>{!reply && <div className="assistant-suggestions">{["Help me find a gift", "Show me home essentials", "Which headphones are available?"].map((text) => <button key={text} onClick={() => { setQuestion(text); input.current?.focus(); }}>{text}<ArrowUpRight size={14} /></button>)}</div>}{reply && <><p className="assistant-answer">{reply.answer}</p><div className="assistant-products">{reply.products.map((item) => <Link onClick={() => setOpen(false)} key={item.id} to={`/products/${item.id}`}><span>{item.name}</span><strong>{money(item.price)}</strong><ArrowUpRight size={14} /></Link>)}</div></>}{error && <StatusMessage tone="error">{error}</StatusMessage>}{busy && <p role="status">Finding a few good options...</p>}</div><form onSubmit={ask}><input ref={input} aria-label="Your shopping question" placeholder="What are you looking for?" value={question} onChange={(event) => setQuestion(event.target.value)} minLength={3} maxLength={600} required /><button aria-label="Ask assistant" disabled={busy || question.trim().length < 3}><Send size={18} /></button></form><small className="assistant-disclosure">AI replies can be imperfect. Confirm prices and availability on the product page. Your question is sent to our AI provider; keep personal details out.</small></section></div>}</>;
}
