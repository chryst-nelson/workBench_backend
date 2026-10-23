import { describe, it, expect } from "vitest";
import { parseEnv } from "../src/config/env.js";

describe("parseEnv", () => {
  it("applies defaults in test mode without MONGODB_URI", () => {
    const e = parseEnv({ NODE_ENV: "test" });
    expect(e.PORT).toBe(3000);
    expect(e.CORS_ORIGINS).toEqual(["http://localhost:5173"]);
  });

  it("requires MONGODB_URI outside test mode", () => {
    expect(() => parseEnv({ NODE_ENV: "production", JWT_ACCESS_SECRET: "s".repeat(32) })).toThrow(/MONGODB_URI/);
  });

  it("requires a strong JWT_ACCESS_SECRET outside test mode", () => {
    const base = { NODE_ENV: "production", MONGODB_URI: "mongodb://x/y" } as const;
    expect(() => parseEnv({ ...base })).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => parseEnv({ ...base, JWT_ACCESS_SECRET: "short" })).toThrow(/JWT_ACCESS_SECRET/);
    expect(parseEnv({ ...base, JWT_ACCESS_SECRET: "s".repeat(32) }).ACCESS_TOKEN_TTL_MINUTES).toBe(15);
  });

  it("rejects invalid PORT", () => {
    expect(() => parseEnv({ NODE_ENV: "test", PORT: "abc" })).toThrow(/PORT/);
  });

  it("splits CORS_ORIGINS", () => {
    const e = parseEnv({ NODE_ENV: "test", CORS_ORIGINS: "http://a.com, http://b.com" });
    expect(e.CORS_ORIGINS).toEqual(["http://a.com", "http://b.com"]);
  });
});
