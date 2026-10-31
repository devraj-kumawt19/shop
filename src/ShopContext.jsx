import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { getErrorMessage } from "./api.js";
import { defaultStoreSettings, formatMoney } from "../server/storeSettings.js";

const ShopContext = createContext(null);
const readStored = (key, fallback) => {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
};

export function ShopProvider({ children }) {
  const [cart, setCart] = useState(() => readStored("luxecarts_cart", []));
  const [wishlist, setWishlist] = useState(() => readStored("luxecarts_wishlist", []));
  const [user, setUser] = useState(() => readStored("luxecarts_user", null));
  const [toast, setToast] = useState("");
  const [settings, setSettings] = useState(defaultStoreSettings);
  const [settingsError, setSettingsError] = useState("");
  const navigate = useNavigate();
  const refreshedCurrency = useRef("");
  const settingsRequest = useRef(null);

  const refreshSettings = useCallback(() => {
    // Share concurrent reads, including React StrictMode's repeated mount effect.
    if (settingsRequest.current) return settingsRequest.current;
    const request = (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const { data } = await api.get("/settings");
          if (!data.settings || typeof data.settings !== "object" || Array.isArray(data.settings)) throw new Error("LUXE CARTS API response is invalid.");
          setSettings({ ...defaultStoreSettings, ...data.settings });
          setSettingsError("");
          return;
        } catch (error) {
          const status = error.response?.status;
          const retryable = [408, 429, 500, 502, 503, 504].includes(status) || !error.response && ["ERR_NETWORK", "ECONNABORTED"].includes(error.code);
          if (attempt < 2 && retryable) {
            await new Promise(resolve => window.setTimeout(resolve, 400 * 2 ** attempt));
            continue;
          }
          setSettingsError(getErrorMessage(error));
          return;
        }
      }
    })();
    settingsRequest.current = request;
    request.finally(() => { settingsRequest.current = null; });
    return request;
  }, []);
  useEffect(() => {
    refreshSettings();
    window.addEventListener("online", refreshSettings);
    return () => window.removeEventListener("online", refreshSettings);
  }, [refreshSettings]);
  useEffect(() => {
    document.documentElement.style.setProperty("--blue", settings.primaryColor);
    document.documentElement.style.setProperty("--rust", settings.primaryColor);
    const darker = settings.primaryColor.replace(/[0-9a-f]{2}/gi, (part) => Math.round(parseInt(part, 16) * .82).toString(16).padStart(2, "0"));
    document.documentElement.style.setProperty("--blue-dark", darker);
    document.title = `${settings.siteName} — Good things for every day`;
  }, [settings.primaryColor, settings.siteName]);

  useEffect(() => { localStorage.setItem("luxecarts_cart", JSON.stringify(cart)); }, [cart]);
  useEffect(() => { localStorage.setItem("luxecarts_wishlist", JSON.stringify(wishlist)); }, [wishlist]);
  useEffect(() => { localStorage.setItem("luxecarts_user", JSON.stringify(user)); }, [user]);
  useEffect(() => {
    if (settingsError || refreshedCurrency.current === settings.currency) return;
    const ids = [...new Set([...cart.map((item) => item.product._id), ...wishlist.map((p) => p._id)])].filter((id) => /^[a-f0-9]{24}$/i.test(id));
    if (!ids.length) return;
    const controller = new AbortController();
    Promise.allSettled(ids.map((id) => api.get(`/products/${id}`, { signal: controller.signal }))).then((results) => {
      if (controller.signal.aborted) return;
      refreshedCurrency.current = settings.currency;
      const fresh = new Map(results.filter((r) => r.status === "fulfilled").map((r) => [r.value.data.product._id, r.value.data.product]));
      setCart((current) => current.map((item) => {
        const product = fresh.get(item.product._id); if (!product) return item;
        const variant = product.variants?.find((v) => v.sku === item.variantSku);
        return { ...item, currency: settings.currency, product: { ...product, price: variant?.price ?? product.price, stock: variant?.stock ?? product.stock } };
      }));
      setWishlist((current) => current.map((product) => fresh.get(product._id) || product));
    });
    return () => controller.abort();
  }, [settings.currency, settingsError]);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const refreshUser = useCallback(() => {
    const token = localStorage.getItem("luxecarts_token");
    if (!token) return;
    api.get("/auth/me")
      .then(({ data }) => setUser(data.user))
      .catch((error) => {
        if (![401, 403].includes(error.response?.status)) return;
        localStorage.removeItem("luxecarts_token");
        localStorage.removeItem("luxecarts_user");
        setUser(null);
      });
  }, []);

  const signIn = async (credentials, mode, endpoint = `/auth/${mode}`) => {
    const { data } = await api.post(endpoint, credentials);
    if (typeof data.token !== "string" || !data.user || typeof data.user !== "object") {
      throw new Error("LUXE CARTS API response is invalid.");
    }
    localStorage.setItem("luxecarts_token", data.token);
    setUser(data.user);
    return data.user;
  };

  const updateProfile = async (profile) => {
    const { data } = await api.patch("/auth/profile", profile);
    if (!data.user || typeof data.user !== "object") {
      throw new Error("LUXE CARTS API response is invalid.");
    }
    setUser(data.user);
    return data.user;
  };

  const logout = (destination = "/") => {
    localStorage.removeItem("luxecarts_token");
    setUser(null);
    setToast("You’ve been signed out.");
    navigate(typeof destination === "string" ? destination : "/");
  };

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api.put("/cart", { items: cart.map(({ product, quantity, variantSku }) => ({ product: product._id, quantity, variantSku })) }, { signal: controller.signal }).catch(() => {});
    }, 1200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [cart, user?.id]);

  const addToCart = (product, quantity = 1, variantSku = "") => {
    const variant = product.variants?.find((item) => item.sku === variantSku);
    if (product.variants?.length && !variant) { navigate(`/products/${product._id}`); return; }
    const stock = variant?.stock ?? product.stock;
    if (stock < 1) { setToast("This option is currently out of stock."); return; }
    const cartKey = variant ? `${product._id}:${variant.sku}` : product._id;
    const snapshot = { ...product, price: variant?.price ?? product.price, stock };
    setCart((current) => {
      const match = current.find((item) => (item.cartKey || item.product._id) === cartKey);
      return match
        ? current.map((item) => (item.cartKey || item.product._id) === cartKey ? { ...item, product: snapshot, quantity: Math.min(item.quantity + quantity, stock, 99) } : item)
        : [...current, { product: snapshot, currency: settings.currency, quantity: Math.min(quantity, stock, 99), cartKey, variantSku, variantLabel: variant ? [variant.size, variant.color].filter(Boolean).join(" / ") || variant.sku : "" }];
    });
    setToast(`${product.name} added to your bag`);
  };

  const updateQuantity = (productId, quantity) => {
    setCart((current) => quantity < 1
      ? current.filter((item) => (item.cartKey || item.product._id) !== productId)
      : current.map((item) => (item.cartKey || item.product._id) === productId ? { ...item, quantity: Math.min(quantity, item.product.stock || 99, 99) } : item));
  };

  const toggleWishlist = (product) => {
    const exists = wishlist.some((item) => item._id === product._id);
    setWishlist((current) => exists ? current.filter((item) => item._id !== product._id) : [...current, product]);
    setToast(exists ? "Removed from your wishlist" : "Saved to your wishlist");
  };

  const value = useMemo(() => ({
    cart, wishlist, user, toast, settings, settingsError, refreshSettings, refreshUser, signIn, updateProfile, logout, addToCart,
    updateQuantity, toggleWishlist, setCart, setToast,
  }), [cart, wishlist, user, toast, settings, settingsError, refreshSettings, refreshUser]);

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop() {
  const context = useContext(ShopContext);
  if (!context) throw new Error("useShop must be used within ShopProvider");
  return context;
}

export function useMoney() {
  const { settings } = useShop();
  return (amount, currency = settings.currency) => formatMoney(amount, currency);
}
