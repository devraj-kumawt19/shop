import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, ChevronLeft, ChevronRight, Filter, LoaderCircle, Package, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import api, { getErrorMessage } from "../api.js";
import { useMoney } from "../ShopContext.jsx";

const stockTabs = [["", "All catalogs"], ["in_stock", "In stock"], ["low_stock", "Low stock"], ["out_of_stock", "Out of stock"]];

export default function SellerCatalog({ filter, onFilter, revision, onChange, onEdit, onCreate, inventory }) {
  const money = useMoney();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => { setPage(1); }, [filter, search]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setResult(null);
    const params = new URLSearchParams({ page: String(page), search, status: filter });
    api.get(`/seller/products?${params}`, { signal: controller.signal })
      .then(({ data }) => {
        if (page > Math.max(1, data.pages)) { setPage(Math.max(1, data.pages)); return; }
        setResult(data);
      })
      .catch((error) => { if (!controller.signal.aborted) setError(getErrorMessage(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filter, search, page, revision, retry]);
  async function deleteProduct(product) {
    if (deleting || !window.confirm(`Delete "${product.name}" from your catalog? This removes the listing from the store.`)) return;
    setDeleting(product._id); setError("");
    try { await api.delete(`/seller/products/${product._id}`); onChange(); }
    catch (error) { setError(getErrorMessage(error)); }
    finally { setDeleting(""); }
  }
  function submitSearch(event) { event.preventDefault(); setPage(1); setSearch(searchInput.trim()); }
  return <section className="seller-catalog" aria-labelledby="seller-catalog-title" aria-busy={loading}>
    <div className="seller-catalog-heading"><div><h2 id="seller-catalog-title">{inventory ? "Manage inventory" : "Your product catalogs"}{result && <span>{result.total}</span>}</h2><p>{inventory ? "A clear view of every product and its available stock." : "All your listings. One place to keep them looking their best."}</p></div><button className="seller-secondary-button" onClick={onCreate}><Plus size={16} />Add catalog</button></div>
    <div className="seller-catalog-tabs" role="group" aria-label="Filter by stock">{stockTabs.map(([value, label]) => <button key={label} className={filter === value ? "selected" : ""} aria-pressed={filter === value} onClick={() => { setPage(1); onFilter(value); }}>{label}{value === "low_stock" && <span className="seller-tab-dot" />}</button>)}</div>
    <div className="seller-catalog-tools"><form className="seller-search" onSubmit={submitSearch}><Search size={18} /><input aria-label="Search your catalogs" placeholder="Search by product name or category" value={searchInput} maxLength={100} onChange={(event) => setSearchInput(event.target.value)} />{searchInput && <button type="button" aria-label="Clear search" onClick={() => { setSearchInput(""); setSearch(""); setPage(1); }}><X size={15} /></button>}<button type="submit">Search</button></form><span className="seller-catalog-scope"><Filter size={15} />Your products only</span></div>
    {error && <div className="seller-catalog-error" role="alert"><span>{error}</span><button onClick={() => setRetry((value) => value + 1)}>Try again</button></div>}
    <div className="seller-table-wrap"><table className="seller-table"><thead><tr><th>PRODUCT DETAILS</th><th>CATEGORY</th><th>SELLING PRICE</th><th>AVAILABLE STOCK</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>
      {loading ? Array.from({ length: 4 }, (_, index) => <tr key={index} className="seller-skeleton-row"><td colSpan={6}><span /></td></tr>) : result?.products.map((product) => {
        const stockStatus = product.stock === 0 ? "out_of_stock" : product.stock <= 5 ? "low_stock" : "in_stock";
        return <tr key={product._id}><td><div className="seller-product-cell"><img src={product.image} alt="" loading="lazy" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = "/product-placeholder.svg"; }} /><div><Link to={`/products/${product._id}`}>{product.name}<ArrowUpRight size={12} /></Link><span>ID: {product._id.slice(-8).toUpperCase()}{product.variants?.length ? ` · ${product.variants.length} options` : ""}</span></div></div></td><td>{product.category}</td><td><strong className="seller-table-price">{money(product.price)}</strong>{product.compareAtPrice > product.price && <del>{money(product.compareAtPrice)}</del>}</td><td><strong className={product.stock <= 5 ? "seller-stock-number warning" : "seller-stock-number"}>{product.stock}</strong><small className="seller-units">units</small></td><td><span className={`seller-status ${stockStatus}`}><span />{stockStatus.replaceAll("_", " ")}</span></td><td><div className="seller-row-actions"><button className="seller-edit-action" onClick={() => onEdit(product)}><Pencil size={14} />{inventory ? "Update stock" : "Edit"}</button><button className="seller-delete-action" aria-label={`Delete ${product.name}`} title="Delete product" disabled={Boolean(deleting)} onClick={() => deleteProduct(product)}>{deleting === product._id ? <LoaderCircle size={15} className="spin" /> : <Trash2 size={15} />}</button></div></td></tr>;
      })}
    </tbody></table></div>
    {loading && <span className="seller-screen-reader" role="status">Loading your catalogs...</span>}
    {!loading && result && !result.products.length && <div className="seller-catalog-empty"><span><Package size={28} /></span><h3>{search || filter ? "No catalogs match this view" : "Your first good find starts here"}</h3><p>{search || filter ? "Try another search or view all of your product listings." : "Add your first product with a clear photo, price and available stock."}</p>{search || filter ? <button className="seller-secondary-button" onClick={() => { setSearchInput(""); setSearch(""); setPage(1); onFilter(""); }}>Clear filters</button> : <button className="seller-primary-button" onClick={onCreate}><Plus size={16} />Add your first product</button>}</div>}
    <div className="seller-pagination"><span>{result ? `${result.total ? (page - 1) * 25 + 1 : 0}–${Math.min(page * 25, result.total)} of ${result.total} products` : loading ? "Loading catalogs..." : "Catalog unavailable"}</span><div><button aria-label="Previous catalog page" disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={16} /></button><span>Page {page} of {Math.max(1, result?.pages || 1)}</span><button aria-label="Next catalog page" disabled={loading || !result || page >= result.pages} onClick={() => setPage((value) => value + 1)}><ChevronRight size={16} /></button></div></div>
  </section>;
}
