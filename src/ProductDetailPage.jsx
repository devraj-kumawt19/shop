import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, ChevronRight, Heart, Minus, Plus, ShoppingBag, Star, Truck, Bell, BadgeCheck } from "lucide-react";
import { useProduct, useProducts } from "./hooks/useProducts.js";
import { useMoney, useShop } from "./ShopContext.jsx";
import { ProductGrid, StatusMessage } from "./components.jsx";
import api, { getErrorMessage } from "./api.js";

export default function ProductDetailPage() {
  const money = useMoney(); const { id } = useParams();
  const { product, loading, error } = useProduct(id);
  const { addToCart, wishlist, toggleWishlist, settingsError, user, settings } = useShop();
  const [quantity, setQuantity] = useState(1), [sku, setSku] = useState("");
  const [reviews, setReviews] = useState(null), [notice, setNotice] = useState(""), [actionError, setActionError] = useState(""), [busy, setBusy] = useState(false);
  const recommendations = useProducts({ featured: "true" });
  const variant = product?.variants?.find((item) => item.sku === sku);
  const price = variant?.price ?? product?.price, stock = variant?.stock ?? (product?.variants?.length ? 0 : product?.stock);
  useEffect(() => {
    setSku(""); setQuantity(1); setReviews(null); setNotice(""); setActionError("");
    const controller = new AbortController();
    api.get(`/products/${encodeURIComponent(id)}/reviews`, { signal: controller.signal }).then(({ data }) => setReviews(data)).catch(() => {});
    return () => controller.abort();
  }, [id]);
  useEffect(() => {
    if (!product) return;
    document.title = `${product.name} | ${settings.siteName}`;
    const description = document.querySelector('meta[name="description"]');
    const old = description?.content; if (description) description.content = product.description.slice(0, 160);
    return () => { if (description) description.content = old; };
  }, [product, settings.siteName]);
  async function review(event) {
    event.preventDefault(); setBusy(true); setActionError("");
    const form = event.currentTarget, values = Object.fromEntries(new FormData(form));
    try {
      await api.put(`/products/${id}/review`, { rating: Number(values.rating), title: values.title, text: values.text, photos: values.photos.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) });
      setReviews((await api.get(`/products/${id}/reviews`)).data); setNotice("Your verified review has been saved."); form.reset();
    } catch (error) { setActionError(getErrorMessage(error)); } finally { setBusy(false); }
  }
  async function alert(event) {
    event.preventDefault(); setBusy(true); setActionError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try { await api.post(`/products/${id}/alerts`, { type: values.type, ...(values.type === "price" ? { targetPrice: Number(values.targetPrice) } : {}) }); setNotice("Alert saved. Updates will appear in your notifications and email when triggered."); }
    catch (error) { setActionError(getErrorMessage(error)); } finally { setBusy(false); }
  }
  if (loading) return <main id="main-content" className="page-width detail-loading"><div className="skeleton-card" /><div className="skeleton-card" /></main>;
  if (!product) return <main id="main-content" className="page-width empty-state">{error && error !== settingsError && <StatusMessage tone="error">{error}</StatusMessage>}<Link className="button button-dark" to="/products">Back to the shop</Link></main>;
  const saved = wishlist.some((item) => item._id === product._id);
  return <main id="main-content" className="page-width product-detail-page">
    <div className="breadcrumbs"><Link to="/">Home</Link><ChevronRight size={13} /><Link to="/products">Shop</Link><ChevronRight size={13} /><span>{product.name}</span></div>
    {error && <StatusMessage>{error}</StatusMessage>}
    <div className="product-detail"><div className="detail-image"><img src={product.image} alt={product.name} /><span className="detail-image-label">A GOOD FIND, UP CLOSE</span></div>
      <div className="detail-info"><span className="eyebrow">{product.category} / THOUGHTFULLY SELECTED</span><h1>{product.name}</h1>
        <a className="detail-rating" href="#customer-reviews"><span><Star size={14} fill="currentColor" /> {Number(reviews?.rating || 0).toFixed(1)}</span><span>{reviews?.count || 0} verified reviews</span></a>
        <div className="detail-price">{product.variants?.length && !variant ? "From " : ""}{money(price)} {product.compareAtPrice > price && <del>{money(product.compareAtPrice)}</del>}</div>
        <p className="detail-description">{product.description}</p>
        {product.variants?.length > 0 && <fieldset className="variant-options"><legend>Make it your own <small>Choose size / color</small></legend><div>{product.variants.map((item) => <button key={item.sku} type="button" aria-pressed={sku === item.sku} className={sku === item.sku ? "selected" : ""} onClick={() => { setSku(item.sku); setQuantity(1); }}><strong>{[item.size, item.color].filter(Boolean).join(" / ") || item.sku}</strong><small>{money(item.price)} · {item.stock ? `${item.stock} available` : "Sold out"}</small></button>)}</div></fieldset>}
        <div className={stock > 0 ? "stock-line" : "stock-line stock-unavailable"}><span className="stock-dot" />{product.variants?.length && !variant ? "Select an option to see availability" : stock > 0 ? `In stock — ${stock} available` : "Currently out of stock"}</div>
        <div className="purchase-row"><div className="quantity-control"><button aria-label="Decrease quantity" disabled={!stock} onClick={() => setQuantity(Math.max(1, quantity - 1))}><Minus size={14} /></button><span>{quantity}</span><button aria-label="Increase quantity" disabled={!stock || quantity >= Math.min(stock, 99)} onClick={() => setQuantity(Math.min(stock, 99, quantity + 1))}><Plus size={14} /></button></div><button className="button button-dark add-detail" disabled={!stock} onClick={() => addToCart(product, quantity, sku)}>Add to bag <ShoppingBag size={17} /></button><button className={saved ? "detail-heart is-favorite" : "detail-heart"} aria-label={saved ? "Remove from wishlist" : "Add to wishlist"} onClick={() => toggleWishlist(product)}><Heart size={19} fill={saved ? "currentColor" : "none"} /></button></div>
        <div className="detail-promises"><div><Truck size={18} /><span><b>Free shipping over {money(settings.freeShippingThreshold)}</b><small>Delivered with care</small></span></div></div>
        {!String(id).startsWith("sphere-") && <details className="product-alert"><summary><Bell size={16} /> Keep me in the loop</summary>{user ? <form onSubmit={alert}><label>Alert me about<select name="type"><option value="price">A lower price</option>{product.stock < 1 && <option value="stock">Back in stock</option>}</select></label><label>Target price ({settings.currency}, for price alerts)<input name="targetPrice" type="number" min=".01" max={Math.max(.01, product.price - .01)} step=".01" defaultValue={Math.max(.01, Math.round(product.price * .9 * 100) / 100)} /></label><button className="button button-quiet" disabled={busy}>Save alert</button><small>Alerts use the product's starting price and overall stock.</small></form> : <p><Link to="/login">Sign in</Link> to save a price or stock alert.</p>}</details>}
      </div>
    </div>
    <section id="customer-reviews" className="review-section"><div className="section-heading"><div><span className="eyebrow">FROM THEIR EVERYDAY TO YOURS</span><h2>Real finds. Real feedback.</h2></div><span className="review-score"><Star fill="currentColor" size={18} />{Number(reviews?.rating || 0).toFixed(1)} <small>({reviews?.count || 0})</small></span></div>
      {notice && <StatusMessage tone="success">{notice}</StatusMessage>}{actionError && <StatusMessage tone="error">{actionError}</StatusMessage>}
      <div className="review-layout"><div className="review-list">{reviews?.reviews?.length ? reviews.reviews.map((item) => <article className="review-card" key={item._id}><div><strong>{item.user.name}</strong><span><BadgeCheck size={14} /> Verified purchase</span><time>{new Date(item.createdAt).toLocaleDateString()}</time></div><p className="review-stars" aria-label={`${item.rating} of 5 stars`}>{"★".repeat(item.rating)}{"☆".repeat(5 - item.rating)}</p><h3>{item.title}</h3><p>{item.text}</p>{item.photos.length > 0 && <div className="review-photos">{item.photos.map((url, index) => <a key={`${url}-${index}`} href={url} target="_blank" rel="noopener noreferrer"><img loading="lazy" src={url} alt={`Customer photo ${index + 1}`} /></a>)}</div>}</article>) : <div className="commerce-empty"><Star size={24} /><h3>Be the first to share your find.</h3><p>Reviews are written by customers after delivery.</p>{!reviews && <small>Reviews will load when the store API is connected.</small>}</div>}</div>
        <aside className="review-compose"><h3>A little review goes a long way.</h3><p>Received this product? Tell us about it. One review per customer; you can update it here.</p>{user ? <form onSubmit={review}><label>Your rating<select name="rating" defaultValue="5">{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} stars</option>)}</select></label><label>A few words<input name="title" maxLength={100} placeholder="Your headline" /></label><label>Your experience<textarea name="text" required maxLength={2000} rows={4} /></label><label>Photo URLs <small>Optional, up to 3 HTTPS links; one per line</small><textarea name="photos" rows={2} /></label><button className="button button-dark" disabled={busy}>{busy ? "Saving..." : "Save verified review"}</button></form> : <Link className="button button-dark" to="/login">Sign in to review</Link>}</aside>
      </div>
    </section>
    <section className="related-section"><div className="section-heading"><div><span className="eyebrow">MORE TO LOVE</span><h2>Good together.</h2></div><Link className="subtle-link" to="/products">Shop all <ArrowRight size={15} /></Link></div><ProductGrid products={recommendations.products.filter((item) => item._id !== product._id).slice(0, 4)} loading={recommendations.loading} error={recommendations.error} showError={recommendations.error !== settingsError} /></section>
  </main>;
}
