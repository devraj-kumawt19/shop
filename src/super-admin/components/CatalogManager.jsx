import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, ChevronRight, LoaderCircle } from "lucide-react";
import api, { getErrorMessage } from "../../api.js";
import { useMoney, useShop } from "../../ShopContext.jsx";
import { StatusMessage } from "../../components.jsx";
import { RequireAuth } from "../../pages.jsx";
import { can } from "../../../server/super-admin/permissions.js";
import { formatMoney } from "../../../server/storeSettings.js";
import VariantEditor from "./VariantEditor.jsx";

const orderTotalLabel = (orders) => { const totals = {}; for (const order of orders.filter((item) => !["cancelled", "awaiting_payment"].includes(item.status))) { const currency = order.currency || "USD"; totals[currency] = (totals[currency] || 0) + order.total; } return Object.entries(totals).map(([currency, total]) => formatMoney(total, currency)).join(" / ") || "-"; };

export default function CatalogManager({ embedded = false, initialTab = "products", seller = false, enhanced = false }) {
  const money = useMoney();
  const { user } = useShop();
  const catalogAccess = can(user, "catalog"), ordersAccess = can(user, "orders") || can(user, "support");
  const [variants, setVariants] = useState([]);
  const AdminContainer = embedded ? "section" : "main";
  const [products, setProducts] = useState([]);
  const [categoryItems, setCategoryItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState(can(user, "catalog") ? initialTab : "orders");
  const [formOpen, setFormOpen] = useState(false);
  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [listSearchInput, setListSearchInput] = useState("");
  const [listSearch, setListSearch] = useState("");
  const [listFilter, setListFilter] = useState("");
  const [listPage, setListPage] = useState(1);
  const [listMeta, setListMeta] = useState({ total: 0, pages: 0 });
  const [listLoading, setListLoading] = useState(false);

  async function loadDashboard(signal) {
    if (enhanced) setListLoading(true);
    try {
      const query = enhanced ? `?page=${listPage}&search=${encodeURIComponent(listSearch)}&status=${encodeURIComponent(listFilter)}` : "";
      const [productResult, orderResult, categoryResult] = await Promise.all([
        catalogAccess && (!enhanced || tab === "products") ? api.get(`/admin/products${query}`, { signal }) : Promise.resolve({ data: { products: [] } }), ordersAccess && (!enhanced || tab === "orders") ? api.get(`/admin/orders${query}`, { signal }) : Promise.resolve({ data: { orders: [] } }), catalogAccess ? api.get("/admin/categories") : Promise.resolve({ data: { categories: [] } }),
      ]);
      if (signal?.aborted) return;
      setProducts(productResult.data.products);
      setOrders(orderResult.data.orders);
      setCategoryItems(categoryResult.data.categories);
      if (enhanced) {
        const meta = tab === "orders" ? orderResult.data : productResult.data;
        setListMeta({ total: meta.total || 0, pages: meta.pages || 0 });
        if (listPage > Math.max(1, meta.pages || 0)) setListPage(Math.max(1, meta.pages || 0));
      }
      setError("");
    } catch (requestError) { if (!signal?.aborted) setError(getErrorMessage(requestError)); }
    finally { if (enhanced && !signal?.aborted) setListLoading(false); }
  }
  useEffect(() => { const controller = new AbortController(); loadDashboard(controller.signal); return () => controller.abort(); }, [user?.id, user?.role, user?.permissions, listPage, listSearch, listFilter]);

  async function saveProduct(event) {
    event.preventDefault();
    setBusy(true);
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const chosenCategory = categoryItems.find((item) => item.slug === form.category);
    const payload = {
      ...form,
      ...(seller || can(user, "inventory") ? { variants } : {}),
      price: Number(form.price),
      compareAtPrice: Number(form.compareAtPrice || 0),
      stock: Number(form.stock),
      featured: form.featured === "on",
      isDemo: form.isDemo === "on",
      quickEligible: form.quickEligible === "on",
      category: chosenCategory?.name || form.category,
      categorySlug: form.category,
    };
    if (editing && !seller) delete payload.stock;
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
    <RequireAuth superAdmin={!seller} seller={seller}>
      <AdminContainer id={embedded ? undefined : "main-content"} className={embedded ? "admin-page admin-embedded" : "page-width admin-page"}>
        <div className="breadcrumbs"><Link to="/">Home</Link><ChevronRight size={13} /><span>{seller ? "Seller" : "Super Admin"}</span></div>
        <div className="section-heading"><div><span className="eyebrow">{seller ? "YOUR MARKETPLACE STORE" : "THE SHOP, BEHIND THE SCENES"}</span><h1>{seller ? <>Seller <em>studio.</em></> : <>ShopSphere <em>studio.</em></>}</h1></div>{!seller && <Link className="button button-dark" to="/super-admin/commerce">Commerce tools <ArrowUpRight size={16} /></Link>}</div>
        {error && <StatusMessage tone="error">{error}</StatusMessage>}
        {notice && <StatusMessage tone="success">{notice}</StatusMessage>}
        {enhanced && <><div className="sa-catalog-filters"><form className="control-search" onSubmit={(event) => { event.preventDefault(); setListSearch(listSearchInput.trim()); setListPage(1); }}><input aria-label={tab === "orders" ? "Search order number, customer name or email" : "Search products by name or category"} placeholder={tab === "orders" ? "Order number, customer name or email…" : "Product name or category…"} maxLength={100} value={listSearchInput} onChange={(event) => setListSearchInput(event.target.value)} /><button disabled={listLoading}>Search</button></form><label>{tab === "orders" ? "Order status" : "Stock"}<select aria-label={tab === "orders" ? "Order status" : "Stock filter"} value={listFilter} onChange={(event) => { setListFilter(event.target.value); setListPage(1); }}><option value="">All {tab === "orders" ? "statuses" : "products"}</option>{(tab === "orders" ? ["awaiting_payment", "placed", "processing", "shipped", "delivered", "cancelled"] : ["in_stock", "low_stock", "out_of_stock"]).map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label></div>{listLoading && <div className="control-loading" role="status"><LoaderCircle className="spin" size={22} />Loading {tab}…</div>}<div className="control-pagination"><span>{listMeta.total} {tab} · Page {listPage} of {Math.max(1, listMeta.pages)}</span><div><button disabled={listPage <= 1 || listLoading} onClick={() => setListPage((value) => value - 1)}>Previous</button><button disabled={listPage >= listMeta.pages || listLoading} onClick={() => setListPage((value) => value + 1)}>Next</button></div></div></>}
        <div className="admin-stats"><div><span>PRODUCTS</span><b>{products.length}</b></div><div><span>CATEGORIES</span><b>{categoryItems.length}</b></div><div><span>ACTIVE ORDER VALUE</span><b>{orderTotalLabel(orders)}</b></div></div>
        <div className="admin-toolbar">
          <div className="admin-tabs">
            {catalogAccess && <button className={tab === "products" ? "active" : ""} onClick={() => setTab("products")}>Products</button>}
            {catalogAccess && !seller && <button className={tab === "categories" ? "active" : ""} onClick={() => setTab("categories")}>Categories</button>}
            {ordersAccess && <button className={tab === "orders" ? "active" : ""} onClick={() => setTab("orders")}>Orders</button>}
          </div>
          {tab === "products" && <button className="button button-dark" onClick={() => { setEditing(null); setVariants([]); setFormOpen(!formOpen); }}>+ Add product</button>}
          {tab === "categories" && <button className="button button-dark" onClick={() => { setEditingCategory(null); setCategoryFormOpen(!categoryFormOpen); }}>+ Add category</button>}
        </div>
        {formOpen && tab === "products" && <form key={editing?._id || "new-product"} className="admin-product-form" onSubmit={saveProduct}>
          <h2>{editing ? "Edit product" : "Add a thoughtful find"}</h2>
          <div className="form-grid">
            <label>Product name<input name="name" defaultValue={editing?.name} required /></label>
            <label>Category<select name="category" defaultValue={categoryItems.find((item) => item.name === editing?.category)?.slug || ""} required><option value="" disabled>Choose a category</option>{categoryItems.map((item) => <option value={item.slug} key={item._id}>{item.name}</option>)}</select></label>
            <label>Price<input name="price" type="number" step=".01" min=".01" defaultValue={editing?.price} required /></label>
            <label>Compare at<input name="compareAtPrice" type="number" step=".01" min="0" defaultValue={editing?.compareAtPrice || 0} /></label>
            <label>Stock<input name="stock" type="number" min="0" defaultValue={editing?.stock || 0} required readOnly={Boolean(editing) && !seller} />{editing && !seller && <small>Adjust stock in <Link to="/super-admin/commerce">Commerce tools / Inventory</Link>.</small>}</label>
            <label>Badge<input name="badge" defaultValue={editing?.badge} placeholder="BESTSELLER" /></label>
          </div>
          {(seller || can(user, "inventory")) && <VariantEditor value={variants} onChange={setVariants} existing={editing?.variants || []} allowStockChanges={seller} />}
          <label>Image URL<input name="image" type="url" defaultValue={editing?.image} required /></label>
          <label>Description<textarea name="description" rows="3" defaultValue={editing?.description} required /></label>
          {!seller && <label className="check-field"><input name="featured" type="checkbox" defaultChecked={editing?.featured} /> Show on homepage featured products</label>}
          {!seller && <label className="check-field"><input name="quickEligible" type="checkbox" defaultChecked={editing?.quickEligible} /> Eligible for 15-minute delivery in configured areas</label>}
          {!seller && <label className="check-field"><input name="isDemo" type="checkbox" defaultChecked={editing?.isDemo} /> Demo product (test payments only)</label>}
          <div className="admin-form-actions"><button type="button" className="button button-quiet" onClick={() => { setEditing(null); setFormOpen(false); }}>Cancel</button><button className="button button-dark" disabled={busy}>{busy ? "Saving..." : editing ? "Save changes" : "Create product"}</button></div>
        </form>}
        {categoryFormOpen && tab === "categories" && <form key={editingCategory?._id || "new-category"} className="admin-product-form" onSubmit={saveCategory}>
          <h2>{editingCategory ? "Edit collection" : "Add a collection"}</h2>
          <div className="form-grid"><label>Category name<input name="name" defaultValue={editingCategory?.name} required minLength="2" /></label><label>URL slug<input name="slug" defaultValue={editingCategory?.slug} placeholder="auto-created-from-name" /></label></div>
          <label>Image URL<input name="image" type="url" defaultValue={editingCategory?.image} placeholder="https://..." /></label>
          <label>Description<input name="description" defaultValue={editingCategory?.description} /></label>
          <div className="admin-form-actions"><button type="button" className="button button-quiet" onClick={() => { setCategoryFormOpen(false); setEditingCategory(null); }}>Cancel</button><button className="button button-dark" disabled={busy}>{busy ? "Saving..." : editingCategory ? "Save category" : "Create category"}</button></div>
        </form>}
        {tab === "products" && (!enhanced || !listLoading) && <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>PRODUCT</th><th>CATEGORY</th>{user?.role === "superadmin" && <th>SELLER</th>}<th>PRICE</th><th>STOCK</th><th>ACTIONS</th></tr></thead><tbody>{products.map((product) => <tr key={product._id}><td><div className="admin-product-name"><img src={product.image} alt="" /><span>{product.name}</span></div></td><td>{product.category}</td>{user?.role === "superadmin" && <td>{product.seller?.name || "Shop owner"}</td>}<td>{money(product.price)}</td><td>{product.stock}</td><td><button onClick={() => { setEditing(product); setVariants((product.variants || []).map(({ sku, size, color, price, stock }) => ({ sku, size, color, price, stock }))); setFormOpen(true); window.scrollTo({ top: 500, behavior: "smooth" }); }}>Edit</button><button className="delete-button" onClick={() => deleteProduct(product)}>Delete</button></td></tr>)}</tbody></table>{!products.length && <p className="admin-empty">{seller ? "No listings yet. Add your first product above." : "No products yet. Create your first one above."}</p>}</div>}
        {tab === "categories" && <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>CATEGORY</th><th>URL SLUG</th><th>DESCRIPTION</th><th>ACTIONS</th></tr></thead><tbody>{categoryItems.map((category) => <tr key={category._id}><td>{category.name}</td><td>{category.slug}</td><td>{category.description || "—"}</td><td><button onClick={() => { setEditingCategory(category); setCategoryFormOpen(true); window.scrollTo({ top: 500, behavior: "smooth" }); }}>Edit</button><button className="delete-button" onClick={() => deleteCategory(category)}>Delete</button></td></tr>)}</tbody></table>{!categoryItems.length && <p className="admin-empty">No categories yet. Create a collection above.</p>}</div>}
        {tab === "orders" && ordersAccess && (!enhanced || !listLoading) && <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>TOTAL</th><th>PAYMENT</th><th>STATUS</th></tr></thead><tbody>{orders.map((order) => <tr key={order._id}><td>{order.orderNumber}</td><td>{order.user?.name || order.shippingAddress.firstName}</td><td>{money(order.total, order.currency || "USD")}</td><td><span>{order.paymentMethod === "wallet" ? `Wallet - ${order.paymentStatus}` : order.paymentMethod === "razorpay" ? `Online - ${order.paymentStatus || "pending"}` : "Cash on delivery"}</span><small className="admin-email-status">Email: {order.emailStatus?.customer || "not_queued"}</small><button disabled={busy || !can(user, "orders") || order.status === "awaiting_payment"} onClick={() => retryEmails(order._id)}>Retry unsent emails</button></td><td><select disabled={!can(user, "orders") || order.status === "awaiting_payment" || order.paymentStatus === "refund_required"} value={order.status} onChange={(event) => changeOrderStatus(order._id, event.target.value)}><option value="awaiting_payment" disabled>Awaiting payment</option><option value="placed">Placed</option><option value="processing">Processing</option><option value="shipped">Shipped</option><option value="delivered">Delivered</option><option value="cancelled">Cancelled</option></select></td></tr>)}</tbody></table>{!orders.length && <p className="admin-empty">Orders will show up here when customers check out.</p>}</div>}
      </AdminContainer>
    </RequireAuth>
  );
}

