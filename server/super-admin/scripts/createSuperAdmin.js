import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { User } from "../../db/models.js";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)), quiet: true });

const { MONGO_URI, SUPER_ADMIN_EMAIL, SUPER_ADMIN_NAME = "Website Owner", SUPER_ADMIN_PASSWORD } = process.env;
if (!MONGO_URI || !SUPER_ADMIN_EMAIL || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(SUPER_ADMIN_EMAIL) || !SUPER_ADMIN_PASSWORD || SUPER_ADMIN_PASSWORD.length < 12 || Buffer.byteLength(SUPER_ADMIN_PASSWORD, "utf8") > 72) {
  console.error("Set MONGO_URI, SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD (at least 12 characters, at most 72 UTF-8 bytes) in server/.env. No default credentials are provided.");
  process.exit(1);
}
try {
  await mongoose.connect(MONGO_URI);
  const email = SUPER_ADMIN_EMAIL.trim().toLowerCase();
  const existing = await User.findOne({ email });
  if (existing) {
    existing.role = "superadmin";
    existing.isActive = true;
    existing.authVersion = (existing.authVersion || 0) + 1;
    // Do not silently replace an existing account's password.
    await existing.save();
    console.log("Existing account promoted to super admin. Use its existing password to sign in.");
  } else {
    await User.create({ name: SUPER_ADMIN_NAME, email, password: SUPER_ADMIN_PASSWORD, role: "superadmin" });
    console.log("Super admin created. Sign in at /super-admin/login.");
  }
} catch (error) {
  console.error("Could not provision super admin:", error.message);
  process.exitCode = 1;
} finally { await mongoose.disconnect(); }
