import { Link } from "react-router-dom";
import { ArrowUpRight, ShieldCheck, Sparkles } from "lucide-react";
import { useShop } from "../../ShopContext.jsx";

export default function AdminAuthLayout({ title, description, children }) {
  const { settings } = useShop();
  return <main id="main-content" className="sa-auth"><section className="sa-auth-story"><Link className="sa-auth-brand" to="/"><Sparkles />{settings.siteName}</Link><div><span className="sa-auth-eyebrow">OWNER WORKSPACE</span><h1>A clear view.<br />Complete control.</h1><p>Your people, products and operations, connected in one secure workspace.</p><div className="sa-security-note"><ShieldCheck size={22} /><span>Reserved for verified Super Admins.<br /><small>Access is checked securely by the server.</small></span></div></div><Link to="/">Visit your storefront <ArrowUpRight size={16} /></Link></section><section className="sa-auth-content"><div className="sa-auth-card"><span className="sa-auth-emblem"><ShieldCheck size={26} /></span><h2>{title}</h2><p>{description}</p>{children}</div><small className="sa-auth-footer">{settings.siteName} · Administration</small></section></main>;
}
