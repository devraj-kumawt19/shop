import { useEffect, useRef, useState } from "react";
import { Check, Image, LoaderCircle, PackagePlus, X } from "lucide-react";
import api, { getErrorMessage } from "../api.js";
import { useMoney } from "../ShopContext.jsx";
import VariantEditor from "../super-admin/components/VariantEditor.jsx";

export default function SellerProductEditor({ product, onClose, onSaved }) {
  const money = useMoney();
  const dialogRef = useRef(null);
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoryError, setCategoryError] = useState("");
  const [categoryRetry, setCategoryRetry] = useState(0);
  const [values, setValues] = useState({ name: product?.name || "", category: product?.categorySlug || "", price: product?.price ?? "", compareAtPrice: product?.compareAtPrice || "", stock: product?.stock ?? "", badge: product?.badge || "", image: product?.image || "", description: product?.description || "" });
  const [variants, setVariants] = useState((product?.variants || []).map(({ sku, size, color, price, stock }) => ({ sku, size, color, price, stock })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [imageFailed, setImageFailed] = useState(false);
  const [dirty, setDirty] = useState(false);
  const busyRef = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = () => {
    if (!busyRef.current && (!dirty || window.confirm("Discard your unsaved product changes?"))) onClose();
  };
  useEffect(() => {
    const controller = new AbortController();
    setCategoriesLoading(true); setCategoryError("");
    api.get("/seller/categories", { signal: controller.signal }).then(({ data }) => setCategories(data.categories))
      .catch((error) => { if (!controller.signal.aborted) setCategoryError(getErrorMessage(error)); })
      .finally(() => { if (!controller.signal.aborted) setCategoriesLoading(false); });
    return () => controller.abort();
  }, [categoryRetry]);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector("input")?.focus();
    function keyboard(event) {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const elements = [...dialogRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, a[href]')].filter((element) => element.getClientRects().length);
      const first = elements[0], last = elements.at(-1);
      if (!first) { event.preventDefault(); dialogRef.current.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keyboard);
    return () => { document.removeEventListener("keydown", keyboard); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, []);
  function change(key, value) { setValues((current) => ({ ...current, [key]: value })); setDirty(true); if (key === "image") setImageFailed(false); }
  async function submit(event) {
    event.preventDefault();
    if (busyRef.current) return;
    const category = categories.find((item) => item.slug === values.category);
    if (!category) { setError("Choose an available product category."); return; }
    if (!values.name.trim() || !values.description.trim()) { setError("Enter a product name and description."); return; }
    const payload = { ...values, name: values.name.trim(), description: values.description.trim(), category: category.name, categorySlug: category.slug, price: variants.length ? Math.min(...variants.map((variant) => Number(variant.price))) : Number(values.price), stock: variants.length ? variants.reduce((sum, variant) => sum + Number(variant.stock), 0) : Number(values.stock), compareAtPrice: Number(values.compareAtPrice || 0), variants };
    busyRef.current = true; setBusy(true); setError("");
    try {
      if (product) await api.patch(`/seller/products/${product._id}`, payload);
      else await api.post("/seller/products", payload);
      onSaved();
    } catch (error) { setError(getErrorMessage(error)); }
    finally { busyRef.current = false; setBusy(false); }
  }
  function field(key, label, options = {}) {
    return <label htmlFor={`seller-product-${key}`}>{label}<input id={`seller-product-${key}`} name={key} value={values[key]} onChange={(event) => change(key, event.target.value)} {...options} /></label>;
  }
  const hasPhoto = /^https?:\/\//i.test(values.image) && !imageFailed;
  const previewPrice = variants.length ? Math.min(...variants.map((variant) => Number(variant.price))) : Number(values.price);
  return <div className="seller-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeRef.current(); }}><section className="seller-editor" role="dialog" aria-modal="true" aria-labelledby="seller-editor-title" tabIndex={-1} ref={dialogRef}>
    <header className="seller-editor-header"><span><PackagePlus size={22} /></span><div><h2 id="seller-editor-title">{product ? "Edit your product" : "Add a new catalog"}</h2><p>A few details. One great product listing.</p></div><button className="seller-icon-button" type="button" aria-label="Close product editor" disabled={busy} onClick={() => closeRef.current()}><X size={21} /></button></header>
    <form className="seller-editor-form" onSubmit={submit} aria-busy={busy}><div className="seller-editor-scroll"><fieldset disabled={busy} className="seller-editor-fields">
      {error && <div className="seller-catalog-error" role="alert">{error}</div>}
      {categoryError && <div className="seller-catalog-error" role="alert">{categoryError}<button type="button" onClick={() => setCategoryRetry((value) => value + 1)}>Reload categories</button></div>}
      <div className="seller-editor-layout"><div className="seller-editor-details">
        <section><h3><span>1</span>Product details</h3><p>Help customers get to know your product.</p>{field("name", "Product name *", { required: true, maxLength: 140, placeholder: "e.g. Everyday cotton tote bag" })}<label htmlFor="seller-product-category">Category *<select id="seller-product-category" value={values.category} required onChange={(event) => change("category", event.target.value)} disabled={categoriesLoading}><option value="">{categoriesLoading ? "Loading categories..." : "Select a category"}</option>{categories.map((category) => <option key={category._id} value={category.slug}>{category.name}</option>)}</select></label>{!categoriesLoading && !categoryError && !categories.length && <p className="seller-field-note">The store owner needs to add a category before you can list a product.</p>}<label htmlFor="seller-product-description">Description *<textarea id="seller-product-description" value={values.description} required maxLength={2000} rows={4} placeholder="What makes it a good find? Include material, dimensions and care details." onChange={(event) => change("description", event.target.value)} /></label></section>
        <section><h3><span>2</span>Pricing & inventory</h3><p>Set your selling price and the units ready to sell.</p><div className="seller-editor-grid">{field("price", "Selling price *", { type: "number", min: ".01", step: ".01", required: !variants.length, readOnly: Boolean(variants.length), placeholder: "0.00" })}{field("compareAtPrice", "Original price (optional)", { type: "number", min: "0", step: ".01", placeholder: "0.00" })}{field("stock", "Available stock *", { type: "number", min: "0", max: "1000000", step: "1", required: !variants.length, readOnly: Boolean(variants.length), placeholder: "0" })}{field("badge", "Product badge (optional)", { maxLength: 32, placeholder: "e.g. NEW ARRIVAL" })}</div>{variants.length > 0 && <p className="seller-field-note">Price and total stock are calculated from your product options.</p>}<details className="seller-options" open={variants.length > 0 || undefined}><summary>Size, color & SKU options <span>Optional</span></summary><VariantEditor value={variants} onChange={(next) => { setVariants(next); setDirty(true); }} existing={product?.variants || []} allowStockChanges /></details></section>
        <section><h3><span>3</span>Product photo</h3><p>Use a clear image so customers can see every detail.</p>{field("image", "Photo URL *", { type: "url", required: true, maxLength: 2000, placeholder: "https://example.com/your-product.jpg", pattern: "https?://.+" })}<span className="seller-field-note">Paste a publicly accessible HTTP or HTTPS image link.</span></section>
      </div><aside className="seller-editor-preview"><span className="seller-preview-kicker">LISTING PREVIEW</span><div className="seller-preview-image">{hasPhoto ? <img src={values.image} alt="Your product preview" onError={() => setImageFailed(true)} /> : <><Image size={36} strokeWidth={1.3} /><span>{imageFailed ? "Image could not be loaded" : "Your product photo goes here"}</span></>}</div><small>{categories.find((category) => category.slug === values.category)?.name || "Your category"}</small><h3>{values.name || "Your next great product"}</h3><strong>{Number.isFinite(previewPrice) && previewPrice > 0 ? money(previewPrice) : "Your selling price"}</strong><div className="seller-preview-tip"><Check size={17} /><p>Your listing is linked to your seller account and will appear in the shop after saving.</p></div></aside></div>
    </fieldset></div><footer className="seller-editor-footer"><span><Check size={14} />Only your own catalog is updated.</span><div><button type="button" className="seller-secondary-button" disabled={busy} onClick={() => closeRef.current()}>Cancel</button><button className="seller-primary-button" disabled={busy || categoriesLoading || !categories.length || Boolean(categoryError)}>{busy ? <LoaderCircle size={17} className="spin" /> : <Check size={17} />}{busy ? "Saving product..." : product ? "Save changes" : "Publish product"}</button></div></footer></form>
  </section></div>;
}

