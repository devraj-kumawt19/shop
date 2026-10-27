import { toRupees } from "./currency.js";
export const categories = [
  { name: "Home & Living", slug: "home-living", image: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=900&q=85", tone: "sand" },
  { name: "Tech & Audio", slug: "tech-audio", image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=85", tone: "blue" },
  { name: "Style & Carry", slug: "style-carry", image: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=900&q=85", tone: "rose" },
  { name: "Wellness", slug: "wellness", image: "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=900&q=85", tone: "green" },
];

const extraFinds = {
  "home-living": [["Linen Cushion Duo",38,"photo-1584100936595-c0654b55a2e2"],["Nordic Ceramic Vase",29,"photo-1578500494198-246f612d3b3d"],["Morning Coffee Mug Set",32,"photo-1514228742587-6b1558fcca3d"],["Bamboo Desk Organizer",24,"photo-1494438639946-1ebd1d20bf85"],["Warm Glow Bedside Light",65,"photo-1507473885765-e6ed057f782c"],["Woven Storage Basket",36,"photo-1600210492486-724fe5c67fb0"],["Minimal Wall Clock",44,"photo-1563861826100-9cb868fdbe1c"],["Stoneware Dinner Set",79,"photo-1495474472287-4d71bcdd2085"],["Cozy Cotton Throw",48,"photo-1584100936595-c0654b55a2e2"],["Oak Side Table",119,"photo-1494438639946-1ebd1d20bf85"]],
  "tech-audio": [["Pocket Wireless Earbuds",59,"photo-1606220945770-b5b6c2c55bf1"],["Compact Mechanical Keyboard",89,"photo-1587829741301-dc798b83add3"],["Wireless Desk Mouse",35,"photo-1527814050087-3793815479db"],["Everyday Smart Watch",149,"photo-1523275335684-37898b6baf30"],["Retro Portable Camera",179,"photo-1516035069371-29a1b244cc32"],["Studio Over-Ear Headphones",99,"photo-1546435770-a3e426bf472b"],["Travel Bluetooth Speaker",45,"photo-1608043152269-423dbba4e7e1"],["USB-C Desk Hub",39,"photo-1517336714731-489689fd1ca8"],["Soft Touch Laptop Sleeve",28,"photo-1517336714731-489689fd1ca8"],["Noise-Cancelling Headphones",159,"photo-1505740420928-5e560c06d30e"]],
  "style-carry": [["Everyday Canvas Tote",25,"photo-1544816155-12df9643f363"],["City Explorer Backpack",72,"photo-1622560480654-d96214fdc887"],["Classic Leather Handbag",115,"photo-1548036328-c9fa89d128fa"],["Weekend Travel Duffel",85,"photo-1553062407-98eeb64c6a62"],["Everyday Crossbody Bag",49,"photo-1584917865442-de89df76afd3"],["Essential Everyday Watch",79,"photo-1523275335684-37898b6baf30"],["Lightweight Travel Pack",68,"photo-1553062407-98eeb64c6a62"],["Minimal Zip Pouch",18,"photo-1544816155-12df9643f363"],["Classic City Carryall",96,"photo-1548036328-c9fa89d128fa"],["Daily Commute Backpack",82,"photo-1622560480654-d96214fdc887"]],
  wellness: [["Botanical Face Serum",39,"photo-1608571423902-eed4a5ad8108"],["Daily Hydration Bottle",22,"photo-1602143407151-7111542de6e8"],["Sunday Self-Care Set",64,"photo-1608248543803-ba4f8c70ae0b"],["Calming Body Oil",32,"photo-1608571423902-eed4a5ad8108"],["Fresh Start Hand Wash",16,"photo-1608248543803-ba4f8c70ae0b"],["Rose Botanical Mist",24,"photo-1608571423902-eed4a5ad8108"],["Daily Ritual Travel Set",45,"photo-1608248543803-ba4f8c70ae0b"],["Insulated Water Bottle",29,"photo-1602143407151-7111542de6e8"],["Evening Reset Collection",58,"photo-1608248543803-ba4f8c70ae0b"],["Nourishing Hand Cream",19,"photo-1608571423902-eed4a5ad8108"]],
};

export const demoProducts = [
  { _id: "sphere-001", name: "Studio Wireless Headphones", category: "Tech & Audio", categorySlug: "tech-audio", price: 129, compareAtPrice: 159, rating: 4.8, reviewCount: 248, badge: "BESTSELLER", description: "Immersive sound meets all-day comfort. Enjoy rich, balanced audio and up to 40 hours of listening in a considered, lightweight design.", image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1000&q=85", stock: 18, featured: true },
  { _id: "sphere-002", name: "Everyday Ceramic Pour-Over", category: "Home & Living", categorySlug: "home-living", price: 42, compareAtPrice: 0, rating: 4.9, reviewCount: 126, badge: "MADE TO LAST", description: "Make a slower morning. This thoughtfully glazed stoneware dripper brings out the best in your favorite coffee, cup after cup.", image: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1000&q=85", stock: 24, featured: true },
  { _id: "sphere-003", name: "The Weekender Carryall", category: "Style & Carry", categorySlug: "style-carry", price: 88, compareAtPrice: 110, rating: 4.7, reviewCount: 93, badge: "JUST LANDED", description: "A thoughtful companion for anywhere the weekend takes you. Room for the essentials, with a pocket for everything else.", image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=1000&q=85", stock: 12, featured: true },
  { _id: "sphere-004", name: "Soft Form Table Lamp", category: "Home & Living", categorySlug: "home-living", price: 76, compareAtPrice: 0, rating: 4.6, reviewCount: 81, badge: "", description: "A warm pool of light, wherever you need one. A tactile ceramic base and a soft linen shade make this an easy addition to any corner.", image: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=1000&q=85", stock: 15, featured: true },
  { _id: "sphere-005", name: "Daily Ritual Glass Bottle", category: "Wellness", categorySlug: "wellness", price: 34, compareAtPrice: 0, rating: 4.8, reviewCount: 174, badge: "CUSTOMER FAVORITE", description: "A gentle nudge to take a moment for yourself. Double-wall glass keeps your drink just right, with a protective silicone sleeve.", image: "https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=1000&q=85", stock: 29, featured: true },
  { _id: "sphere-006", name: "Minimal Everyday Backpack", category: "Style & Carry", categorySlug: "style-carry", price: 94, compareAtPrice: 0, rating: 4.7, reviewCount: 109, badge: "", description: "Your daily carry, figured out. A clean silhouette, durable recycled fabric, and considered organization for busy days and easy weekends.", image: "https://images.unsplash.com/photo-1622560480654-d96214fdc887?auto=format&fit=crop&w=1000&q=85", stock: 8, featured: true },
  { _id: "sphere-007", name: "Portable Bluetooth Speaker", category: "Tech & Audio", categorySlug: "tech-audio", price: 68, compareAtPrice: 82, rating: 4.6, reviewCount: 68, badge: "SALE", description: "Take your soundtrack outside. Surprisingly full sound, simple controls, and a water-resistant finish for wherever the day unfolds.", image: "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=1000&q=85", stock: 14, featured: true },
  { _id: "sphere-008", name: "Botanical Hand & Body Set", category: "Wellness", categorySlug: "wellness", price: 54, compareAtPrice: 0, rating: 4.9, reviewCount: 142, badge: "GIFT READY", description: "An everyday reset in two steps. A gentle wash and nourishing lotion with fresh botanical notes, thoughtfully packaged and ready to gift.", image: "https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=1000&q=85", stock: 32, featured: true },
];

for (const [slug, finds] of Object.entries(extraFinds)) {
  const collection = categories.find((item) => item.slug === slug);
  finds.forEach(([name, price, photo], index) => {
    const onSale = index % 3 !== 2;
    demoProducts.push({
      _id: `sphere-${String(demoProducts.length + 1).padStart(3, "0")}`, name, category: collection.name, categorySlug: slug,
      price, compareAtPrice: onSale ? Math.round(price / (index % 2 ? .75 : .8)) : 0,
      description: `${name} brings a thoughtful detail to your everyday. Part of our ${collection.name} collection, with a considered finish and an easy-to-love design. This is sample catalog data for exploring the store.`,
      image: `https://images.unsplash.com/${photo}?auto=format&fit=crop&w=900&q=80`, stock: 12 + index * 3,
      rating: 4.5 + (index % 5) / 10, reviewCount: 20 + index * 13,
      badge: onSale ? "SALE" : "NEW ARRIVAL", featured: index < 2, isDemo: true,
    });
  });
}

for (const product of demoProducts) {
  product.price = toRupees(product.price);
  product.compareAtPrice = toRupees(product.compareAtPrice);
}
