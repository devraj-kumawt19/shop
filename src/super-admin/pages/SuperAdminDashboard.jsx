import { ArrowUpRight, Boxes, ChevronRight, ClipboardList, Settings, ShieldCheck, Sparkles, Users } from "lucide-react";
import { formatMoney } from "../../../server/storeSettings.js";
import StatsCard from "../components/StatsCard.jsx";
import StatisticsCharts from "../components/StatisticsCharts.jsx";
const money = formatMoney;
export default function SuperAdminDashboard({ data, liveSettings, selectTab }) {
  const overview = data.overview;
  const currency = liveSettings.currency;
  return <>
          <div className="control-stats">{[
            ["Paid revenue", overview.revenueByCurrency?.map((item) => money(item.total, item._id)).join(" / ") || money(0, currency), "Paid, non-cancelled orders only", ClipboardList],
            ["Total orders", overview.orders, `${overview.pendingOrders} awaiting fulfillment`, Boxes],
            ["Registered users", overview.users, `${overview.blockedUsers} blocked accounts`, Users],
            ["Super Admins", overview.administrators, "Owners with full store access", ShieldCheck],
            ["Products", overview.products, `${overview.lowStock} low-stock products`, Boxes],
          ].map(([label, value, caption, Icon]) => <StatsCard key={label} label={label} value={value} caption={caption} icon={Icon} />)}</div>
          {data.statistics && <StatisticsCharts statistics={data.statistics} />}
          <div className="control-overview-grid"><section className="control-panel"><div className="control-panel-heading"><div><h2>Recent orders</h2><p>The latest activity in your store.</p></div><button onClick={() => selectTab("orders")}>View all <ArrowUpRight size={14} /></button></div><OrdersTable orders={data.recentOrders} /></section>
          <section className="control-panel control-quick"><span className="quick-icon"><Sparkles size={24} /></span><h2>Your store, your way.</h2><p>Update the homepage, refine your catalog, or manage your team.</p><button onClick={() => selectTab("settings")}><Settings size={17} /> Customize website <ChevronRight size={16} /></button><button onClick={() => selectTab("products")}><Boxes size={17} /> Manage products <ChevronRight size={16} /></button><button onClick={() => selectTab("users")}><Users size={17} /> Manage access <ChevronRight size={16} /></button><div className="quick-checkout"><span className={liveSettings.checkoutEnabled ? "live-dot" : "paused-dot"} />Checkout {liveSettings.checkoutEnabled ? "enabled" : "paused"}<small>{overview.categories} collections</small></div></section></div>
          <section className="control-panel"><div className="control-panel-heading"><div><h2>Recent activity</h2><p>Successful administrator changes.</p></div><button onClick={() => selectTab("activity")}>View activity <ArrowUpRight size={14} /></button></div>{data.recentActivity?.length ? <ul className="sa-recent-activity">{data.recentActivity.map((entry) => <li key={entry._id}><span><strong>{entry.actor?.name || "Former administrator"}</strong><small>{entry.action} {entry.resource}</small></span><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString("en-IN")}</time></li>)}</ul> : <p className="control-empty">Administrator changes will appear here.</p>}</section>
        </>;
}

function OrdersTable({ orders }) {
  return orders.length ? <div className="control-table-wrap"><table className="control-table"><thead><tr><th>ORDER / CUSTOMER</th><th>STATUS</th><th>TOTAL</th></tr></thead><tbody>{orders.map((order) => <tr key={order._id}><td><strong>{order.orderNumber}</strong><small className="activity-email">{order.user?.name || order.shippingAddress?.firstName || "Customer"}</small></td><td><span className={`order-status status-${order.status}`}>{order.status}</span></td><td><strong>{money(order.total, order.currency || "USD")}</strong></td></tr>)}</tbody></table></div> : <div className="control-empty"><ClipboardList size={30} /><p>No orders yet. New orders will appear here.</p></div>;
}

