import { NotificationsPage, ShoppingAssistant } from "./CommerceWidgets.jsx";
import AdvancedAdmin from "./AdvancedAdmin.jsx";
import { useEffect, useRef } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { ShopProvider, useShop } from "./ShopContext.jsx";
import { SiteFooter, StatusMessage } from "./components.jsx";
import Header from "./Header.jsx";
import PageTransition from "./PageTransition.jsx";
import { useCategories } from "./hooks/useProducts.js";
import SuperAdminPage from "./SuperAdminPage.jsx";
import {
  AdminPage, AuthPage, CartPage, CheckoutPage, HomePage, NotFoundPage,
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

function Toast() {
  const { toast } = useShop();
  return toast ? <div className="toast-message" role="status" aria-live="polite">{toast}</div> : null;
}

function AppRoutes() {
  const pathname = useLocation().pathname;
  const controlPanel = pathname === "/super-admin";
  const authPage = pathname === "/login" || pathname === "/register";
  const { settingsError } = useShop();
  return (
    <>
      <RouteTracker />
      <a className="skip-link" href="#main-content">Skip to content</a>
      {!controlPanel && !authPage && <Header />}
      {!import.meta.env.DEV && settingsError && <div className="page-width app-api-error"><StatusMessage tone="error">{settingsError}</StatusMessage></div>}
      <Toast />
      <ShoppingAssistant />
      <PageTransition>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/products/:id" element={<ProductDetailPage />} />
        <Route path="/categories/:category" element={<ProductsPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/wishlist" element={<WishlistPage />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/my-orders" element={<OrdersPage />} />
        <Route path="/my-orders/:id" element={<OrderDetailsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/management" element={<AdvancedAdmin />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/super-admin" element={<SuperAdminPage />} />
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
