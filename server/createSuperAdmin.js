import "dotenv/config";
import mongoose from "mongoose";
import { User } from "./models.js";

const { MONGO_URI, SUPER_ADMIN_EMAIL, SUPER_ADMIN_NAME = "Website Owner", SUPER_ADMIN_PASSWORD } = process.env;
if (!MONGO_URI || !SUPER_ADMIN_EMAIL || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(SUPER_ADMIN_EMAIL) || !SUPER_ADMIN_PASSWORD || SUPER_ADMIN_PASSWORD.length < 12 || SUPER_ADMIN_PASSWORD.length > 128) {
  console.error("Set MONGO_URI, SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD (12–128 characters) in server/.env. No default credentials are provided.");
  process.exit(1);
}
try {
  await mongoose.connect(MONGO_URI);
  const email = SUPER_ADMIN_EMAIL.trim().toLowerCase();
  const existing = await User.findOne({ email });
  if (existing) {
    existing.role = "superadmin";
    existing.isActive = true;
    // Do not silently replace an existing account's password.
    await existing.save();
    console.log("Existing account promoted to super admin. Use its existing password to sign in.");
  } else {
    await User.create({ name: SUPER_ADMIN_NAME, email, password: SUPER_ADMIN_PASSWORD, role: "superadmin" });
    console.log("Super admin created. Sign in at /login, then open /super-admin.");
  }
} catch (error) {
  console.error("Could not provision super admin:", error.message);
  process.exitCode = 1;
} finally { await mongoose.disconnect(); }
