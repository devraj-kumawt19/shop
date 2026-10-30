import { NotificationsPage, ShoppingAssistant } from "./CommerceWidgets.jsx";
import SellerPage from "./seller/SellerPage.jsx";
import SellerOnboarding from "./seller/SellerOnboarding.jsx";
import WalletPage from "./WalletPage.jsx";
import DealsPage from "./DealsPage.jsx";
import QuickDeliveryPage from "./QuickDeliveryPage.jsx";
import { useEffect, useRef } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ShoppingBag } from "lucide-react";
import { ShopProvider, useShop } from "./ShopContext.jsx";
import { SiteFooter, StatusMessage } from "./components.jsx";
import Header from "./Header.jsx";
import PageTransition from "./PageTransition.jsx";
import { useCategories } from "./hooks/useProducts.js";
import SuperAdminRoutes from "./super-admin/SuperAdminRoutes.jsx";
import {
  AuthPage, CartPage, CheckoutPage, HomePage, NotFoundPage,
  OrderDetailsPage, OrdersPage, ProductDetailPage, ProductsPage, ProfilePage, WishlistPage,
} from "./pages.jsx";

function RouteTracker() {
  const location = useLocation();
  const routeKey = `${location.pathname}${location.search}`;
  const previousRoute = useRef(routeKey);
  const { refreshUser } = useShop();
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);
  useEffect(() => {
    const changed = previousRoute.current !== routeKey;
    previousRoute.current = routeKey;
    if (location.hash) {
      let anchor = location.hash.slice(1);
      try { anchor = decodeURIComponent(anchor); } catch { /* Keep malformed anchors harmless. */ }
      document.getElementById(anchor)?.scrollIntoView();
      return;
    }
    const root = document.documentElement;
    const previousBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    root.style.scrollBehavior = previousBehavior;
    if (changed) {
      const content = document.getElementById("main-content");
      if (content) { content.tabIndex = -1; content.focus({ preventScroll: true }); }
    }
  }, [routeKey, location.hash]);
  return null;
}

function Toast({ hasFloatingCart }) {
  const { toast } = useShop();
  return toast ? <div className={`toast-message ${hasFloatingCart ? "toast-message-with-cart" : ""}`} role="status" aria-live="polite">{toast}</div> : null;
}

function FloatingCart({ count }) {
  if (!count) return null;
  return (
    <Link className="floating-cart" to="/cart" aria-label={`Open your bag, ${count} ${count === 1 ? "item" : "items"}`}>
      <ShoppingBag size={21} strokeWidth={1.8} aria-hidden="true" />
      <span className="floating-cart-count" aria-hidden="true">{count > 99 ? "99+" : count}</span>
    </Link>
  );
}

function AppRoutes() {
  const pathname = useLocation().pathname;
  const controlPanel = pathname === "/seller" || pathname === "/super-admin" || pathname.startsWith("/super-admin/") || pathname === "/admin" || pathname.startsWith("/admin/");
  const authPage = pathname === "/login" || pathname === "/register" || pathname === "/seller/register";
  const { cart, settingsError } = useShop();
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const showFloatingCart = cartCount > 0 && pathname !== "/cart" && !controlPanel && !authPage;
  return (
    <>
      <RouteTracker />
      <a className="skip-link" href="#main-content">Skip to content</a>
      {!controlPanel && !authPage && <Header />}
      {!controlPanel && !import.meta.env.DEV && settingsError && <div className="page-width app-api-error"><StatusMessage tone="error">{settingsError}</StatusMessage></div>}
      <Toast hasFloatingCart={showFloatingCart} />
      {showFloatingCart && <FloatingCart count={cartCount} />}
      {!controlPanel && <ShoppingAssistant />}
      <PageTransition>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/products/:id" element={<ProductDetailPage />} />
        <Route path="/categories/:category" element={<ProductsPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/wishlist" element={<WishlistPage />} />
        <Route path="/wallet" element={<WalletPage />} />
        <Route path="/sale" element={<DealsPage />} />
        <Route path="/quick-delivery" element={<QuickDeliveryPage />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage key="register" mode="register" />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/my-orders" element={<OrdersPage />} />
        <Route path="/my-orders/:id" element={<OrderDetailsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/management/*" element={<Navigate to="/super-admin/commerce" replace />} />
        <Route path="/admin/*" element={<Navigate to="/seller" replace />} />
        <Route path="/sell" element={<SellerOnboarding />} />
        <Route path="/seller/register" element={<AuthPage key="seller-register" mode="register" seller />} />
        <Route path="/seller" element={<SellerPage />} />
        <Route path="/super-admin/*" element={<SuperAdminRoutes />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </PageTransition>
      {!controlPanel && !authPage && <SiteFooter />}
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ShopProvider>
        <AppRoutes />
      </ShopProvider>
    </BrowserRouter>
  );
}
