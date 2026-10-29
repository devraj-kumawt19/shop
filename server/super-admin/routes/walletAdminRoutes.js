import { Router } from "express";
import { Wallet, WalletEntry } from "../../db/models.js";

// Mounted behind database authentication and Super Admin authorization in app.js.
export const walletAdminRouter = Router();
const route = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);

  walletAdminRouter.get("/", route(async (req, res) => {
    const [totals, transactions] = await Promise.all([Wallet.aggregate([{ $group: { _id: null, balanceMinor: { $sum: "$balanceMinor" }, accounts: { $sum: 1 } } }]), WalletEntry.find().sort({ createdAt: -1 }).limit(100).populate("user", "name email").lean()]);
    res.json({ totals: totals[0] || { balanceMinor: 0, accounts: 0 }, transactions });
  }));
