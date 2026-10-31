import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Check, Headphones, Heart, PackageCheck, ShieldCheck, Sparkles, Tag, Truck } from "lucide-react";
import { useCategories, useProducts } from "./hooks/useProducts.js";
import { useMoney, useShop } from "./ShopContext.jsx";
import { ProductGrid, StatusMessage } from "./components.jsx";
import Reveal from "./Reveal.jsx";

const categoryNotes = { "home-living": "Make room for good living", "tech-audio": "Plug into something better", "style-carry": "Go everywhere in style", wellness: "A little time for yourself" };

export default function HomePage() {
  const { settings, settingsError } = useShop();
  const money = useMoney();
  const { categories, error: categoryError } = useCategories();
  const [activeCategory, setActiveCategory] = useState("");
  const featured = useProducts({ featured: "true", category: activeCategory, limit: "8" });
  const sale = useProducts({ sale: "true", limit: "4" });
  const maxDiscount = Math.max(0, ...sale.products.map(p => p.compareAtPrice > p.price ? Math.round((1 - p.price / p.compareAtPrice) * 100) : 0));
  const collectionPath = (slug) => categories.some(c => c.slug === slug) ? `/categories/${slug}` : "/products";

  return <main id="main-content" className="shopping-home">
    <div className="store-width">
      <div className="home-welcome"><span><Sparkles size={14} /> Considered essentials for modern living.</span><span>Selected for quality. Designed for everyday.</span></div>
      <section className="shopping-hero-grid" aria-label="Featured collections">
        <div className="shopping-hero">
          <img className="shopping-hero-image" src={settings.heroImage} alt={`${settings.siteName} featured living collection`} fetchPriority="high" />
          <div className="shopping-hero-copy"><span className="store-kicker"><span /> THE EVERYDAY EDIT</span><h1>{settings.heroHeading.split("\n").map((line, index) => <span key={index}>{line}<br /></span>)}<em>{settings.heroAccent}</em></h1><p>{settings.heroDescription}</p><Link className="store-button" to="/products">Discover the collection <ArrowUpRight size={18} /></Link><div className="hero-small-print"><ShieldCheck size={15} /> Good quality. Great finds. No compromises.</div></div>
          <Link className="hero-image-tag" to={collectionPath("home-living")}><span>MAKE YOURSELF AT HOME<strong>The living collection</strong></span><ArrowUpRight size={21} /></Link>
        </div>
        <div className="shopping-hero-side">
          <Link className="hero-mini hero-mini-tech" to={collectionPath("tech-audio")}><img src="https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=700&q=85" alt="Studio headphones with a refined dark finish" /><div><span className="store-kicker">SOUND GOOD. FEEL GOOD.</span><h2>Your world.<br />Better sound.</h2><span className="mini-shop-link">Explore tech <ArrowRight size={14} /></span></div><span className="mini-round-link"><ArrowUpRight size={18} /></span></Link>
          <Link className="hero-mini hero-mini-wellness" to={collectionPath("wellness")}><img src="https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=700&q=85" alt="Botanical self-care essentials" /><div><span className="store-kicker">YOUR DAILY DOSE OF GOOD</span><h2>Small rituals.<br />Big difference.</h2><span className="mini-shop-link">Shop wellness <ArrowRight size={14} /></span></div><span className="mini-round-link"><ArrowUpRight size={18} /></span></Link>
        </div>
      </section>
      <div className="store-perks"><div><Truck /><span><strong>Free shipping</strong><small>On orders over {money(settings.freeShippingThreshold)}</small></span></div><div><PackageCheck /><span><strong>Easy returns</strong><small>30 days to find your perfect fit</small></span></div><div><ShieldCheck /><span><strong>Secure checkout</strong><small>Shop with peace of mind</small></span></div><div><Headphones /><span><strong>Here to help</strong><small>A little support, whenever you need</small></span></div></div>
      <Reveal className="shopping-categories" id="collections"><div className="shop-section-heading"><div><span className="store-kicker">A LITTLE SOMETHING FOR EVERYONE</span><h2>What are you shopping for?</h2></div><Link to="/products">Explore all <ArrowRight size={16} /></Link></div><div className="shopping-category-grid">{categories.map((category, index) => <Link to={`/categories/${category.slug}`} className={`shopping-category shopping-category-${index % 4}`} key={category.slug}><div><img src={category.image || "/product-placeholder.svg"} alt={category.name} loading="lazy" /></div><span><strong>{category.name}</strong><small>{categoryNotes[category.slug] || "Discover your next favorite"}</small></span><ArrowUpRight size={18} /></Link>)}</div>{categoryError && categoryError !== settingsError && <StatusMessage>{categoryError}</StatusMessage>}</Reveal>
      <Reveal className="shopping-featured" id="bestsellers"><div className="shop-section-heading"><div><span className="store-kicker"><span /> CURATED FOR YOUR EVERYDAY</span><h2>The curated collection<span>.</span></h2><p>Thoughtful design. Everyday utility. Explore our selected essentials.</p></div><Link to="/products">View all products <ArrowRight size={16} /></Link></div><div className="shopping-filter-row"><div className="shopping-tabs" role="group" aria-label="Filter featured products by collection"><button aria-pressed={!activeCategory} className={!activeCategory ? "active" : ""} onClick={() => setActiveCategory("")}><Sparkles size={14} /> All favorites</button>{categories.map(category => <button key={category.slug} aria-pressed={activeCategory === category.slug} className={activeCategory === category.slug ? "active" : ""} onClick={() => setActiveCategory(category.slug)}>{category.name}</button>)}</div><span><Check size={13} /> Selected with care</span></div><ProductGrid products={featured.products} loading={featured.loading} error={featured.error} showError={featured.error !== settingsError} emptyMessage="New favorites are on their way." /></Reveal>
      <Reveal className="shopping-edit-grid"><Link className="shopping-edit edit-home" to={collectionPath("home-living")}><img src="https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1000&q=85" alt="Inviting living space with warm natural textures" loading="lazy" /><div><span className="store-kicker">A FRESH TAKE ON YOUR SPACE</span><h2>Home is a feeling.<br />Make it a good one.</h2><span className="edit-link">Shop home & living <ArrowUpRight size={16} /></span></div></Link><Link className="shopping-edit edit-carry" to={collectionPath("style-carry")}><img src="https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=1000&q=85" alt="Everyday leather handbag" loading="lazy" /><div><span className="store-kicker">READY FOR WHEREVER</span><h2>A little style.<br />A lot of possibility.</h2><span className="edit-link">Find your everyday carry <ArrowUpRight size={16} /></span></div></Link></Reveal>
      {settings.saleEnabled && (sale.loading || sale.products.length > 0) && <Reveal className="shopping-deals"><div className="shop-section-heading"><div><span className="store-kicker"><Tag size={13} /> GOOD FINDS, BETTER PRICES</span><h2>Exceptional finds. Better value<span>.</span><span className="deals-heading-badge">{maxDiscount ? `Up to ${maxDiscount}% off` : "The sale edit"}</span></h2><p>{settings.saleDescription}</p></div><Link to="/sale">Shop all deals <ArrowRight size={16} /></Link></div><ProductGrid products={sale.products} loading={sale.loading} error={sale.error} showError={sale.error !== settingsError && sale.error !== featured.error} /></Reveal>}
      <Reveal className="shopping-bottom-banner"><span className="bottom-banner-symbol"><Sparkles size={36} strokeWidth={1.3} /></span><div><span className="store-kicker">DESIGNED AROUND YOUR EVERYDAY</span><h2>Discover a better everyday.</h2><p>Fresh spaces, better routines, and your next everyday favorite.</p></div><Link className="store-button" to="/products">Find something you love <ArrowRight size={17} /></Link><Heart className="bottom-banner-heart" size={120} strokeWidth={.7} aria-hidden="true" /></Reveal>
    </div>
  </main>;
}
