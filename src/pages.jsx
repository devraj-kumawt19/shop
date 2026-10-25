import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, ChevronRight, Heart, Minus, PackageCheck, Plus, ShieldCheck, ShoppingBag, SlidersHorizontal, Sparkles, Star, Tag, Truck } from "lucide-react";
import api, { getErrorMessage } from "./api.js";
import { categories } from "./data.js";
import { useCategories, useProduct, useProducts } from "./hooks/useProducts.js";
import { useMoney, useShop } from "./ShopContext.jsx";
import { ProductCard, ProductGrid, StatusMessage } from "./components.jsx";
import Reveal from "./Reveal.jsx";
import { formatMoney } from "../server/storeSettings.js";
import { payForOrder } from "./payment.js";

const orderTotalLabel = (orders) => { const totals = {}; for (const order of orders.filter((item) => !["cancelled", "awaiting_payment"].includes(item.status))) { const currency = order.currency || "USD"; totals[currency] = (totals[currency] || 0) + order.total; } return Object.entries(totals).map(([currency, total]) => formatMoney(total, currency)).join(" / ") || "-"; };
const subtotalFor = (cart) => cart.reduce((sum, item) => sum + Number(item.product.price) * item.quantity, 0);

export function HomePage() {
  const money = useMoney();
  const { settings } = useShop();
  const { products, loading, error } = useProducts({ featured: "true", limit: "8" });
  const saleProducts = useProducts({ sale: "true", limit: "4" });
  const collections = useCategories();
  const storefrontCategories = collections.categories;
  const spotlightCollection = storefrontCategories.find((category) => category.slug === "tech-audio") || storefrontCategories[0];
  const [activeCollection, setActiveCollection] = useState("");
  const featuredProducts = activeCollection ? products.filter((product) => product.categorySlug === activeCollection) : products;
  return (
    <main id="main-content">
      {settings.saleEnabled && (saleProducts.loading || saleProducts.products.length > 0) && <Link className="live-sale-bar" to="/products?sale=true"><span><Tag size={15} /> THE GOOD FINDS SALE</span><strong>{settings.saleTitle}</strong><span>Shop the offers <ArrowRight size={15} /></span></Link>}
      <section className="home-hero">
        <div className="hero-orbit orbit-one" aria-hidden="true" />
        <div className="hero-orbit orbit-two" aria-hidden="true" />
        <div className="hero-text">
          <div className="hero-announcement"><span className="announcement-dot" /> YOUR EVERYDAY, REIMAGINED <Sparkles size={14} /></div>
          <h1>{settings.heroHeading.split("\n").map((line, index) => <span key={index}>{line}<br /></span>)}<em>{settings.heroAccent}</em></h1>
          <p>{settings.heroDescription}</p>
          <div className="hero-cta-row"><Link to={settings.saleEnabled ? "/products?sale=true" : "/products"} className="button button-dark">{settings.saleEnabled ? "Shop the sale" : "Explore the shop"} <ArrowRight size={18} /></Link><a className="button button-outline" href="#collections">Find your collection <ChevronRight size={17} /></a></div>
          <div className="hero-proof"><span className="proof-icon"><ShieldCheck size={22} /></span><span><b>Thoughtfully picked. Effortlessly loved.</b><small>Quality essentials. Easy returns. Everyday joy.</small></span></div>
        </div>
        <div className="hero-showcase">
          <div className="showcase-dots" aria-hidden="true" />
          <Link className="showcase-main" to="/products">
            <div className="showcase-top"><span><span className="mini-dot" /> THE EVERYDAY EDIT</span><span>01 / 04</span></div>
            <img src={settings.heroImage} alt={`${settings.siteName} featured collection`} fetchpriority="high" />
            <div className="showcase-bottom"><span><small>YOUR SPACE, YOUR WAY</small><strong>Make yourself at home.</strong></span><span className="round-arrow"><ArrowRight size={21} /></span></div>
          </Link>
          <Link className="floating-product" to={spotlightCollection ? `/categories/${spotlightCollection.slug}` : "/products"}><img src={spotlightCollection?.image || settings.heroImage} alt={spotlightCollection?.name || "Featured collection"} /><div><span className="eyebrow">A LITTLE EVERYDAY UPGRADE</span><strong>{spotlightCollection?.name || "Find your favorite."}</strong><span>Explore collection <ArrowRight size={13} /></span></div></Link>
          <div className="floating-note"><span className="note-icon"><ShoppingBag size={20} /></span><span><strong>Your next favorite is here.</strong><small>A little discovery. A lot to love.</small></span><Sparkles size={18} /></div>
          <span className="showcase-caption"><span /> CURATED FOR THE WAY YOU LIVE</span>
        </div>
      </section>
      {settings.saleEnabled && (saleProducts.loading || saleProducts.products.length > 0) && <Reveal className="sale-section page-width"><div className="section-heading"><div><span className="eyebrow"><Tag size={14} /> THE SALE EDIT</span><h2>{settings.saleTitle}</h2><p>{settings.saleDescription}</p></div><Link className="button button-sale" to="/products?sale=true">All sale finds <ArrowRight size={16} /></Link></div><ProductGrid products={saleProducts.products} loading={saleProducts.loading} error={saleProducts.error} /></Reveal>}
      <section className="benefit-strip">
        <div><Truck /><span><b>Free shipping over {money(settings.freeShippingThreshold)}</b><small>Good things, delivered</small></span></div>
        <div><ShieldCheck /><span><b>Good things, chosen well</b><small>Thoughtful quality, every time</small></span></div>
        <div><PackageCheck /><span><b>30 days to decide</b><small>Easy returns, no hard feelings</small></span></div>
        <div><Heart /><span><b>Made for your everyday</b><small>Small details. Big difference.</small></span></div>
      </section>
      <Reveal className="category-section page-width" id="collections">
        <div className="section-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> SOMETHING FOR EVERY SIDE OF YOU</span><h2>Find your kind of <em>good.</em></h2><p>Four collections. Endless little possibilities.</p></div><Link className="subtle-link" to="/products">Explore all collections <ArrowRight size={16} /></Link></div>
        <div className="category-grid">
          {storefrontCategories.map((category, index) => <Link to={`/categories/${category.slug}`} className={`category-tile ${category.tone || ""}`} key={category.slug}><div className="category-image"><img src={category.image || categories.find((item) => item.slug === category.slug)?.image || ""} alt={category.name} loading="lazy" /><span className="collection-number">0{index + 1}</span></div><div className="category-copy"><small>{["A SPACE TO BE YOU", "YOUR DAILY SOUNDTRACK", "GO PLACES, BEAUTIFULLY", "YOUR MOMENT TO RESET"][index % 4]}</small><h3>{category.name}</h3><span className="category-arrow"><ArrowRight size={18} /></span></div></Link>)}
        </div>
        {collections.error && <StatusMessage>{collections.error}</StatusMessage>}
      </Reveal>
      <Reveal className="featured-section page-width">
        <div className="section-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> THE GOOD STUFF, ALL IN ONE PLACE</span><h2>Meet your next <em>favorite.</em></h2><p>Everyday essentials with a little something extra.</p></div><Link className="subtle-link" to="/products">Shop all finds <ArrowRight size={16} /></Link></div>
        <div className="collection-tabs" role="group" aria-label="Filter featured products by collection"><button type="button" aria-pressed={!activeCollection} className={!activeCollection ? "active" : ""} onClick={() => setActiveCollection("")}><Sparkles size={14} /> All favorites</button>{storefrontCategories.map((category) => <button type="button" key={category.slug} aria-pressed={activeCollection === category.slug} className={activeCollection === category.slug ? "active" : ""} onClick={() => setActiveCollection(category.slug)}>{category.name}</button>)}</div>
        <ProductGrid products={featuredProducts} loading={loading} error={error} emptyMessage="New favorites are on their way." />
      </Reveal>
      <Reveal className="editorial-banner page-width">
        <div><span className="eyebrow"><Sparkles size={15} /> LITTLE UPGRADES. BIG EVERYDAY ENERGY.</span><h2>A better everyday<br />starts with <em>you.</em></h2><p>Slow mornings. Fresh spaces. Your favorite soundtrack. Find the little things that make life feel a little more yours.</p><Link to="/products" className="button button-light">Discover something good <ArrowRight size={17} /></Link><span className="editorial-note"><Check size={14} /> Considered details. Lasting favorites.</span></div>
        <div className="editorial-image"><img src="https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&w=1100&q=85" alt="Soft morning light on an inviting home interior" loading="lazy" /></div>
      </Reveal>
    </main>
  );
}

export function ProductsPage() {
  const money = useMoney();
  const location = useLocation();
  const { categories: storefrontCategories } = useCategories();
  const { category } = useParams();
  const query = new URLSearchParams(location.search);
  const search = query.get("search") || "";
  const [sort, setSort] = useState("featured");
  const [categoryFilter, setCategoryFilter] = useState(category || "");
  const { products, loading, error } = useProducts({ category: categoryFilter, search, sale: query.get("sale") === "true" ? "true" : "", limit: "100" });
  useEffect(() => setCategoryFilter(category || ""), [category]);
  const sorted = useMemo(() => [...products].sort((a, b) => {
    if (sort === "price-low") return a.price - b.price;
    if (sort === "price-high") return b.price - a.price;
    if (sort === "rating") return b.rating - a.rating;
    return Number(b.featured) - Number(a.featured);
  }), [products, sort]);
  const title = query.get("sale") === "true" ? "A little sale. A lot to love." : category ? storefrontCategories.find((item) => item.slug === category)?.name || "Shop by category" : search ? `Results for “${search}”` : "A few good finds.";
  return (
    <main id="main-content" className="catalog-page page-width">
      <div className="breadcrumbs"><Link to="/">Home</Link><ChevronRight size={13} /><span>{category ? "Collections" : "Shop"}</span></div>
      <div className="catalog-intro"><span className="eyebrow">{search ? "A GOOD FIND IS CLOSER THAN YOU THINK" : "THOUGHTFULLY PICKED FOR REAL LIFE"}</span><h1>{title}</h1><p>Well-made essentials, lovely little upgrades, and pieces you’ll be glad to have around.</p></div>
      <div className="catalog-toolbar"><span>{loading ? "Finding good things..." : `${products.length} thoughtful finds`}</span><label><SlidersHorizontal size={15} /><span>Sort by</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="featured">Featured</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="rating">Top rated</option></select></label></div>
      {!category && <div className="filter-pills"><Link className={!categoryFilter ? "active" : ""} to="/products">All finds</Link>{storefrontCategories.map((item) => <Link className={categoryFilter === item.slug ? "active" : ""} key={item.slug} to={`/categories/${item.slug}`}>{item.name}</Link>)}</div>}
      <ProductGrid products={sorted} loading={loading} error={error} emptyMessage="No finds for that search." />
    </main>
  );
}

export function ProductDetailPage() {
  const money = useMoney();
  const { id } = useParams();
  const { product, loading, error } = useProduct(id);
  const { addToCart, wishlist, toggleWishlist, settings } = useShop();
  const [quantity, setQuantity] = useState(1);
  const recommendations = useProducts({ featured: "true" });
  if (loading) return <main id="main-content" className="page-width detail-loading"><div className="skeleton-card" /><div className="skeleton-card" /></main>;
  if (!product) return <main id="main-content" className="page-width empty-state"><h1>We couldn’t find that one.</h1><Link className="button button-dark" to="/products">Back to the shop</Link></main>;
  const isSaved = wishlist.some((item) => item._id === product._id);
  return (
    <main id="main-content" className="page-width product-detail-page">
      <div className="breadcrumbs"><Link to="/">Home</Link><ChevronRight size={13} /><Link to="/products">Shop</Link><ChevronRight size={13} /><span>{product.name}</span></div>
      {error && <StatusMessage>{error}</StatusMessage>}
      <div className="product-detail">
        <div className="detail-image"><img src={product.image} alt={product.name} /><span className="detail-image-label">A GOOD FIND, UP CLOSE</span></div>
        <div className="detail-info"><span className="eyebrow">{product.category} / THOUGHTFULLY SELECTED</span><h1>{product.name}</h1><div className="detail-rating"><span><Star size={14} fill="currentColor" /> {Number(product.rating).toFixed(1)}</span><span>{product.reviewCount || 0} happy reviews</span></div><div className="detail-price">{money(product.price)} {product.compareAtPrice > product.price && <del>{money(product.compareAtPrice)}</del>}</div><p className="detail-description">{product.description}</p><div className={product.stock > 0 ? "stock-line" : "stock-line stock-unavailable"}><span className="stock-dot" /> {product.stock > 0 ? `In stock — ${product.stock} ready to ship` : "Currently out of stock"}</div><div className="purchase-row"><div className="quantity-control"><button aria-label="Decrease quantity" disabled={product.stock < 1} onClick={() => setQuantity(Math.max(1, quantity - 1))}><Minus size={14} /></button><span>{quantity}</span><button aria-label="Increase quantity" disabled={product.stock < 1} onClick={() => setQuantity(Math.min(product.stock || 1, quantity + 1))}><Plus size={14} /></button></div><button className="button button-dark add-detail" disabled={product.stock < 1} onClick={() => addToCart(product, quantity)}>{product.stock > 0 ? <>Add to bag <ShoppingBag size={17} /></> : "Out of stock"}</button><button className={isSaved ? "detail-heart is-favorite" : "detail-heart"} aria-label={isSaved ? "Remove from wishlist" : "Add to wishlist"} onClick={() => toggleWishlist(product)}><Heart size={19} fill={isSaved ? "currentColor" : "none"} /></button></div><div className="detail-promises"><div><Truck size={18} /><span><b>Free shipping over {money(settings.freeShippingThreshold)}</b><small>Delivered with care</small></span></div><div><ShieldCheck size={18} /><span><b>30-day easy returns</b><small>Love it or send it back</small></span></div></div></div>
      </div>
      <section className="related-section"><div className="section-heading"><div><span className="eyebrow">MORE TO LOVE</span><h2>Good together.</h2></div><Link className="subtle-link" to="/products">Shop all <ArrowRight size={15} /></Link></div><ProductGrid products={recommendations.products.filter((item) => item._id !== product._id).slice(0, 4)} loading={recommendations.loading} error={recommendations.error} /></section>
    </main>
  );
}

export function CartPage() {
  const money = useMoney();
  const { cart, updateQuantity, settings } = useShop();
  const subtotal = subtotalFor(cart);
  if (!cart.length) return <main id="main-content" className="page-width empty-state cart-empty"><span className="empty-icon"><ShoppingBag /></span><span className="eyebrow">YOUR BAG IS TAKING A BREATHER</span><h1>Nothing in here<br />just <em>yet.</em></h1><p>Good things are just a browse away.</p><Link className="button button-dark" to="/products">Find something good <ArrowRight size={16} /></Link></main>;
  return (
    <main id="main-content" className="page-width cart-page"><div className="breadcrumbs"><Link to="/">Home</Link><ChevronRight size={13} /><span>Your bag</span></div><div className="cart-heading"><div><span className="eyebrow">THE GOOD STUFF</span><h1>Your bag<span className="item-count"> ({cart.reduce((n, item) => n + item.quantity, 0)})</span></h1></div><Link to="/products" className="subtle-link"><ArrowLeft size={15} /> Keep browsing</Link></div><div className="cart-layout"><div className="cart-items">{cart.map(({ product, quantity }) => <article className="cart-item" key={product._id}><Link to={`/products/${product._id}`} className="cart-item-image"><img src={product.image} alt={product.name} /></Link><div className="cart-item-info"><span className="product-category">{product.category}</span><Link to={`/products/${product._id}`} className="product-name">{product.name}</Link><span className="cart-unit-price">{money(product.price)}</span><div className="quantity-control"><button aria-label={`Decrease ${product.name} quantity`} onClick={() => updateQuantity(product._id, quantity - 1)}><Minus size={13} /></button><span>{quantity}</span><button aria-label={`Increase ${product.name} quantity`} onClick={() => updateQuantity(product._id, quantity + 1)}><Plus size={13} /></button></div><button className="remove-link" onClick={() => updateQuantity(product._id, 0)}>Remove</button></div><strong className="cart-line-total">{money(product.price * quantity)}</strong></article>)}</div><aside className="order-summary"><h2>Good choice.</h2><p className="summary-caption">Here’s the little breakdown.</p><div className="summary-line"><span>Subtotal</span><span>{money(subtotal)}</span></div><div className="summary-line"><span>Shipping</span><span>{subtotal >= settings.freeShippingThreshold ? "On us" : money(settings.shippingFee)}</span></div><div className="summary-line summary-total"><span>Total</span><strong>{money(subtotal + (subtotal >= settings.freeShippingThreshold ? 0 : settings.shippingFee))}</strong></div><p className="shipping-note"><Truck size={15} /> {subtotal >= settings.freeShippingThreshold ? "You’ve unlocked free shipping!" : `${money(settings.freeShippingThreshold - subtotal)} away from free shipping`}</p><Link className="button button-dark checkout-button" to="/checkout">Checkout <ArrowRight size={16} /></Link><p className="payment-note"><ShieldCheck size={14} /> Secure checkout - Online or pay on delivery</p></aside></div></main>
  );
}

export function WishlistPage() {
  const { wishlist } = useShop();
  return <main id="main-content" className="page-width wishlist-page"><div className="breadcrumbs"><Link to="/">Home</Link><ChevronRight size={13} /><span>Your wishlist</span></div><div className="section-heading"><div><span className="eyebrow">SAVED FOR A GOOD DAY</span><h1>Your <em>wishlist.</em></h1></div><span className="wishlist-count">{wishlist.length} saved {wishlist.length === 1 ? "find" : "finds"}</span></div><ProductGrid products={wishlist} loading={false} emptyMessage="Your wishlist is a blank canvas." /></main>;
}

export { default as AuthPage } from "./AuthPage.jsx";

export function RequireAuth({ children, admin = false, superAdmin = false }) {
  const { user } = useShop();
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: `${location.pathname}${location.search}${location.hash}` }} replace />;
  if ((admin && !["admin", "superadmin"].includes(user.role)) || (superAdmin && user.role !== "superadmin")) return <main id="main-content" className="page-width empty-state"><span className="eyebrow">RESTRICTED ACCESS</span><h1>{superAdmin ? "Super admin" : "Admin"} access only.</h1><p>Sign in with an authorized account to manage the website.</p><Link to="/" className="button button-dark">Back to the shop</Link></main>;
  return children;
}

export { default as CheckoutPage } from "./CheckoutPage.jsx";

export function OrdersPage() {
  const money = useMoney();
  const { user } = useShop();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    api.get("/orders/mine").then(({ data }) => setOrders(data.orders)).catch((requestError) => setError(getErrorMessage(requestError))).finally(() => setLoading(false));
  }, []);
  return <RequireAuth><main id="main-content" className="page-width account-page"><div className="breadcrumbs"><Link to="/">Home</Link><ChevronRight size={13} /><span>Your orders</span></div><div className="section-heading"><div><span className="eyebrow">THE GOOD THINGS YOU’VE FOUND</span><h1>Order <em>history.</em></h1></div><span className="account-greeting">Hi, {user?.name.split(" ")[0]}</span></div>{error && <StatusMessage tone="error">{error}</StatusMessage>}{loading ? <div className="skeleton-card" /> : orders.length ? <div className="orders-list">{orders.map((order) => <Link to={`/my-orders/${order._id}`} className="order-card order-card-link" key={order._id}><div className="order-card-heading"><span>ORDER {order.orderNumber}</span><span className={`order-status status-${order.status}`}>{order.status.replaceAll("_", " ")}</span><span>{new Date(order.createdAt).toLocaleDateString()}</span><strong>{money(order.total, order.currency || "USD")}</strong></div><div className="order-card-items">{order.items.map((item, index) => <span key={`${order._id}-${index}`}>{item.name} <small>× {item.quantity}</small></span>)}</div><span className="order-detail-link">View order details <ArrowRight size={13} /></span></Link>)}</div> : <div className="empty-state compact-empty"><PackageCheck /><h2>Your next good find is out there.</h2><p>When you place an order, it’ll show up here.</p><Link className="button button-dark" to="/products">Explore the shop</Link></div>}</main></RequireAuth>;
}

export function OrderDetailsPage() {
  const money = useMoney();
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false);
  async function retryPayment() { setPaying(true); setError(""); try { setOrder(await payForOrder(id)); } catch (error) { setError(error.response ? getErrorMessage(error) : error.message); } finally { setPaying(false); } }
  useEffect(() => {
    api.get(`/orders/${encodeURIComponent(id)}`)
      .then(({ data }) => setOrder(data.order))
      .catch((requestError) => setError(getErrorMessage(requestError)))
      .finally(() => setLoading(false));
  }, [id]);
  return <RequireAuth><main id="main-content" className="page-width account-page"><div className="breadcrumbs"><Link to="/">Home</Link><ChevronRight size={13} /><Link to="/my-orders">Your orders</Link><ChevronRight size={13} /><span>Order details</span></div>{loading ? <div className="skeleton-card order-detail-loading" /> : order ? <><div className="cart-heading"><div><span className="eyebrow">ORDER {order.orderNumber}</span><h1>{order.status === "awaiting_payment" ? <>Complete your <em>payment.</em></> : order.status === "cancelled" ? <>Order <em>cancelled.</em></> : <>Your order is <em>{order.status}.</em></>}</h1></div><span className={`order-status status-${order.status}`}>{order.status}</span></div>{error && <StatusMessage tone="error">{error}</StatusMessage>}{order.paymentStatus === "refund_required" && <StatusMessage tone="error">Payment was received but this order cannot be fulfilled. Contact the store for a refund review. A refund has not been issued automatically.</StatusMessage>}{order.status === "awaiting_payment" && <div className="order-payment-action"><StatusMessage>Your online payment is pending. This order will be confirmed after successful payment verification.</StatusMessage><button className="button button-dark" disabled={paying} onClick={retryPayment}>{paying ? "Opening payment..." : "Pay securely with Razorpay"}</button></div>}<div className="order-detail-layout"><section className="order-detail-items"><h2>Your good things</h2>{order.items.map((item, index) => <div className="order-detail-item" key={`${order._id}-${index}`}><img src={item.image} alt="" /><span>{item.name}<small>Quantity: {item.quantity}</small></span><strong>{money(item.price * item.quantity, order.currency || "USD")}</strong></div>)}</section><aside className="order-summary"><h2>Order summary</h2><p className="summary-caption">Placed {new Date(order.createdAt).toLocaleDateString()}</p><div className="summary-line"><span>Subtotal</span><span>{money(order.subtotal, order.currency || "USD")}</span></div><div className="summary-line"><span>Shipping</span><span>{order.shipping ? money(order.shipping, order.currency || "USD") : "On us"}</span></div><div className="summary-line"><span>Payment</span><span>{order.paymentMethod === "razorpay" ? `Online - ${order.paymentStatus}` : "Cash on delivery"}</span></div><div className="summary-line summary-total"><span>Total</span><strong>{money(order.total, order.currency || "USD")}</strong></div><h3 className="shipping-address-heading">Shipping to</h3><p className="shipping-address">{order.shippingAddress.firstName} {order.shippingAddress.lastName}<br />{order.shippingAddress.street}<br />{order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.postalCode}<br />{order.shippingAddress.phone}</p></aside></div></> : <StatusMessage tone="error">{error || "Order not found."}</StatusMessage>}</main></RequireAuth>;
}

export function ProfilePage() {
  const { user, refreshUser } = useShop();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { refreshUser(); }, [refreshUser]);
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api.patch("/auth/profile", Object.fromEntries(new FormData(event.currentTarget)));
      refreshUser();
      setNotice("Your profile is all up to date.");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }
  return <RequireAuth><main id="main-content" className="page-width account-page profile-page"><div className="breadcrumbs"><Link to="/">Home</Link><ChevronRight size={13} /><span>Your account</span></div><div className="section-heading"><div><span className="eyebrow">A LITTLE SPACE THAT’S YOURS</span><h1>Hello, <em>{user?.name.split(" ")[0]}.</em></h1></div><Link to="/my-orders" className="subtle-link">Your orders <ArrowRight size={15} /></Link></div><div className="profile-card"><div className="profile-avatar">{user?.name?.charAt(0).toUpperCase()}</div><div><span className="eyebrow">YOUR DETAILS</span><h2>Make yourself at home.</h2><p>Update the details we use to make your ShopSphere experience yours.</p></div></div>{notice && <StatusMessage tone="success">{notice}</StatusMessage>}{error && <StatusMessage tone="error">{error}</StatusMessage>}<form className="profile-form form-stack" onSubmit={submit}><label>Your name<input name="name" defaultValue={user?.name} minLength="2" required /></label><label>Email address<input name="email" type="email" defaultValue={user?.email} required /></label><button className="button button-dark" disabled={saving}>{saving ? "Saving..." : "Save your details"} <Check size={16} /></button></form></main></RequireAuth>;
}

export function AdminPage({ embedded = false, initialTab = "products" }) {
  const money = useMoney();
  const AdminContainer = embedded ? "section" : "main";
  const [products, setProducts] = useState([]);
  const [categoryItems, setCategoryItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState(initialTab);
  const [formOpen, setFormOpen] = useState(false);
  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);

  async function loadDashboard() {
    try {
      const [productResult, orderResult, categoryResult] = await Promise.all([
        api.get("/admin/products"), api.get("/admin/orders"), api.get("/admin/categories"),
      ]);
      setProducts(productResult.data.products);
      setOrders(orderResult.data.orders);
      setCategoryItems(categoryResult.data.categories);
      setError("");
    } catch (requestError) { setError(getErrorMessage(requestError)); }
  }
  useEffect(() => { loadDashboard(); }, []);

  async function saveProduct(event) {
    event.preventDefault();
    setBusy(true);
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const chosenCategory = categoryItems.find((item) => item.slug === form.category);
    const payload = {
      ...form,
      price: Number(form.price),
      compareAtPrice: Number(form.compareAtPrice || 0),
      stock: Number(form.stock),
      featured: form.featured === "on",
      isDemo: form.isDemo === "on",
      category: chosenCategory?.name || form.category,
      categorySlug: form.category,
    };
    try {
      if (editing) await api.patch(`/admin/products/${editing._id}`, payload);
      else await api.post("/admin/products", payload);
      setNotice(editing ? "Product updated." : "Product added.");
      setEditing(null);
      setFormOpen(false);
      await loadDashboard();
    } catch (requestError) { setError(getErrorMessage(requestError)); }
    finally { setBusy(false); }
  }

  async function deleteProduct(product) {
    if (!window.confirm(`Remove ${product.name} from the store?`)) return;
    try {
      await api.delete(`/admin/products/${product._id}`);
      setNotice("Product removed.");
      await loadDashboard();
    } catch (requestError) { setError(getErrorMessage(requestError)); }
  }

  async function changeOrderStatus(orderId, status) {
    try {
      await api.patch(`/admin/orders/${orderId}`, { status });
      setNotice("Order status updated.");
      await loadDashboard();
    } catch (requestError) { setError(getErrorMessage(requestError)); }
  }

  async function retryEmails(orderId) { setBusy(true); setError(""); try { const { data } = await api.post(`/admin/orders/${orderId}/notifications`); setNotice(data.message); await loadDashboard(); } catch (error) { setError(getErrorMessage(error)); } finally { setBusy(false); } }

  async function saveCategory(event) {
    event.preventDefault();
    setBusy(true);
    const form = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (editingCategory) await api.patch(`/admin/categories/${editingCategory._id}`, form);
      else await api.post("/admin/categories", form);
      setNotice(editingCategory ? "Category updated." : "Category added.");
      setCategoryFormOpen(false);
      setEditingCategory(null);
      await loadDashboard();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function deleteCategory(category) {
    if (!window.confirm(`Remove the ${category.name} category?`)) return;
    try {
      await api.delete(`/admin/categories/${category._id}`);
      setNotice("Category removed.");
      await loadDashboard();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  }

  return (
    <RequireAuth admin>
      <AdminContainer id={embedded ? undefined : "main-content"} className={embedded ? "admin-page admin-embedded" : "page-width admin-page"}>
        <div className="breadcrumbs"><Link to="/">Home</Link><ChevronRight size={13} /><span>Admin</span></div>
        <div className="section-heading"><div><span className="eyebrow">THE SHOP, BEHIND THE SCENES</span><h1>ShopSphere <em>studio.</em></h1></div></div>
        {error && <StatusMessage tone="error">{error}</StatusMessage>}
        {notice && <StatusMessage tone="success">{notice}</StatusMessage>}
        <div className="admin-stats"><div><span>PRODUCTS</span><b>{products.length}</b></div><div><span>CATEGORIES</span><b>{categoryItems.length}</b></div><div><span>ACTIVE ORDER VALUE</span><b>{orderTotalLabel(orders)}</b></div></div>
        <div className="admin-toolbar">
          <div className="admin-tabs">
            <button className={tab === "products" ? "active" : ""} onClick={() => setTab("products")}>Products</button>
            <button className={tab === "categories" ? "active" : ""} onClick={() => setTab("categories")}>Categories</button>
            <button className={tab === "orders" ? "active" : ""} onClick={() => setTab("orders")}>Orders</button>
          </div>
          {tab === "products" && <button className="button button-dark" onClick={() => { setEditing(null); setFormOpen(!formOpen); }}>+ Add product</button>}
          {tab === "categories" && <button className="button button-dark" onClick={() => { setEditingCategory(null); setCategoryFormOpen(!categoryFormOpen); }}>+ Add category</button>}
        </div>
        {formOpen && tab === "products" && <form key={editing?._id || "new-product"} className="admin-product-form" onSubmit={saveProduct}>
          <h2>{editing ? "Edit product" : "Add a thoughtful find"}</h2>
          <div className="form-grid">
            <label>Product name<input name="name" defaultValue={editing?.name} required /></label>
            <label>Category<select name="category" defaultValue={categoryItems.find((item) => item.name === editing?.category)?.slug || ""} required><option value="" disabled>Choose a category</option>{categoryItems.map((item) => <option value={item.slug} key={item._id}>{item.name}</option>)}</select></label>
            <label>Price<input name="price" type="number" step=".01" min=".01" defaultValue={editing?.price} required /></label>
            <label>Compare at<input name="compareAtPrice" type="number" step=".01" min="0" defaultValue={editing?.compareAtPrice || 0} /></label>
            <label>Stock<input name="stock" type="number" min="0" defaultValue={editing?.stock || 0} required /></label>
            <label>Badge<input name="badge" defaultValue={editing?.badge} placeholder="BESTSELLER" /></label>
          </div>
          <label>Image URL<input name="image" type="url" defaultValue={editing?.image} required /></label>
          <label>Description<textarea name="description" rows="3" defaultValue={editing?.description} required /></label>
          <label className="check-field"><input name="featured" type="checkbox" defaultChecked={editing?.featured} /> Show on homepage featured products</label>
          <label className="check-field"><input name="isDemo" type="checkbox" defaultChecked={editing?.isDemo} /> Demo product (test payments only)</label>
          <div className="admin-form-actions"><button type="button" className="button button-quiet" onClick={() => { setEditing(null); setFormOpen(false); }}>Cancel</button><button className="button button-dark" disabled={busy}>{busy ? "Saving..." : editing ? "Save changes" : "Create product"}</button></div>
        </form>}
        {categoryFormOpen && tab === "categories" && <form key={editingCategory?._id || "new-category"} className="admin-product-form" onSubmit={saveCategory}>
          <h2>{editingCategory ? "Edit collection" : "Add a collection"}</h2>
          <div className="form-grid"><label>Category name<input name="name" defaultValue={editingCategory?.name} required minLength="2" /></label><label>URL slug<input name="slug" defaultValue={editingCategory?.slug} placeholder="auto-created-from-name" /></label></div>
          <label>Image URL<input name="image" type="url" defaultValue={editingCategory?.image} placeholder="https://..." /></label>
          <label>Description<input name="description" defaultValue={editingCategory?.description} /></label>
          <div className="admin-form-actions"><button type="button" className="button button-quiet" onClick={() => { setCategoryFormOpen(false); setEditingCategory(null); }}>Cancel</button><button className="button button-dark" disabled={busy}>{busy ? "Saving..." : editingCategory ? "Save category" : "Create category"}</button></div>
        </form>}
        {tab === "products" && <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>PRODUCT</th><th>CATEGORY</th><th>PRICE</th><th>STOCK</th><th>ACTIONS</th></tr></thead><tbody>{products.map((product) => <tr key={product._id}><td><div className="admin-product-name"><img src={product.image} alt="" /><span>{product.name}</span></div></td><td>{product.category}</td><td>{money(product.price)}</td><td>{product.stock}</td><td><button onClick={() => { setEditing(product); setFormOpen(true); window.scrollTo({ top: 500, behavior: "smooth" }); }}>Edit</button><button className="delete-button" onClick={() => deleteProduct(product)}>Delete</button></td></tr>)}</tbody></table>{!products.length && <p className="admin-empty">No products yet. Create your first one above.</p>}</div>}
        {tab === "categories" && <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>CATEGORY</th><th>URL SLUG</th><th>DESCRIPTION</th><th>ACTIONS</th></tr></thead><tbody>{categoryItems.map((category) => <tr key={category._id}><td>{category.name}</td><td>{category.slug}</td><td>{category.description || "—"}</td><td><button onClick={() => { setEditingCategory(category); setCategoryFormOpen(true); window.scrollTo({ top: 500, behavior: "smooth" }); }}>Edit</button><button className="delete-button" onClick={() => deleteCategory(category)}>Delete</button></td></tr>)}</tbody></table>{!categoryItems.length && <p className="admin-empty">No categories yet. Create a collection above.</p>}</div>}
        {tab === "orders" && <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>TOTAL</th><th>PAYMENT</th><th>STATUS</th></tr></thead><tbody>{orders.map((order) => <tr key={order._id}><td>{order.orderNumber}</td><td>{order.user?.name || order.shippingAddress.firstName}</td><td>{money(order.total, order.currency || "USD")}</td><td><span>{order.paymentMethod === "razorpay" ? `Online - ${order.paymentStatus || "pending"}` : "Cash on delivery"}</span><small className="admin-email-status">Email: {order.emailStatus?.customer || "not_queued"}</small><button disabled={busy || order.status === "awaiting_payment"} onClick={() => retryEmails(order._id)}>Retry unsent emails</button></td><td><select disabled={order.status === "awaiting_payment" || order.paymentStatus === "refund_required"} value={order.status} onChange={(event) => changeOrderStatus(order._id, event.target.value)}><option value="awaiting_payment" disabled>Awaiting payment</option><option value="placed">Placed</option><option value="processing">Processing</option><option value="shipped">Shipped</option><option value="delivered">Delivered</option><option value="cancelled">Cancelled</option></select></td></tr>)}</tbody></table>{!orders.length && <p className="admin-empty">Orders will show up here when customers check out.</p>}</div>}
      </AdminContainer>
    </RequireAuth>
  );
}

export function NotFoundPage() {
  return <main id="main-content" className="page-width empty-state not-found"><span className="eyebrow">WELL, THIS IS AWKWARD</span><h1>That page took<br />a little <em>detour.</em></h1><p>We couldn’t find what you were looking for.</p><Link className="button button-dark" to="/">Back to ShopSphere <ArrowRight size={16} /></Link></main>;
}
