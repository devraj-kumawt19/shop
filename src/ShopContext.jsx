import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
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
  const [cart, setCart] = useState(() => readStored("shopsphere_cart", []));
  const [wishlist, setWishlist] = useState(() => readStored("shopsphere_wishlist", []));
  const [user, setUser] = useState(() => readStored("shopsphere_user", null));
  const [toast, setToast] = useState("");
  const [settings, setSettings] = useState(defaultStoreSettings);
  const [settingsError, setSettingsError] = useState("");
  const navigate = useNavigate();

  const refreshSettings = useCallback(async () => {
    try {
      const { data } = await api.get("/settings");
      if (!data.settings || typeof data.settings !== "object") throw new Error("ShopSphere API response is invalid.");
      setSettings({ ...defaultStoreSettings, ...data.settings });
      setSettingsError("");
    } catch (error) {
      setSettingsError(getErrorMessage(error));
    }
  }, []);
  useEffect(() => { refreshSettings(); }, [refreshSettings]);
  useEffect(() => {
    document.documentElement.style.setProperty("--blue", settings.primaryColor);
    document.documentElement.style.setProperty("--rust", settings.primaryColor);
    const darker = settings.primaryColor.replace(/[0-9a-f]{2}/gi, (part) => Math.round(parseInt(part, 16) * .82).toString(16).padStart(2, "0"));
    document.documentElement.style.setProperty("--blue-dark", darker);
    document.title = `${settings.siteName} — Good things for every day`;
  }, [settings.primaryColor, settings.siteName]);

  useEffect(() => { localStorage.setItem("shopsphere_cart", JSON.stringify(cart)); }, [cart]);
  useEffect(() => { localStorage.setItem("shopsphere_wishlist", JSON.stringify(wishlist)); }, [wishlist]);
  useEffect(() => { localStorage.setItem("shopsphere_user", JSON.stringify(user)); }, [user]);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const refreshUser = useCallback(() => {
    const token = localStorage.getItem("shopsphere_token");
    if (!token) return;
    api.get("/auth/me")
      .then(({ data }) => setUser(data.user))
      .catch((error) => {
        if (![401, 403].includes(error.response?.status)) return;
        localStorage.removeItem("shopsphere_token");
        localStorage.removeItem("shopsphere_user");
        setUser(null);
      });
  }, []);

  const signIn = async (credentials, mode) => {
    const { data } = await api.post(`/auth/${mode}`, credentials);
    if (typeof data.token !== "string" || !data.user || typeof data.user !== "object") {
      throw new Error("ShopSphere API response is invalid.");
    }
    localStorage.setItem("shopsphere_token", data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem("shopsphere_token");
    setUser(null);
    setToast("You’ve been signed out.");
    navigate("/");
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
        : [...current, { product: snapshot, quantity: Math.min(quantity, stock, 99), cartKey, variantSku, variantLabel: variant ? [variant.size, variant.color].filter(Boolean).join(" / ") || variant.sku : "" }];
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
    cart, wishlist, user, toast, settings, settingsError, refreshSettings, refreshUser, signIn, logout, addToCart,
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
