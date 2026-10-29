import { useEffect, useState } from "react";
import { useMoney } from "../../ShopContext.jsx";
import { StatusMessage } from "../../components.jsx";
import { getErrorMessage } from "../../api.js";
import superAdminApi from "../services/superAdminApi.js";

export default function WalletAdmin() {
  const money = useMoney(); const [data, setData] = useState(null), [error, setError] = useState("");
  useEffect(() => { superAdminApi.get("wallet").then(({ data }) => setData(data)).catch((error) => setError(getErrorMessage(error))); }, []);
  return <section className="commerce-panel"><h2>Shop Wallet overview</h2><p>Verified customer balances and the latest 100 ledger entries. Balances cannot be edited directly.</p>{error && <StatusMessage tone="error">{error}</StatusMessage>}{data && <><div className="commerce-metrics"><article><small>TOTAL CUSTOMER BALANCE</small><strong>{money(data.totals.balanceMinor / 100, "INR")}</strong><p>{data.totals.accounts} wallet accounts</p></article></div><div className="commerce-table-wrap"><table className="commerce-table"><thead><tr><th>Customer</th><th>Transaction</th><th>Amount</th><th>Balance after</th><th>Time</th></tr></thead><tbody>{data.transactions.map((entry) => <tr key={entry._id}><td>{entry.user?.name || "Customer"}<small>{entry.user?.email}</small></td><td>{entry.description}<small>{entry.kind}</small></td><td>{money(entry.amountMinor / 100, "INR")}</td><td>{money(entry.balanceAfterMinor / 100, "INR")}</td><td>{new Date(entry.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div>{!data.transactions.length && <p className="commerce-empty">Wallet transactions will appear here.</p>}</>}</section>;
}
