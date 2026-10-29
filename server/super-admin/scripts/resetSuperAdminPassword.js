import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { User } from "../../db/models.js";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)), quiet: true });

const { MONGO_URI, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD } = process.env;
if (!MONGO_URI || !SUPER_ADMIN_EMAIL || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(SUPER_ADMIN_EMAIL) || !SUPER_ADMIN_PASSWORD || SUPER_ADMIN_PASSWORD.length < 12 || Buffer.byteLength(SUPER_ADMIN_PASSWORD, "utf8") > 72) {
  console.error("Set MONGO_URI, SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD (at least 12 characters, at most 72 UTF-8 bytes) in server/.env. No default credentials are provided.");
  process.exit(1);
}

try {
  await mongoose.connect(MONGO_URI);
  const email = SUPER_ADMIN_EMAIL.trim().toLowerCase();
  const user = await User.findOne({ email, role: "superadmin" });
  if (!user) throw new Error("No super admin account matches SUPER_ADMIN_EMAIL. Run create-super-admin first if this account has not been provisioned.");
  user.password = SUPER_ADMIN_PASSWORD;
  user.isActive = true;
  user.authVersion = (user.authVersion || 0) + 1;
  await user.save();
  console.log("Super admin password reset. Sign in with SUPER_ADMIN_EMAIL and the password from server/.env.");
} catch (error) {
  console.error("Could not reset super admin password:", error.message);
  process.exitCode = 1;
} finally {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}
