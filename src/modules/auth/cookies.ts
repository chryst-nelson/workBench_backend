import type { CookieOptions, Response } from "express";
import { env } from "../../config/env.js";

export const REFRESH_COOKIE = "refreshToken";

const base = (): CookieOptions => ({
  httpOnly: true,
  secure: env.NODE_ENV === "production" || env.COOKIE_SAMESITE === "none",
  sameSite: env.COOKIE_SAMESITE,
  path: "/api/v1/auth", // only sent to auth endpoints
});

export const setRefreshCookie = (res: Response, token: string) =>
  res.cookie(REFRESH_COOKIE, token, { ...base(), maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400_000 });

export const clearRefreshCookie = (res: Response) => res.clearCookie(REFRESH_COOKIE, base());
