import { useEffect, useState } from "react";
import api, { getErrorMessage } from "../api.js";
import { categories as previewCategories, demoProducts } from "../data.js";

export function useProducts(params = {}) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const query = new URLSearchParams(params).toString();

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.get(`/products${query ? `?${query}` : ""}`)
      .then(({ data }) => {
        if (active) {
          setProducts(Array.isArray(data.products) ? data.products : []);
          setError("");
        }
      })
      .catch((error) => {
        if (active) {
          const filtered = demoProducts.filter((product) => {
            const category = params.category;
            const search = (params.search || "").toLowerCase();
            return (!category || product.categorySlug === category)
              && (params.sale !== "true" || product.compareAtPrice > product.price)
              && (params.featured !== "true" || product.featured)
              && (!search || `${product.name} ${product.category} ${product.description}`.toLowerCase().includes(search));
          });
          setProducts(filtered.slice(0, Number(params.limit) || 100));
          setError("Demo catalog — sample products, prices and reviews for exploring the store.");
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query]);

  return { products, loading, error };
}

export function useProduct(id) {
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.get(`/products/${encodeURIComponent(id)}`)
      .then(({ data }) => {
        if (active) {
          setProduct(data.product);
          setError("");
        }
      })
      .catch((error) => {
        if (active) {
          setProduct(demoProducts.find((item) => item._id === id) || null);
          setError("Demo product — connect the live catalog to order this item.");
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  return { product, loading, error };
}

export function useCategories() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api.get("/categories")
      .then(({ data }) => {
        if (active) {
          setItems(Array.isArray(data.categories) ? data.categories : []);
          setError("");
        }
      })
      .catch((error) => {
        if (active) {
          setItems(previewCategories);
          setError("Demo collections — explore the sample store.");
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return { categories: items, loading, error };
}
