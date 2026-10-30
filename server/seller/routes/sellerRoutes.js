import { Router } from "express";
import { Product } from "../../db/models.js";
import { requireDatabase } from "../../db/connection.js";

const route = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);

export function createSellerRouter(authenticate) {
  const router = Router();
  router.get("/dashboard", requireDatabase, authenticate, route(async (req, res) => {
    if (!["seller", "admin"].includes(req.user.role)) return res.status(403).json({ message: "Seller access is required." });
    const filter = { seller: req.user.id };
    const [products, lowStock, outOfStock] = await Promise.all([
      Product.countDocuments(filter),
      Product.countDocuments({ ...filter, stock: { $gt: 0, $lte: 5 } }),
      Product.countDocuments({ ...filter, stock: 0 }),
    ]);
    return res.json({ summary: { products, lowStock, outOfStock } });
  }));
  return router;
}
