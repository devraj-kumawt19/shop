export default function StatisticsCharts({ statistics }) {
  const months = Array.from({ length: 6 }, (_, index) => {
    const start = new Date(statistics.since);
    start.setUTCMonth(start.getUTCMonth() + index);
    return { key: start.toISOString().slice(0, 7), label: start.toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" }) };
  });
  return <div className="sa-charts">{[["New users", statistics.users], ["Orders placed", statistics.orders]].map(([title, values]) => {
    const max = Math.max(1, ...values.map((item) => item.count));
    return <section className="control-panel" key={title}><div className="control-panel-heading"><div><h2>{title}</h2><p>Monthly totals · Last six months (UTC)</p></div></div><div className="sa-bar-chart" role="img" aria-label={`${title}: ${months.map((month) => `${month.label}: ${values.find((item) => item._id === month.key)?.count || 0}`).join(", ")}`}>{months.map((month) => {
      const count = values.find((item) => item._id === month.key)?.count || 0;
      return <div className="sa-bar-column" key={month.key}><strong>{count}</strong><div className="sa-bar-track"><span style={{ height: `${count / max * 100}%` }} /></div><small>{month.label}</small></div>;
    })}</div></section>;
  })}<section className="control-panel sa-order-statuses"><h2>Order status</h2>{statistics.orderStatuses.length ? statistics.orderStatuses.map((item) => <div key={item._id}><span className={`order-status status-${item._id}`}>{item._id.replaceAll("_", " ")}</span><strong>{item.count}</strong></div>) : <p className="control-empty">No orders yet.</p>}</section></div>;
}
