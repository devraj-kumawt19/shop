export const defaultStoreSettings = {
  siteName: "ShopSphere",
  tagline: "A little discovery. A lot to love.",
  announcement: "Free shipping on orders over $75",
  heroHeading: "Good things.\nGreat days.",
  heroAccent: "All yours.",
  heroDescription: "A little upgrade goes a long way. Discover beautifully considered finds for your home, your routine, and everything in between.",
  heroImage: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1000&q=85",
  supportEmail: "hello@shopsphere.example",
  footerDescription: "Considered pieces for everyday living. Found with care. Ready for real life.",
  primaryColor: "#2563eb",
  freeShippingThreshold: 75,
  shippingFee: 6.95,
  checkoutEnabled: true,
  currency: "USD",
  onlinePaymentsEnabled: false,
  saleEnabled: true,
  saleTitle: "Good finds. Even better prices.",
  saleDescription: "The pieces you love, with a little extra to love about the price.",
  lowStockThreshold: 5,
  aiAssistantEnabled: false,
};

export function shippingFor(subtotal, settings = defaultStoreSettings) {
  return subtotal >= settings.freeShippingThreshold ? 0 : settings.shippingFee;
}

export function formatMoney(amount, currency = "USD") {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency }).format(Number(amount || 0));
}
