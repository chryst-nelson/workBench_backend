import mongoose from "mongoose";
import { env } from "./env.js";
import { logger } from "../lib/logger.js";

export async function connectDatabase(uri = env.MONGODB_URI): Promise<void> {
  if (!uri) throw new Error("MONGODB_URI is not set");
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  logger.info("MongoDB connected");
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

export function isDatabaseReady(): boolean {
  return mongoose.connection.readyState === 1;
}
