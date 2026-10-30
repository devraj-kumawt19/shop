import { MarketplaceStrip } from "./DealsPage.jsx";
import { OrderExtras } from "./CommerceWidgets.jsx";
import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowUpRight, ArrowLeft, ArrowRight, Camera, Check, ChevronRight, Heart, LoaderCircle, Mail, Minus, PackageCheck, Plus, ShieldCheck, ShoppingBag, SlidersHorizontal, Sparkles, Star, Tag, Trash2, Truck, UserRound } from "lucide-react";
import api, { getErrorMessage } from "./api.js";
import { categories } from "./data.js";
import { useCategories, useProduct, useProducts } from "./hooks/useProducts.js";
import { useMoney, useShop } from "./ShopContext.jsx";
import { ProductCard, ProductGrid, StatusMessage } from "./components.jsx";
import Reveal from "./Reveal.jsx";
import { payForOrder } from "./payment.js";

const subtotalFor = (cart) => cart.reduce((sum, item) => sum + Number(item.product.price) * item.quantity, 0);

async function prepareProfilePhoto(file) {
  const maxInputBytes = 5 * 1024 * 1024;
  const maxOutputBytes = 180 * 1024;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Choose a JPG, PNG, or WebP photo.");
  }
  if (file.size > maxInputBytes) throw new Error("Choose a photo smaller than 5 MB.");

  const bitmap = await createImageBitmap(file);
  try {
    const maxDimension = 512;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser couldn't prepare this photo. Try another image.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    for (const quality of [0.84, 0.72, 0.6, 0.48]) {
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Your browser couldn't prepare this photo. Try another image.")), "image/jpeg", quality);
      });
      if (blob.size > maxOutputBytes) continue;
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Your browser couldn't read this photo. Try another image."));
        reader.onerror = () => reject(new Error("Your browser couldn't read this photo. Try another image."));
        reader.readAsDataURL(blob);
      });
    }
    throw new Error("This photo is still too large. Try a smaller image.");
  } finally {
    bitmap.close();
  }
}

export function HomePage() {
  const money = useMoney();
  const { settings, settingsError } = useShop();
  const { products, loading, error } = useProducts({ featured: "true", limit: "8" });
  const saleProducts = useProducts({ sale: "true", limit: "4" });
  const collections = useCategories();
  const storefrontCategories = collections.categories;
  const spotlightCollection = storefrontCategories.find((category) => category.slug === "tech-audio") || storefrontCategories[0];
  const [activeCollection, setActiveCollection] = useState("");
  const featuredProducts = activeCollection ? products.filter((product) => product.categorySlug === activeCollection) : products;
  return (
    <main id="main-content">
      {settings.saleEnabled && (saleProducts.loading || saleProducts.products.length > 0) && <Link className="live-sale-bar" to="/sale"><span><Tag size={15} /> THE GOOD FINDS SALE</span><strong>{settings.saleTitle}</strong><span>Shop the offers <ArrowRight size={15} /></span></Link>}
      <MarketplaceStrip />
      <section className="home-hero">
        <div className="hero-orbit orbit-one" aria-hidden="true" />
        <div className="hero-orbit orbit-two" aria-hidden="true" />
        <div className="hero-text">
          <div className="hero-announcement"><span className="announcement-dot" /> YOUR EVERYDAY, REIMAGINED <Sparkles size={14} /></div>
          <h1>{settings.heroHeading.split("\n").map((line, index) => <span key={index}>{line}<br /></span>)}<em>{settings.heroAccent}</em></h1>
          <p>{settings.heroDescription}</p>
          <div className="hero-cta-row"><Link to={settings.saleEnabled ? "/sale" : "/products"} className="button button-dark">{settings.saleEnabled ? "Shop the sale" : "Explore the shop"} <ArrowRight size={18} /></Link><a className="button button-outline" href="#collections">Find your collection <ChevronRight size={17} /></a></div>
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
      {settings.saleEnabled && (saleProducts.loading || saleProducts.products.length > 0) && <Reveal className="sale-section page-width"><div className="section-heading"><div><span className="eyebrow"><Tag size={14} /> THE SALE EDIT</span><h2>{settings.saleTitle}</h2><p>{settings.saleDescription}</p></div><Link className="button button-sale" to="/sale">All sale finds <ArrowRight size={16} /></Link></div><ProductGrid products={saleProducts.products} loading={saleProducts.loading} error={saleProducts.error} showError={saleProducts.error !== settingsError} /></Reveal>}
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
        {collections.error && collections.error !== settingsError && <StatusMessage tone={collections.error.startsWith("Demo") ? "info" : "error"}>{collections.error}</StatusMessage>}
      </Reveal>
      <Reveal className="featured-section page-width">
        <div className="section-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> THE GOOD STUFF, ALL IN ONE PLACE</span><h2>Meet your next <em>favorite.</em></h2><p>Everyday essentials with a little something extra.</p></div><Link className="subtle-link" to="/products">Shop all finds <ArrowRight size={16} /></Link></div>
        <div className="collection-tabs" role="group" aria-label="Filter featured products by collection"><button type="button" aria-pressed={!activeCollection} className={!activeCollection ? "active" : ""} onClick={() => setActiveCollection("")}><Sparkles size={14} /> All favorites</button>{storefrontCategories.map((category) => <button type="button" key={category.slug} aria-pressed={activeCollection === category.slug} className={activeCollection === category.slug ? "active" : ""} onClick={() => setActiveCollection(category.slug)}>{category.name}</button>)}</div>
        <ProductGrid products={featuredProducts} loading={loading} error={error} showError={error !== settingsError} emptyMessage="New favorites are on their way." />
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
  const { settingsError } = useShop();
  const location = useLocation();
  const navigate = useNavigate();
  const { categories: storefrontCategories } = useCategories();
  const { category } = useParams();
  const query = new URLSearchParams(location.search);
  const search = query.get("search") || "";
  const page = Math.max(1, Math.floor(Number(query.get("page")) || 1));
  const [sort, setSort] = useState("featured");
  const [categoryFilter, setCategoryFilter] = useState(category || "");
  const { products, loading, error, pagination } = useProducts({
    category: categoryFilter, search, sale: query.get("sale") === "true" ? "true" : "",
    sort, page: String(page), limit: "24",
  });
  useEffect(() => setCategoryFilter(category || ""), [category]);
  useEffect(() => {
    if (loading || error || !pagination.pages || page <= pagination.pages) return;
    const nextQuery = new URLSearchParams(location.search);
    nextQuery.set("page", String(pagination.pages));
    navigate(`${location.pathname}?${nextQuery}`, { replace: true });
  }, [error, loading, location.pathname, location.search, navigate, page, pagination.pages]);
  function goToPage(nextPage) {
    const nextQuery = new URLSearchParams(location.search);
    if (nextPage === 1) nextQuery.delete("page");
    else nextQuery.set("page", String(nextPage));
    const queryString = nextQuery.toString();
    navigate(`${location.pathname}${queryString ? `?${queryString}` : ""}`);
  }
  const title = query.get("sale") === "true" ? "A little sale. A lot to love." : category ? storefrontCategories.find((item) => item.slug === category)?.name || "Shop by category" : search ? `Results for “${search}”` : "A few good finds.";
  return (
    <main id="main-content" className="catalog-page page-width">
      <div className="breadcrumbs"><Link to="/">Home</Link><ChevronRight size={13} /><span>{category ? "Collections" : "Shop"}</span></div>
      <div className="catalog-intro"><span className="eyebrow">{search ? "A GOOD FIND IS CLOSER THAN YOU THINK" : "THOUGHTFULLY PICKED FOR REAL LIFE"}</span><h1>{title}</h1><p>Well-made essentials, lovely little upgrades, and pieces you’ll be glad to have around.</p></div>
      <div className="catalog-toolbar"><span>{loading ? "Finding good things..." : error || settingsError ? "Catalog unavailable" : `${pagination.total} thoughtful ${pagination.total === 1 ? "find" : "finds"}`}</span><label><SlidersHorizontal size={15} /><span>Sort by</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="featured">Featured</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="rating">Top rated</option></select></label></div>
      {!category && <div className="filter-pills"><Link className={!categoryFilter ? "active" : ""} to="/products">All finds</Link>{storefrontCategories.map((item) => <Link className={categoryFilter === item.slug ? "active" : ""} key={item.slug} to={`/categories/${item.slug}`}>{item.name}</Link>)}</div>}
      <ProductGrid products={products} loading={loading} error={error || settingsError} showError={error !== settingsError} emptyMessage="No finds for that search." />
      {!error && pagination.pages > 1 && <nav className="catalog-pagination" aria-label="Product pages">
        <button type="button" disabled={loading || page <= 1} onClick={() => goToPage(page - 1)}>Previous</button>
        <span>Page {page} of {pagination.pages}</span>
        <button type="button" disabled={loading || page >= pagination.pages} onClick={() => goToPage(page + 1)}>Next</button>
      </nav>}
    </main>
  );
}

export { default as ProductDetailPage } from "./ProductDetailPage.jsx";

export function CartPage() {
  const money = useMoney();
  const { cart, updateQuantity, settings } = useShop();
  const subtotal = subtotalFor(cart);
  if (!cart.length) return <main id="main-content" className="page-width empty-state cart-empty"><span className="empty-icon"><ShoppingBag /></span><span className="eyebrow">YOUR BAG IS TAKING A BREATHER</span><h1>Nothing in here<br />just <em>yet.</em></h1><p>Good things are just a browse away.</p><Link className="button button-dark" to="/products">Find something good <ArrowRight size={16} /></Link></main>;
  return (
    <main id="main-content" className="page-width cart-page"><div className="breadcrumbs"><Link to="/">Home</Link><ChevronRight size={13} /><span>Your bag</span></div><div className="cart-heading"><div><span className="eyebrow">THE GOOD STUFF</span><h1>Your bag<span className="item-count"> ({cart.reduce((n, item) => n + item.quantity, 0)})</span></h1></div><Link to="/products" className="subtle-link"><ArrowLeft size={15} /> Keep browsing</Link></div><div className="cart-layout"><div className="cart-items">{cart.map(({ product, quantity, cartKey, variantLabel }) => <article className="cart-item" key={cartKey || product._id}><Link to={`/products/${product._id}`} className="cart-item-image"><img src={product.image} alt={product.name} /></Link><div className="cart-item-info"><span className="product-category">{product.category}</span><Link to={`/products/${product._id}`} className="product-name">{product.name}</Link>{variantLabel && <small>{variantLabel}</small>}<span className="cart-unit-price">{money(product.price)}</span><div className="quantity-control"><button aria-label={`Decrease ${product.name} quantity`} onClick={() => updateQuantity(cartKey || product._id, quantity - 1)}><Minus size={13} /></button><span>{quantity}</span><button aria-label={`Increase ${product.name} quantity`} onClick={() => updateQuantity(cartKey || product._id, quantity + 1)}><Plus size={13} /></button></div><button className="remove-link" onClick={() => updateQuantity(cartKey || product._id, 0)}>Remove</button></div><strong className="cart-line-total">{money(product.price * quantity)}</strong></article>)}</div><aside className="order-summary"><h2>Good choice.</h2><p className="summary-caption">Here’s the little breakdown.</p><div className="summary-line"><span>Subtotal</span><span>{money(subtotal)}</span></div><div className="summary-line"><span>Shipping</span><span>{subtotal >= settings.freeShippingThreshold ? "On us" : money(settings.shippingFee)}</span></div><div className="summary-line summary-total"><span>Total</span><strong>{money(subtotal + (subtotal >= settings.freeShippingThreshold ? 0 : settings.shippingFee))}</strong></div><p className="shipping-note"><Truck size={15} /> {subtotal >= settings.freeShippingThreshold ? "You’ve unlocked free shipping!" : `${money(settings.freeShippingThreshold - subtotal)} away from free shipping`}</p><Link className="button button-dark checkout-button" to="/checkout">Checkout <ArrowRight size={16} /></Link><p className="payment-note"><ShieldCheck size={14} /> Secure checkout - Online or pay on delivery</p></aside></div></main>
  );
}

export function WishlistPage() {
  const { wishlist } = useShop();
  return <main id="main-content" className="page-width wishlist-page"><div className="breadcrumbs"><Link to="/">Home</Link><ChevronRight size={13} /><span>Your wishlist</span></div><div className="section-heading"><div><span className="eyebrow">SAVED FOR A GOOD DAY</span><h1>Your <em>wishlist.</em></h1></div><span className="wishlist-count">{wishlist.length} saved {wishlist.length === 1 ? "find" : "finds"}</span></div><ProductGrid products={wishlist} loading={false} emptyMessage="Your wishlist is a blank canvas." /></main>;
}

export { default as AuthPage } from "./AuthPage.jsx";

export function RequireAuth({ children, superAdmin = false, seller = false }) {
  const { user } = useShop();
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: `${location.pathname}${location.search}${location.hash}` }} replace />;
  if ((superAdmin && user.role !== "superadmin") || (seller && !["seller", "admin"].includes(user.role))) return <main id="main-content" className="page-width empty-state"><span className="eyebrow">RESTRICTED ACCESS</span><h1>{superAdmin ? "Super admin" : "Seller"} access only.</h1><p>Sign in with an authorized account to manage the website.</p><Link to={seller && user.role === "customer" ? "/sell" : "/"} className="button button-dark">{seller && user.role === "customer" ? "Become a seller" : "Back to the shop"}</Link></main>;
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
  return <RequireAuth><main id="main-content" className="page-width account-page"><div className="breadcrumbs"><Link to="/">Home</Link><ChevronRight size={13} /><Link to="/my-orders">Your orders</Link><ChevronRight size={13} /><span>Order details</span></div>{loading ? <div className="skeleton-card order-detail-loading" /> : order ? <><div className="cart-heading"><div><span className="eyebrow">ORDER {order.orderNumber}</span><h1>{order.status === "awaiting_payment" ? <>Complete your <em>payment.</em></> : order.status === "cancelled" ? <>Order <em>cancelled.</em></> : <>Your order is <em>{order.status}.</em></>}</h1></div><span className={`order-status status-${order.status}`}>{order.status}</span></div>{error && <StatusMessage tone="error">{error}</StatusMessage>}{order.paymentStatus === "refund_required" && <StatusMessage tone="error">Payment was received but this order cannot be fulfilled. Contact the store for a refund review. A refund has not been issued automatically.</StatusMessage>}{order.status === "awaiting_payment" && <div className="order-payment-action"><StatusMessage>Your online payment is pending. This order will be confirmed after successful payment verification.</StatusMessage><button className="button button-dark" disabled={paying} onClick={retryPayment}>{paying ? "Opening payment..." : "Pay securely with Razorpay"}</button></div>}<div className="order-detail-layout"><section className="order-detail-items"><OrderExtras order={order} /><h2>Your good things</h2>{order.items.map((item, index) => <div className="order-detail-item" key={`${order._id}-${index}`}><img src={item.image} alt="" /><span>{item.name}<small>{item.variantLabel ? `${item.variantLabel} ? ` : ""}Quantity: {item.quantity}</small></span><strong>{money(item.price * item.quantity, order.currency || "USD")}</strong></div>)}</section><aside className="order-summary"><h2>Order summary</h2><p className="summary-caption">Placed {new Date(order.createdAt).toLocaleDateString()}</p><div className="summary-line"><span>Subtotal</span><span>{money(order.subtotal, order.currency || "USD")}</span></div>{order.discount > 0 && <div className="summary-line"><span>Discount ({order.couponCode})</span><span>-{money(order.discount, order.currency)}</span></div>}<div className="summary-line"><span>Shipping</span><span>{order.shipping ? money(order.shipping, order.currency || "USD") : "On us"}</span></div><div className="summary-line"><span>Payment</span><span>{order.paymentMethod === "wallet" ? `Wallet - ${order.paymentStatus}` : order.paymentMethod === "razorpay" ? `Online - ${order.paymentStatus}` : "Cash on delivery"}</span></div><div className="summary-line summary-total"><span>Total</span><strong>{money(order.total, order.currency || "USD")}</strong></div><h3 className="shipping-address-heading">Shipping to</h3><p className="shipping-address">{order.shippingAddress.firstName} {order.shippingAddress.lastName}<br />{order.shippingAddress.street}<br />{order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.postalCode}<br />{order.shippingAddress.phone}</p></aside></div></> : <StatusMessage tone="error">{error || "Order not found."}</StatusMessage>}</main></RequireAuth>;
}

export function ProfilePage() {
  const { user, updateProfile } = useShop();
  const [form, setForm] = useState({ name: user?.name || "", email: user?.email || "" });
  const [profileImage, setProfileImage] = useState(user?.profileImage || "");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const photoInput = useRef(null);
  const isDirty = form.name !== (user?.name || "") || form.email !== (user?.email || "") || profileImage !== (user?.profileImage || "");

  useEffect(() => {
    setForm({ name: user?.name || "", email: user?.email || "" });
    setProfileImage(user?.profileImage || "");
  }, [user?.name, user?.email, user?.profileImage]);

  function changeField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setNotice("");
    setError("");
  }

  function resetForm() {
    setForm({ name: user?.name || "", email: user?.email || "" });
    setProfileImage(user?.profileImage || "");
    setNotice("");
    setError("");
  }

  async function selectPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setProcessingPhoto(true);
    setNotice("");
    setError("");
    try {
      setProfileImage(await prepareProfilePhoto(file));
      setNotice("Photo ready. Save your changes to update your profile.");
    } catch (photoError) {
      setError(photoError.message || "That photo couldn't be prepared. Please try another.");
    } finally {
      setProcessingPhoto(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const updatedUser = await updateProfile({ name: form.name.trim(), email: form.email.trim(), profileImage: profileImage || null });
      setForm({ name: updatedUser.name, email: updatedUser.email });
      setProfileImage(updatedUser.profileImage || "");
      setNotice("Your details are saved and up to date.");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }
  const initials = (user?.name || "").trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("");

  return <RequireAuth>
    <main id="main-content" className="page-width account-page profile-page">
      <div className="breadcrumbs"><Link to="/">Home</Link><ChevronRight size={13} /><span>Your account</span></div>
      <div className="section-heading profile-heading">
        <div><span className="eyebrow">A LITTLE SPACE THAT’S YOURS</span><h1>Your <em>details.</em></h1><p>Keep your account details current, so every visit feels like yours.</p></div>
        <Link to="/my-orders" className="subtle-link">Your orders <ArrowRight size={15} /></Link>
      </div>

      <div className="profile-layout">
        <section className="profile-editor">
          <div className="profile-editor-heading">
            <span className="profile-section-icon"><UserRound size={19} /></span>
            <div><span className="eyebrow">PERSONAL INFORMATION</span><h2>Make it yours.</h2><p>These details are used for your account and order updates.</p></div>
          </div>

          {notice && <StatusMessage tone="success">{notice}</StatusMessage>}
          {error && <StatusMessage tone="error">{error}</StatusMessage>}

          <form className="profile-form" onSubmit={submit} aria-busy={saving}>
            <label className="profile-field" htmlFor="profile-name">Full name
              <span className="profile-input-wrap"><UserRound size={17} aria-hidden="true" /><input id="profile-name" name="name" value={form.name} onChange={changeField} placeholder="Your full name" autoComplete="name" minLength="2" maxLength="80" required disabled={saving} /></span>
            </label>
            <label className="profile-field" htmlFor="profile-email">Email address
              <span className="profile-input-wrap"><Mail size={17} aria-hidden="true" /><input id="profile-email" name="email" type="email" value={form.email} onChange={changeField} placeholder="you@example.com" autoComplete="email" maxLength="254" required disabled={saving} /></span>
            </label>
            <p className="profile-form-hint"><ShieldCheck size={15} /> Your details stay private and are only used to manage your account.</p>
            <div className="profile-form-actions">
              <button type="button" className="button profile-reset-button" onClick={resetForm} disabled={saving || processingPhoto || !isDirty}>Discard changes</button>
              <button type="submit" className="button button-dark" disabled={saving || processingPhoto || !isDirty}>{saving ? "Saving changes..." : "Save changes"} <Check size={16} /></button>
            </div>
          </form>
        </section>

        <aside className="profile-sidebar">
          <section className="profile-identity-card">
            <div className="profile-identity-top"><span className="eyebrow">YOUR ACCOUNT</span><span className="profile-secure-tag"><ShieldCheck size={13} /> Secure</span></div>
            <div className="profile-identity">
              <div className="profile-avatar" aria-hidden="true">{profileImage ? <img src={profileImage} alt="" /> : initials || <UserRound size={23} />}</div>
              <div className="profile-identity-copy"><h2>{user?.name}</h2><p>{user?.email}</p></div>
            </div>
            <input ref={photoInput} className="profile-photo-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={selectPhoto} disabled={saving || processingPhoto} aria-label="Choose profile photo" />
            <div className="profile-photo-actions">
              <button type="button" className="profile-photo-button" onClick={() => photoInput.current?.click()} disabled={saving || processingPhoto}>
                {processingPhoto ? <LoaderCircle size={14} className="profile-photo-spinner" /> : <Camera size={14} />}
                {processingPhoto ? "Preparing photo..." : profileImage ? "Change photo" : "Add a photo"}
              </button>
              {profileImage && <button type="button" className="profile-photo-remove" onClick={() => { setProfileImage(""); setNotice("Photo removed. Save your changes to update your profile."); setError(""); }} disabled={saving || processingPhoto}><Trash2 size={13} /> Remove</button>}
            </div>
            <p className="profile-photo-hint">JPG, PNG or WebP · up to 5 MB</p>
            <div className="profile-account-type"><span /> ShopSphere member</div>
          </section>

          <section className="profile-links-card">
            <span className="eyebrow">YOUR SHOPSPHERE</span>
            <Link to="/my-orders"><span className="profile-link-icon"><PackageCheck size={17} /></span><span><strong>Order history</strong><small>Check in on your recent orders</small></span><ArrowRight size={15} /></Link>
            <Link to="/wishlist"><span className="profile-link-icon"><Heart size={17} /></span><span><strong>Saved favorites</strong><small>All the good things you’ve saved</small></span><ArrowRight size={15} /></Link>
          </section>
        </aside>
      </div>
    </main>
  </RequireAuth>;
}

export function NotFoundPage() {
  return <main id="main-content" className="page-width empty-state not-found"><span className="eyebrow">WELL, THIS IS AWKWARD</span><h1>That page took<br />a little <em>detour.</em></h1><p>We couldn’t find what you were looking for.</p><Link className="button button-dark" to="/">Back to ShopSphere <ArrowRight size={16} /></Link></main>;
}
