import mongoose from "mongoose";

let connecting;
const unavailable = (message) => Object.assign(new Error(message), { status: 503 });

export async function connectDatabase() {
  if (mongoose.connection.readyState === 1) return mongoose;
  if (connecting) return connecting;
  const uri = process.env.MONGO_URI?.trim();
  if (!uri) throw unavailable("MONGO_URI is not configured on the API server.");
  // Share the in-flight connection as well as the warm instance's connection pool.
  // A rejected attempt is cleared so a later request can recover.
  connecting = mongoose.connect(uri, {
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000,
    maxPoolSize: 5,
    minPoolSize: 0,
    maxIdleTimeMS: 60000,
    bufferCommands: false,
  }).catch((error) => {
    console.error("MongoDB connection unavailable:", error.name);
    throw unavailable("The database is unavailable. Check MONGO_URI and MongoDB Atlas network access.");
  }).finally(() => { connecting = undefined; });
  return connecting;
}

export async function requireDatabase(req, res, next) {
  try { await connectDatabase(); return next(); }
  catch (error) { return res.status(503).json({ message: error.message }); }
}
