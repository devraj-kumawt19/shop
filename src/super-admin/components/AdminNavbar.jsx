import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, ChevronRight, LogOut, UserRound } from "lucide-react";
import { useShop } from "../../ShopContext.jsx";
import { getErrorMessage } from "../../api.js";
import superAdminApi from "../services/superAdminApi.js";

export default function AdminNavbar({ title }) {
  const { user, logout } = useShop();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    setBusy(true); setError("");
    try { await superAdminApi.logout(); logout("/super-admin/login"); }
    catch (requestError) {
      if (requestError.response?.status === 401) logout("/super-admin/login");
      else setError(getErrorMessage(requestError));
    } finally { setBusy(false); }
  }
  return <><header className="control-topbar"><div><span>Workspace</span><ChevronRight size={13} /><strong>{title}</strong></div><div className="sa-top-actions"><Link to="/" className="control-store-link">View website <ArrowUpRight size={16} /></Link><details className="sa-profile"><summary aria-label="Profile menu"><UserRound size={18} /><span>{user?.name?.split(" ")[0]}</span></summary><div><strong>{user?.name}</strong><small>{user?.email}</small><Link to="/profile">Edit profile</Link><button onClick={signOut} disabled={busy}><LogOut size={16} />{busy ? "Signing out…" : "Sign out on all devices"}</button></div></details></div></header>{error && <p className="sa-alert" role="alert">{error}</p>}</>;
}
