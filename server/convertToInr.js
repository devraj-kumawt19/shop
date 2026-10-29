import "dotenv/config";
import mongoose from "mongoose";
import { convertCatalogToInr } from "./convertCurrency.js";
import { INR_RATE, INR_RATE_DATE, INR_RATE_SOURCE } from "./currency.js";
import { StoreSettings } from "./db/models.js";
if (!process.env.MONGO_URI) throw new Error("Set MONGO_URI in server/.env before converting the catalog.");
let resumeCheckout = false;
try {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  console.log(`USD → INR reference: ${INR_RATE} (${INR_RATE_DATE}); source: ${INR_RATE_SOURCE}`);
  const stored = await StoreSettings.findById("store").lean();
  if (stored?.currency !== "INR" && stored?.checkoutEnabled !== false) {
    // Let requests started under the old currency finish before repricing a live catalog.
    await StoreSettings.updateOne({ _id: "store" }, { $set: { checkoutEnabled: false }, $setOnInsert: { currency: "USD", shippingFee: 6.95, freeShippingThreshold: 75, announcement: "Free shipping on orders over $75" } }, { upsert: true, setDefaultsOnInsert: false });
    resumeCheckout = true;
    console.log("Checkout paused for 60 seconds to let existing requests finish. Browsing remains available.");
    await new Promise((resolve) => setTimeout(resolve, 60000));
  }
  console.log(await convertCatalogToInr());
} catch (error) { console.error("Catalog conversion failed:", error.name); process.exitCode = 1; }
finally {
  if (resumeCheckout) { try { await StoreSettings.updateOne({ _id: "store" }, { $set: { checkoutEnabled: true } }); console.log("Checkout resumed."); } catch { console.error("Checkout could not be resumed. Re-enable checkout in the owner settings."); process.exitCode = 1; } }
  await mongoose.disconnect();
}
