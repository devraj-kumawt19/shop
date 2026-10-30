import WalletAdmin from "./pages/WalletAdmin.jsx";
import CommerceTools from "./pages/CommerceTools.jsx";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { getErrorMessage } from "../api.js";
import { useShop } from "../ShopContext.jsx";
import { StatusMessage } from "../components.jsx";
import "./styles/super-admin.css";

import { navigation, sectionPath } from "./navigation.js";
import superAdminApi from "./services/superAdminApi.js";
import SuperAdminLayout from "./layouts/SuperAdminLayout.jsx";
import SuperAdminDashboard from "./pages/SuperAdminDashboard.jsx";
import ManageUsers from "./pages/ManageUsers.jsx";
import ManageSuperAdmins from "./pages/ManageSuperAdmins.jsx";
import AdminSettings from "./pages/AdminSettings.jsx";
import ActivityLog from "./pages/ActivityLog.jsx";
import ManageProducts from "./pages/ManageProducts.jsx";
import ManageOrders from "./pages/ManageOrders.jsx";
import ManageCategories from "./pages/ManageCategories.jsx";

export default function SuperAdminWorkspace() {
  const { user, settings: liveSettings, refreshSettings } = useShop();
  const { section = "dashboard" } = useParams();
  const navigate = useNavigate();
  const tab = section === "dashboard" ? "overview" : section;
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(null);
  const [integrations, setIntegrations] = useState(null);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sellerDetails, setSellerDetails] = useState({ name: "", email: "", password: "", role: "seller" });
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const catalogTab = ["products", "categories", "orders"].includes(tab);
  useEffect(() => {
    if (tab !== "settings") return;
    const controller = new AbortController();
    superAdminApi.get("integrations", { signal: controller.signal }).then(({ data }) => setIntegrations(data)).catch((requestError) => { if (!controller.signal.aborted) setError(getErrorMessage(requestError)); });
    return () => controller.abort();
  }, [tab, revision]);

  useEffect(() => {
    if (catalogTab || tab === "commerce" || tab === "wallet") { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    setData(null);
    setError("");
    const path = ["users", "owners"].includes(tab) ? `users?search=${encodeURIComponent(search)}&page=${page}&group=${tab}&role=${encodeURIComponent(roleFilter)}&status=${statusFilter}` : tab;
    superAdminApi.get(path, { signal: controller.signal })
      .then(({ data: result }) => { setData(result); if (tab === "settings") setDraft(result.settings); })
      .catch((requestError) => { if (!controller.signal.aborted) setError(getErrorMessage(requestError)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [tab, catalogTab, search, page, revision, roleFilter, statusFilter]);

  function selectTab(next) { navigate(sectionPath(next)); }

  async function updateUser(account, updates) {
    const action = "role" in updates
      ? `change ${account.name}'s role to ${updates.role}`
      : "permissions" in updates
        ? `update ${account.name}'s permissions`
        : `${updates.isActive ? "unblock" : "block"} ${account.name}'s account`;
    if (!window.confirm(`Are you sure you want to ${action}?`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await superAdminApi.patch(`users/${account._id}`, updates);
      setNotice("Account access updated.");
      setRevision((value) => value + 1);
    } catch (requestError) { setError(getErrorMessage(requestError)); }
    finally { setBusy(false); }
  }

  async function createSeller(event) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      await superAdminApi.post(sellerDetails.role === "admin" ? "admins" : "sellers", sellerDetails);
      setSellerDetails({ name: "", email: "", password: "", role: "seller" });
      setNotice("Account created. Share the sign-in details securely.");
      setRevision((value) => value + 1);
    } catch (requestError) { setError(getErrorMessage(requestError)); }
    finally { setBusy(false); }
  }

  async function saveSettings(event) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const { data: result } = await superAdminApi.patch("settings", draft);
      setDraft(result.settings);
      await refreshSettings();
      setNotice("Website settings saved. The storefront now uses your changes.");
    } catch (requestError) { setError(getErrorMessage(requestError)); }
    finally { setBusy(false); }
  }

  function field(key, value) { setDraft((current) => ({ ...current, [key]: value })); }
  const title = navigation.find(([key]) => key === tab)?.[1];
  const overview = data?.overview;

  return <SuperAdminLayout title={title}>
        <div className="control-heading"><div><span className="control-eyebrow"><span /> WEBSITE CONTROL CENTER</span><h1>{tab === "overview" ? `Welcome back, ${user?.name?.split(" ")[0]}.` : title}</h1><p>{({ overview: "A clear view of your store. Everything you need to take the next step.", products: "Manage your catalog, inventory, pricing and homepage favorites.", categories: "Organize the collections customers discover across your website.", orders: "Keep every order moving, from checkout to delivery.", users: "Manage customer accounts and give your team the right access.", owners: "Securely invite and review Super Admin accounts.", settings: "Make the storefront yours. Your changes are published when you save.", activity: "Review the latest successful changes made by your administrators." })[tab]}</p></div>{!catalogTab && <button className="control-refresh" disabled={loading || busy} onClick={() => { setRevision((value) => value + 1); refreshSettings(); }}><RefreshCw size={15} className={loading ? "spin" : ""} /> Refresh</button>}</div>
        {error && <StatusMessage tone="error">{error}</StatusMessage>}
        {notice && <StatusMessage tone="success">{notice}</StatusMessage>}
        {loading && !catalogTab && <div className="control-loading" role="status"><RefreshCw className="spin" size={24} /><p>Loading your workspace...</p></div>}
        {!loading && error && !data && !catalogTab && <div className="control-panel control-unavailable"><ShieldCheck size={32} /><h2>We could not load this section.</h2><p>Your data will appear when the API and database are connected. Refresh to try again.</p></div>}

        {tab === "overview" && overview && <SuperAdminDashboard data={data} liveSettings={liveSettings} selectTab={selectTab} />}

        {tab === "commerce" && <CommerceTools embedded />}
        {tab === "wallet" && <WalletAdmin />}
        {tab === "products" && <ManageProducts key={revision} />}{tab === "orders" && <ManageOrders key={revision} />}{tab === "categories" && <ManageCategories key={revision} />}

        {["users", "owners"].includes(tab) && (() => {
          const UsersPage = tab === "owners" ? ManageSuperAdmins : ManageUsers;
          return <UsersPage user={user} sellerDetails={sellerDetails} setSellerDetails={setSellerDetails} createSeller={createSeller} busy={busy} searchInput={searchInput} setSearchInput={setSearchInput} setSearch={setSearch} page={page} setPage={setPage} loading={loading} data={data} updateUser={updateUser} roleFilter={roleFilter} setRoleFilter={setRoleFilter} statusFilter={statusFilter} setStatusFilter={setStatusFilter} />;
        })()}
        {tab === "settings" && !loading && data && draft && <AdminSettings draft={draft} integrations={integrations} field={field} saveSettings={saveSettings} busy={busy} />}
        {tab === "activity" && data && <ActivityLog data={data} />}
        <div className="control-bottom-note"><ShieldCheck size={13} /> Restricted to super administrators <span>{liveSettings.siteName} Control Center</span></div>
  </SuperAdminLayout>;
}
