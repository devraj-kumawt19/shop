import dotenv from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { app } from "./app.js";
import { connectDatabase } from "./database.js";
import { startNotificationWorker } from "./notifications.js";

export { app };

export async function startServer() {
  dotenv.config({ path: fileURLToPath(new URL(".env", import.meta.url)), quiet: true });
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error("JWT_SECRET must be set to a random string with at least 32 characters.");
  if (process.env.MONGO_URI) await connectDatabase();
  else console.warn("MONGO_URI is missing; only diagnostic API responses will be available.");
  const port = Number(process.env.PORT) || 5000;
  const server = app.listen(port, () => console.log("ShopSphere API listening on port " + port + "."));
  if (process.env.MONGO_URI) startNotificationWorker();
  return server;
}

const isEntryPoint = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isEntryPoint && !process.env.VERCEL && process.env.NODE_ENV !== "test") startServer().catch((error) => {
  console.error("API startup failed:", error.message);
  process.exitCode = 1;
});
