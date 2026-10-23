import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { UnauthorizedError } from "../../lib/errors.js";
import { RefreshToken } from "./refresh-token.model.js";

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("hex");

// ---- Access tokens (short-lived JWT; role/status are always read from the DB) ----

export const ACCESS_TOKEN_TTL_SECONDS = env.ACCESS_TOKEN_TTL_MINUTES * 60;

export function signAccessToken(userId: string): string {
  return jwt.sign({}, env.JWT_ACCESS_SECRET, {
    algorithm: "HS256",
    subject: userId,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string): { userId: string; issuedAt: number } {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ["HS256"] });
    if (typeof payload === "string" || !payload.sub || typeof payload.iat !== "number") {
      throw new Error("bad payload");
    }
    return { userId: payload.sub, issuedAt: payload.iat };
  } catch {
    throw new UnauthorizedError("Invalid or expired access token");
  }
}

// ---- Refresh tokens (opaque, stored hashed, rotated on every use) ----

const refreshExpiry = () => new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);

export async function issueRefreshToken(
  userId: string,
  meta: RequestMeta = {},
  family: string = crypto.randomUUID()
): Promise<string> {
  const raw = crypto.randomBytes(48).toString("base64url");
  await RefreshToken.create({
    tokenHash: sha256(raw),
    user: userId,
    family,
    expiresAt: refreshExpiry(),
    ip: meta.ip,
    userAgent: meta.userAgent?.slice(0, 255),
  });
  return raw;
}

/**
 * Atomically revokes the presented token and issues its successor in the same family.
 * Presenting an already-revoked token means it was stolen or replayed: the whole family is revoked.
 */
export async function rotateRefreshToken(
  raw: string,
  meta: RequestMeta = {}
): Promise<{ userId: string; refreshToken: string }> {
  const tokenHash = sha256(raw);
  const now = new Date();

  const current = await RefreshToken.findOne({ tokenHash });
  // A single conditional update is atomic: of N concurrent requests, exactly one matches.
  const claimed = current
    ? await RefreshToken.updateOne(
        { _id: current._id, revokedAt: { $exists: false }, expiresAt: { $gt: now } },
        { $set: { revokedAt: now } }
      )
    : null;

  if (!current || !claimed || claimed.modifiedCount !== 1) {
    if (current && current.expiresAt > now) {
      // Already used (replay / theft / lost race): kill the whole family.
      await RefreshToken.updateMany(
        { family: current.family, revokedAt: { $exists: false } },
        { $set: { revokedAt: now } }
      );
    }
    throw new UnauthorizedError("Invalid or expired refresh token");
  }

  const userId = String(current.user);
  const refreshToken = await issueRefreshToken(userId, meta, current.family);
  return { userId, refreshToken };
}

export async function revokeRefreshToken(raw: string): Promise<void> {
  await RefreshToken.updateOne(
    { tokenHash: sha256(raw), revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } }
  );
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await RefreshToken.updateMany(
    { user: userId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } }
  );
}
