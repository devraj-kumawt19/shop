import "dotenv/config";
import mongoose from "mongoose";
import { User } from "./models.js";

const { ADMIN_EMAIL, ADMIN_NAME = "ShopSphere Admin", ADMIN_PASSWORD, MONGO_URI } = process.env;
if (!MONGO_URI || !ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) {
  console.error("Set MONGO_URI, ADMIN_EMAIL, and ADMIN_PASSWORD (at least 12 characters) in server/.env before creating an admin.");
  process.exit(1);
}

try {
  await mongoose.connect(MONGO_URI);
  const email = ADMIN_EMAIL.trim().toLowerCase();
  const existing = await User.findOne({ email });
  if (existing) {
    if (existing.role === "superadmin") throw new Error("This account is already a super admin; it cannot be downgraded by this command.");
    existing.role = "admin";
    await existing.save();
  } else {
    await User.create({ name: ADMIN_NAME, email, password: ADMIN_PASSWORD, role: "admin" });
  }
  console.log(`Admin account is ready for ${email}.`);
} catch (error) {
  console.error("Could not create the admin account:", error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
