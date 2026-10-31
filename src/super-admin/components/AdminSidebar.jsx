import { Link, NavLink } from "react-router-dom";
import { ArrowUpRight, ChevronRight, ShieldCheck, Sparkles } from "lucide-react";
import { useShop } from "../../ShopContext.jsx";
import { navigation, sectionPath } from "../navigation.js";
import Brand from "../../Brand.jsx";

export default function AdminSidebar() {
  const { user, settings } = useShop();
  return <aside className="control-sidebar"><Link className="control-brand" to="/" aria-label={`${settings.siteName} home`}><Brand name={settings.siteName} /></Link>
    <div className="control-workspace"><ShieldCheck size={19} /><div><strong>Owner workspace</strong><small>Super administrator</small></div><span className="workspace-dot" /></div>
    <span className="control-nav-label">MANAGE YOUR STORE</span><nav aria-label="Super admin navigation">{navigation.map(([key, label, Icon]) => <NavLink to={sectionPath(key)} key={key} className={({ isActive }) => isActive ? "selected" : ""}><Icon size={18} />{label}<ChevronRight size={15} /></NavLink>)}</nav>
    <div className="control-sidebar-note"><ShieldCheck size={23} /><strong>You are in control.</strong><p>Manage your storefront and your team's access from one place.</p><Link to="/">View storefront <ArrowUpRight size={14} /></Link></div>
    <div className="control-user"><span>{user?.name?.slice(0, 1).toUpperCase()}</span><div><strong>{user?.name}</strong><small>{user?.email}</small></div></div>
  </aside>;
}
