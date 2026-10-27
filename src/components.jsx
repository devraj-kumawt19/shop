import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Heart, Search, ShoppingBag, Sparkles, Star, Zap } from "lucide-react";
import { useMoney, useShop } from "./ShopContext.jsx";
import { useCategories } from "./hooks/useProducts.js";

export function SearchBar({ compact = false, autoFocus = false, onSearch }) {
  const [value, setValue] = useState("");
  const navigate = useNavigate();

  function submit(event) {
    event.preventDefault();
    navigate(`/products?search=${encodeURIComponent(value.trim())}`);
    setValue("");
    onSearch?.();
  }

  return (
    <form className={compact ? "search-form search-compact" : "search-form"} role="search" onSubmit={submit}>
      <Search size={17} strokeWidth={1.7} />
      <input aria-label="Search products" placeholder={compact ? "Search finds..." : "Search for something good..."} autoFocus={autoFocus} value={value} onChange={(event) => setValue(event.target.value)} />
      {value && <button type="submit" aria-label="Submit search"><ArrowRight size={16} /></button>}
    </form>
  );
}

export function ProductCard({ product }) {
  const money = useMoney();
  const discount = product.compareAtPrice > product.price ? Math.round((1 - product.price / product.compareAtPrice) * 100) : 0;
  const { wishlist, toggleWishlist, addToCart } = useShop();
  const saved = wishlist.some((item) => item._id === product._id);
  return (
    <article className="product-card">
      <div className="product-visual">
        <Link to={`/products/${product._id}`} aria-label={`View ${product.name}`}>
          <img src={product.image} alt={product.name} loading="lazy" onError={(event) => { if (!event.currentTarget.src.endsWith("/product-placeholder.svg")) event.currentTarget.src = "/product-placeholder.svg"; }} />
        </Link>
        {(discount > 0 || product.badge) && <span className={`product-badge ${discount ? "discount-badge" : ""}`}>{discount ? `${discount}% OFF` : product.badge}</span>}
        <button className={saved ? "favorite-button is-favorite" : "favorite-button"} onClick={() => toggleWishlist(product)} aria-pressed={saved} aria-label={saved ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}>
          <Heart size={18} fill={saved ? "currentColor" : "none"} />
        </button>
        <button className="quick-add" disabled={product.stock < 1} onClick={() => addToCart(product)}>{product.stock > 0 ? <><ShoppingBag size={15} /> {product.variants?.length ? "Choose options" : "Add to bag"}</> : "Taking a little break"}</button>
      </div>
      <div className="product-info">
        <div className="product-category">{product.category}</div>
        {product.quickEligible && <span className="quick-product-label"><Zap size={11} fill="currentColor" /> Quick eligible</span>}
        {product.isDemo && <span className="demo-product-label">Sample product</span>}
        <Link className="product-name" to={`/products/${product._id}`}>{product.name}</Link>
        <div className="product-card-bottom">
          <div className="price-line">
            <span className="price">{money(product.price)}</span>
            {discount > 0 && <del>{money(product.compareAtPrice)}</del>}
          </div>
          <span className="rating"><Star size={12} fill="currentColor" /> {Number(product.rating || 0).toFixed(1)}</span>
        </div>
        {discount > 0 && <span className="product-saving">You save {money(product.compareAtPrice - product.price)}</span>}
      </div>
    </article>
  );
}

export function StatusMessage({ children, tone = "info" }) {
  if (!children) return null;
  return <div className={`status-message status-${tone}`} role={tone === "error" ? "alert" : "status"}>{children}</div>;
}

export function ProductGrid({ products, loading, error, showError = true, emptyMessage = "Nothing here just yet." }) {
  if (loading) return <div className="loading-grid">{Array.from({ length: 8 }, (_, index) => <div className="skeleton-card" key={index} />)}</div>;
  return (
    <>
      {error && showError && <StatusMessage tone={error.startsWith("Demo") ? "info" : "error"}>{error}</StatusMessage>}
      {products.length
        ? <div className="product-grid">{products.map((product) => <ProductCard key={product._id} product={product} />)}</div>
        : error ? null : <div className="empty-state"><span>✳</span><h2>{emptyMessage}</h2><p>Try another search or browse all the good things.</p><Link className="button button-dark" to="/products">Explore the shop</Link></div>}
    </>
  );
}

export function SiteFooter() {
  const { settings } = useShop();
  const { categories } = useCategories();
  return (
    <footer className="site-footer">
      <div className="footer-main">
        <div className="footer-brand">
          <Link className="brand" to="/"><span className="brand-mark"><Sparkles size={19} /></span><span>{settings.siteName === "ShopSphere" ? <>shop<span>sphere</span></> : settings.siteName}</span></Link>
          <p>{settings.footerDescription}</p>
        </div>
        <div className="footer-column"><span className="footer-title">EXPLORE</span><Link to="/products">Shop all</Link>{categories.slice(0, 4).map((category) => <Link key={category.slug} to={`/categories/${category.slug}`}>{category.name}</Link>)}</div>
        <div className="footer-column"><span className="footer-title">HERE TO HELP</span><Link to="/profile">Your account</Link><Link to="/wallet">Shop Wallet</Link><Link to="/my-orders">Order history</Link><Link to="/quick-delivery">15-minute delivery</Link><a href={`mailto:${settings.supportEmail}`}>Get in touch</a></div>
        <div className="newsletter"><span className="footer-title">A LITTLE HELP, WHEN YOU NEED IT</span><p>Questions about an order or looking for a recommendation? We’re here.</p><a className="footer-contact" href={`mailto:${settings.supportEmail}`}>{settings.supportEmail} <ArrowRight size={15} /></a><small>Real people, here to help you find the right thing.</small></div>
      </div>
      <div className="footer-bottom"><span>© 2026 {settings.siteName}. Thoughtfully found.</span><span>A little more joy in the everyday.</span><div><span>Privacy</span><span>Terms</span><span>Instagram</span></div></div>
    </footer>
  );
}
