import type { Response } from "express";
import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";

const skipInTests = () => env.NODE_ENV === "test";

const handler = (_req: unknown, res: Response) =>
  res.status(429).json({
    success: false,
    error: { code: "RATE_LIMITED", message: "Too many requests, please try again later" },
  });

export const globalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  handler,
});

/** Stricter limiter factory for auth endpoints etc. (used from Stage 2). */
export function createLimiter(options: {
  windowMs: number;
  limit: number;
  skip?: () => boolean;
}) {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipInTests,
    handler,
    ...options,
  });
}

/** Shared bucket for credential endpoints (login, register, password reset). */
export const authLimiter = createLimiter({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  limit: env.AUTH_RATE_LIMIT_MAX,
});
