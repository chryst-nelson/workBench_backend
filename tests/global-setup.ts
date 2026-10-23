import type { TestProject } from "vitest/node";
import { MongoMemoryServer } from "mongodb-memory-server";

declare module "vitest" {
  export interface ProvidedContext {
    mongoUri: string;
  }
}

let server: MongoMemoryServer | undefined;

/**
 * One MongoDB for the whole run. Uses TEST_MONGODB_URI if provided (e.g. a local mongod),
 * otherwise an in-memory server. Each test file gets its own throwaway database.
 */
export default async function setup(project: TestProject) {
  let uri = process.env.TEST_MONGODB_URI;
  if (!uri) {
    server = await MongoMemoryServer.create();
    uri = server.getUri();
  }
  if (/mongodb\.net|mongodb\+srv:/.test(uri)) {
    throw new Error("Refusing to run tests against a remote/Atlas database");
  }
  project.provide("mongoUri", uri);

  return async () => {
    await server?.stop();
  };
}
