import crypto from "node:crypto";
import mongoose from "mongoose";
import { inject } from "vitest";

export async function connectTestDb() {
  const dbName = `p_learning_test_${crypto.randomBytes(6).toString("hex")}`;
  await mongoose.connect(inject("mongoUri"), { dbName });
  await mongoose.connection.syncIndexes?.().catch(() => undefined);
  await Promise.all(Object.values(mongoose.models).map((m) => m.init().catch(() => undefined)));
}

export async function clearTestDb() {
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

export async function closeTestDb() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}
