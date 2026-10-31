import { useEffect, useState } from "react";
import api, { getErrorMessage } from "../api.js";
import { categories as previewCategories, demoProducts } from "../data.js";

export function useProducts(params = {}) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 0 });
  const query = new URLSearchParams(params).toString();

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.get(`/products${query ? `?${query}` : ""}`)
      .then(({ data }) => {
        if (!Array.isArray(data.products) || !Number.isInteger(data.total) || !Number.isInteger(data.page) || !Number.isInteger(data.pages)) {
          throw new Error("LUXE CARTS API response is invalid.");
        }
        if (active) {
          setProducts(data.products);
          setPagination({ total: data.total, page: data.page, pages: data.pages });
          setError("");
        }
      })
      .catch((error) => {
        if (active) {
          if (import.meta.env.DEV) {
            const filtered = demoProducts.filter((product) => {
              const category = params.category;
              const search = (params.search || "").toLowerCase();
              return (!category || product.categorySlug === category)
                && (params.sale !== "true" || product.compareAtPrice > product.price)
                && (params.featured !== "true" || product.featured)
                && (params.quick !== "true" || product.quickEligible === true)
                && (!search || `${product.name} ${product.category} ${product.description}`.toLowerCase().includes(search));
            });
            filtered.sort((a, b) => {
              if (params.sort === "price-low") return a.price - b.price;
              if (params.sort === "price-high") return b.price - a.price;
              if (params.sort === "rating") return b.rating - a.rating;
              return Number(b.featured) - Number(a.featured);
            });
            const limit = Number(params.limit) || 100;
            const page = Number(params.page) || 1;
            setProducts(filtered.slice((page - 1) * limit, page * limit));
            setPagination({ total: filtered.length, page, pages: Math.ceil(filtered.length / limit) });
            setError("Demo catalog — sample products, prices and reviews for exploring the store.");
          } else {
            setProducts([]);
            setPagination({ total: 0, page: 1, pages: 0 });
            setError(getErrorMessage(error));
          }
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query]);

  return { products, loading, error, pagination };
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
        if (!data.product || typeof data.product !== "object") throw new Error("LUXE CARTS API response is invalid.");
        if (active) {
          setProduct(data.product);
          setError("");
        }
      })
      .catch((error) => {
        if (active) {
          if (import.meta.env.DEV) {
            setProduct(demoProducts.find((item) => item._id === id) || null);
            setError("Demo product — connect the live catalog to order this item.");
          } else {
            setProduct(null);
            setError(getErrorMessage(error));
          }
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
        if (!Array.isArray(data.categories)) throw new Error("LUXE CARTS API response is invalid.");
        if (active) {
          setItems(data.categories);
          setError("");
        }
      })
      .catch((error) => {
        if (active) {
          if (import.meta.env.DEV) {
            setItems(previewCategories);
            setError("Demo collections — explore the sample store.");
          } else {
            setItems([]);
            setError(getErrorMessage(error));
          }
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return { categories: items, loading, error };
}
