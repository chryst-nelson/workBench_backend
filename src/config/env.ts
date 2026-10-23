import { config as loadDotenv } from "dotenv";
import { z } from "zod";

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(0).max(65535).default(3000),
    MONGODB_URI: z.string().min(1).optional(),
    CORS_ORIGINS: z
      .string()
      .default("http://localhost:5173")
      .transform((v) =>
        v
          .split(",")
          .map((o) => o.trim())
          .filter(Boolean)
      ),
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

    // Auth
    JWT_ACCESS_SECRET: z.string().min(32, "must be at least 32 characters"),
    ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(30),
    FRONTEND_URL: z.string().url().default("http://localhost:5173"),
    COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
    AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  })
  .refine((e) => e.NODE_ENV === "test" || !!e.MONGODB_URI, {
    message: "MONGODB_URI is required",
    path: ["MONGODB_URI"],
  });

export type Env = z.infer<typeof schema>;

const TEST_DEFAULTS: NodeJS.ProcessEnv = {
  JWT_ACCESS_SECRET: "test-only-secret-test-only-secret-1234",
  BCRYPT_ROUNDS: "4",
};

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const input = source.NODE_ENV === "test" ? { ...TEST_DEFAULTS, ...source } : source;
  const result = schema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return result.data;
}

// Tests must never read a developer's real .env (could point at Atlas).
if (process.env.NODE_ENV !== "test") loadDotenv({ quiet: true });

export const env = parseEnv(process.env);
