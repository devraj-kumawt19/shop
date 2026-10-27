import { NotificationBell } from "./CommerceWidgets.jsx";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, ArrowUpRight, ChevronDown, Compass, WalletCards, Zap, Heart, LayoutGrid, LogOut, Menu, Search, ShieldCheck, ShoppingBag, Sparkles, Tag, UserRound, X } from "lucide-react";
import { useShop } from "./ShopContext.jsx";
import { SearchBar } from "./components.jsx";
import { useCategories } from "./hooks/useProducts.js";

export default function Header() {
  const { cart, wishlist, user, logout, settings } = useShop();
  const { categories } = useCategories();
  const location = useLocation();
  const [panel, setPanel] = useState(null);
  const [scrolled, setScrolled] = useState(false);
  const dock = useRef(null);
  const collectionButton = useRef(null);
  const menuButton = useRef(null);
  const searchButton = useRef(null);
  const bagCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const isSale = location.pathname === "/sale" || location.pathname === "/products" && new URLSearchParams(location.search).get("sale") === "true";
  const isCatalog = (location.pathname === "/products" || location.pathname.startsWith("/products/")) && !isSale;
  const isCollection = location.pathname.startsWith("/categories/");
  const workspace = user?.role === "superadmin" ? "/super-admin" : user?.role === "admin" ? "/admin" : null;

  function closePanels() { setPanel(null); }
  function togglePanel(next) { setPanel((current) => current === next ? null : next); }

  useEffect(() => { setPanel(null); }, [location.pathname, location.search]);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 24);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  useEffect(() => {
    if (!panel) return;
    const outside = (event) => { if (!dock.current?.contains(event.target)) setPanel(null); };
    const escape = (event) => {
      if (event.key !== "Escape") return;
      setPanel(null);
      ({ collections: collectionButton, menu: menuButton, search: searchButton })[panel]?.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [panel]);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 901px)");
    const resize = () => setPanel(null);
    desktop.addEventListener("change", resize);
    return () => desktop.removeEventListener("change", resize);
  }, []);

  function navClass(active, extra = "") { return `signature-nav-link ${active ? "is-current" : ""} ${extra}`; }

  return <>
    <div className="topline signature-topline"><span><Sparkles size={12} />{settings.tagline}</span><Link to="/products">{settings.announcement}<ArrowUpRight size={13} /></Link></div>
    <div className={`navigation-dock ${scrolled ? "is-scrolled" : ""}`} ref={dock} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) closePanels(); }}>
      <header className="site-header signature-header">
        <button ref={menuButton} className={`signature-icon mobile-menu-toggle ${panel === "menu" ? "is-open" : ""}`} aria-label={panel === "menu" ? "Close navigation" : "Open navigation"} aria-expanded={panel === "menu"} aria-controls="mobile-navigation" onClick={() => togglePanel("menu")}>{panel === "menu" ? <X size={19} /> : <Menu size={19} />}</button>
        <Link className="brand signature-brand" to="/" onClick={closePanels} aria-label={`${settings.siteName} home`}><span className="brand-mark"><span className="brand-orbit" aria-hidden="true" /><Sparkles size={21} strokeWidth={1.7} /></span><span className="brand-lockup"><strong>{settings.siteName === "ShopSphere" ? <>shop<span>sphere</span></> : settings.siteName}</strong><small>EVERYDAY, CONSIDERED</small></span></Link>

        <nav className="signature-navigation" aria-label="Main navigation">
          <Link className={navClass(location.pathname === "/")} aria-current={location.pathname === "/" ? "page" : undefined} to="/"><Compass size={14} />Discover</Link>
          <Link className={navClass(isCatalog)} aria-current={isCatalog ? "page" : undefined} to="/products">Shop all</Link>
          <div className="collections-disclosure" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget) && panel === "collections") closePanels(); }}>
            <button ref={collectionButton} className={navClass(isCollection || panel === "collections", "collections-trigger")} aria-expanded={panel === "collections"} aria-controls="collections-navigation" onClick={() => togglePanel("collections")}>Collections<ChevronDown size={13} className={panel === "collections" ? "chevron-open" : ""} /></button>
            {panel === "collections" && <div className="collections-panel" id="collections-navigation"><div className="collections-panel-title"><span><span className="nav-kicker">A GOOD PLACE TO START</span><strong>Find your kind of good.</strong></span><span className="collection-panel-symbol"><LayoutGrid size={21} /></span></div><div className="collections-link-grid">{categories.slice(0, 8).map((category, index) => <Link to={`/categories/${category.slug}`} key={category.slug} onClick={closePanels} className="collection-nav-card"><span className="collection-nav-image">{category.image ? <img src={category.image} alt="" loading="lazy" /> : <LayoutGrid size={19} />}</span><span><small>COLLECTION {String(index + 1).padStart(2, "0")}</small><strong>{category.name}</strong></span><ArrowUpRight size={15} /></Link>)}</div><Link className="collections-panel-footer" to="/products" onClick={closePanels}><span>Good things, all in one place.</span><strong>Explore everything <ArrowRight size={14} /></strong></Link></div>}
          </div>
          <Link className={navClass(location.pathname === "/quick-delivery", "signature-quick-link")} to="/quick-delivery"><Zap size={13} fill="currentColor" />15-min</Link>
          {settings.saleEnabled && <Link className={navClass(isSale, "signature-sale-link")} aria-current={isSale ? "page" : undefined} to="/sale"><Tag size={13} />Mega sale<span className="nav-sale-dot" /></Link>}
        </nav>

        <div className="signature-actions"><Link className="signature-icon wallet-shortcut" to="/wallet" aria-label="Shop Wallet" title="Shop Wallet"><WalletCards size={18} /></Link><NotificationBell />
          <button ref={searchButton} className={`signature-icon ${panel === "search" ? "is-open" : ""}`} aria-label={panel === "search" ? "Close product search" : "Search products"} aria-expanded={panel === "search"} aria-controls="navigation-search" onClick={() => togglePanel("search")}><Search size={18} /></button>
          <Link className="signature-icon signature-wishlist" aria-label={`Wishlist${wishlist.length ? `, ${wishlist.length} saved items` : ""}`} to="/wishlist"><Heart size={18} />{wishlist.length > 0 && <span className="signature-count">{wishlist.length}</span>}</Link>
          <span className="signature-divider" aria-hidden="true" />
          {workspace && <Link className="signature-icon workspace-shortcut" title="Admin dashboard" aria-label="Admin dashboard" to={workspace}><ShieldCheck size={18} /></Link>}
          <Link className="signature-account" aria-label={user ? "Your account" : "Sign in"} to={user ? "/profile" : "/login"}><UserRound size={16} /><span>{user ? user.name.split(" ")[0] : "Sign in"}</span></Link>
          {user && <button className="signature-icon signature-logout" aria-label="Sign out" title="Sign out" onClick={logout}><LogOut size={16} /></button>}
          <Link className="signature-bag" to="/cart" aria-label={`Shopping bag, ${bagCount} ${bagCount === 1 ? "item" : "items"}`}><ShoppingBag size={17} /><span>Your bag</span><b key={bagCount}>{bagCount}</b></Link>
        </div>
      </header>

      {panel === "search" && <div className="navigation-search-panel" id="navigation-search"><div><span className="nav-kicker">FIND SOMETHING GOOD</span><button className="signature-icon" aria-label="Close search" onClick={() => { closePanels(); searchButton.current?.focus(); }}><X size={16} /></button></div><SearchBar autoFocus onSearch={closePanels} /><p>Try headphones, home essentials, or your next everyday favorite.</p></div>}

      {panel === "menu" && <nav id="mobile-navigation" className="mobile-navigation-panel" aria-label="Mobile navigation"><div className="mobile-nav-heading"><span className="nav-kicker">YOUR NEXT GOOD FIND STARTS HERE</span><Sparkles size={17} /></div><Link className={navClass(location.pathname === "/")} to="/" onClick={closePanels}><span><Compass size={17} />Discover</span><ArrowUpRight size={16} /></Link><Link className={navClass(isCatalog)} to="/products" onClick={closePanels}><span><ShoppingBag size={17} />Shop all finds</span><ArrowUpRight size={16} /></Link>{settings.saleEnabled && <Link className={navClass(isSale, "mobile-sale-link")} to="/sale" onClick={closePanels}><span><Tag size={17} />The sale edit</span><span className="mobile-sale-pill">GOOD PRICES</span></Link>}<div className="mobile-collection-heading">SHOP BY COLLECTION</div><div className="mobile-collection-grid">{categories.map((category) => <Link key={category.slug} to={`/categories/${category.slug}`} onClick={closePanels}>{category.name}<ArrowUpRight size={13} /></Link>)}</div><Link className="signature-nav-link" to="/quick-delivery" onClick={closePanels}><span><Zap size={17} />15-minute delivery</span><ArrowUpRight size={16} /></Link><div className="mobile-nav-utilities"><Link to="/wallet" onClick={closePanels}><WalletCards size={16} />Shop Wallet</Link><Link to={user ? "/profile" : "/login"} onClick={closePanels}><UserRound size={16} />{user ? "Your account" : "Sign in / Register"}</Link><Link to="/wishlist" onClick={closePanels}><Heart size={16} />Wishlist <span>{wishlist.length}</span></Link>{workspace && <Link to={workspace} onClick={closePanels}><ShieldCheck size={16} />Admin dashboard</Link>}{user && <button onClick={() => { closePanels(); logout(); }}><LogOut size={16} />Sign out</button>}</div></nav>}
    </div>
    {panel && <button className="navigation-backdrop" aria-label="Close navigation panel" tabIndex={-1} onClick={closePanels} />}
  </>;
}
