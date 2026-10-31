import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { ArrowRight, ArrowUpRight, ChevronDown, Heart, LayoutGrid, LogOut, Menu, Package, ShieldCheck, ShoppingBag, Truck, UserRound, WalletCards, X, Zap } from "lucide-react";
import { NotificationBell } from "./CommerceWidgets.jsx";
import { SearchBar } from "./components.jsx";
import { useShop } from "./ShopContext.jsx";
import { useCategories } from "./hooks/useProducts.js";
import Brand from "./Brand.jsx";

export default function Header() {
  const { cart, wishlist, user, logout, settings } = useShop();
  const { categories } = useCategories();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const header = useRef(null);
  const trigger = useRef(null);
  const bagCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const workspace = user?.role === "superadmin" ? "/super-admin" : ["seller", "admin"].includes(user?.role) ? "/seller" : null;
  const toggleNavigation = (event) => { trigger.current = event.currentTarget; setOpen(current => !current); };

  useEffect(() => setOpen(false), [location.pathname, location.search]);
  useEffect(() => {
    if (!open) return;
    const outside = (event) => { if (!header.current?.contains(event.target)) setOpen(false); };
    const escape = (event) => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);

  return <>
    <div className="store-announcement"><span><Truck size={14} /> A little discovery. A lot to love.</span><Link to={settings.saleEnabled ? "/sale" : "/products"}>{settings.saleEnabled ? "Good finds. Even better prices. Shop the sale" : settings.announcement}<ArrowRight size={13} /></Link><Link className="announcement-seller" to="/sell">Become a seller <ArrowUpRight size={12} /></Link></div>
    <header className="store-header" ref={header}>
      <div className="store-header-main store-width">
        <button className="store-menu-button" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="store-navigation" onClick={toggleNavigation}>{open ? <X size={22} /> : <Menu size={22} />}</button>
        <Link className="store-logo" to="/" aria-label={`${settings.siteName} home`}><Brand name={settings.siteName} /></Link>
        <div className="store-search"><SearchBar /></div>
        <div className="store-header-actions">
          <Link className="store-account" to={user ? "/profile" : "/login"}><UserRound size={21} /><span><small>{user ? "Welcome back" : "Hello, shopper"}</small><strong>{user ? user.name.split(" ")[0] : "Sign in / Register"}</strong></span></Link>
          <Link className="store-action" to="/wishlist" aria-label={`Wishlist, ${wishlist.length} saved items`}><Heart size={22} />{wishlist.length > 0 && <b>{wishlist.length}</b>}</Link>
          <Link className="store-action store-wallet" to="/wallet" aria-label="Shop Wallet" title="Shop Wallet"><WalletCards size={21} /></Link>
          {workspace && <Link className="store-action" to={workspace} aria-label="Dashboard" title="Dashboard"><ShieldCheck size={20} /></Link>}
          {user && <NotificationBell />}
          <Link className="store-bag" to="/cart" aria-label={`Shopping bag, ${bagCount} ${bagCount === 1 ? "item" : "items"}`}><ShoppingBag size={21} /><span>Cart</span><b>{bagCount}</b></Link>
        </div>
      </div>
      <div className="store-nav-wrap"><nav className={`store-nav store-width ${open ? "is-open" : ""}`} id="store-navigation" aria-label="Main navigation">
        <div className="store-categories-menu"><button aria-expanded={open} onClick={toggleNavigation} aria-controls="store-category-panel"><LayoutGrid size={16} /> All categories <ChevronDown size={13} /></button>{open && <div id="store-category-panel" className="store-category-panel"><span>FIND YOUR NEXT FAVORITE</span>{categories.map(category => <Link key={category.slug} to={`/categories/${category.slug}`}><img src={category.image || "/product-placeholder.svg"} alt="" /><strong>{category.name}</strong><ArrowUpRight size={15} /></Link>)}<Link to="/products"><LayoutGrid size={18} /><strong>Shop everything</strong><ArrowRight size={15} /></Link>{user && <button className="store-panel-logout" onClick={() => { setOpen(false); logout(); }}><LogOut size={15} />Sign out</button>}</div>}</div>
        <div className="store-nav-links"><NavLink to="/" end>Home</NavLink><NavLink to="/products">Shop all</NavLink>{categories.map(category => <NavLink key={category.slug} to={`/categories/${category.slug}`}>{category.name}</NavLink>)}{settings.saleEnabled && <NavLink to="/sale" className={({ isActive }) => `store-sale-link ${isActive ? "active" : ""}`}>Hot deals <span /></NavLink>}</div>
        <Link className="store-delivery" to={settings.quickDeliveryEnabled ? "/quick-delivery" : "/my-orders"}>{settings.quickDeliveryEnabled ? <Zap size={15} /> : <Package size={15} />}{settings.quickDeliveryEnabled ? "15-min delivery" : "Track your order"}</Link>
        <div className="store-mobile-utilities"><Link to={user ? "/profile" : "/login"}><UserRound size={16} />{user ? "Your account" : "Sign in / Register"}</Link><Link to="/wallet"><WalletCards size={16} /> Shop Wallet</Link>{workspace && <Link to={workspace}><ShieldCheck size={16} /> Dashboard</Link>}{user && <button onClick={() => { setOpen(false); logout(); }}><LogOut size={16} /> Sign out</button>}</div>
      </nav></div>
    </header>
  </>;
}
