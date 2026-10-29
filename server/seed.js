import "dotenv/config";
import mongoose from "mongoose";
import { Category, Product, StoreSettings } from "./db/models.js";
import { categories, demoProducts } from "./demoCatalog.js";

const catalog = categories;
const products = demoProducts.map(({ _id, ...product }) => ({ ...product, isDemo: true }));

if (!process.env.MONGO_URI) {
  console.error("Set MONGO_URI in server/.env before seeding the catalog.");
  process.exit(1);
}

try {
  await mongoose.connect(process.env.MONGO_URI);
  const settings = await StoreSettings.findById("store").lean();
  if (settings?.currency === "USD") throw new Error("The sample catalog is now priced in INR. Convert the existing USD catalog with npm run convert-to-inr before adding samples.");
  for (const category of catalog) {
    await Category.updateOne({ slug: category.slug }, { $setOnInsert: category }, { upsert: true });
  }
  for (const product of products) {
    await Product.updateOne({ name: product.name }, { $setOnInsert: product }, { upsert: true });
  }
  console.log(`Catalog seed complete: ${catalog.length} categories and ${products.length} products are available.`);
} catch (error) {
  console.error("Could not seed the catalog:", error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
