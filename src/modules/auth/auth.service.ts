import crypto from "node:crypto";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import { AppError, ConflictError, UnauthorizedError, ValidationError } from "../../lib/errors.js";
import { dummyVerify, hashPassword, verifyPassword } from "../../utils/password.js";
import { getEmailProvider } from "../../services/email/email.provider.js";
import { User, type UserDocument } from "../users/user.model.js";
import { assertSelectableTrack } from "../tracks/track.service.js";
import type { RegisterInput } from "./auth.schemas.js";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  issueRefreshToken,
  revokeAllUserSessions,
  revokeRefreshToken,
  rotateRefreshToken,
  sha256,
  signAccessToken,
  type RequestMeta,
} from "./token.service.js";

export interface AuthResult {
  user: UserDocument;
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
}

async function startSession(user: UserDocument, meta: RequestMeta): Promise<AuthResult> {
  return {
    user,
    accessToken: signAccessToken(user.id),
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    refreshToken: await issueRefreshToken(user.id, meta),
  };
}

function assertActive(user: UserDocument) {
  if (user.status === "suspended") throw new AppError("Account suspended", 403, "ACCOUNT_SUSPENDED");
  if (user.status === "disabled") throw new AppError("Account disabled", 403, "ACCOUNT_DISABLED");
}

export async function register(input: RegisterInput, meta: RequestMeta): Promise<AuthResult> {
  const { fullName, email, password, ...profile } = input;
  await assertSelectableTrack(profile.preferredTrack);
  try {
    const user = await User.create({
      fullName,
      email,
      passwordHash: await hashPassword(password),
      role: "learner", // self-registration can only ever create learners
      profile,
    });
    return await startSession(user, meta);
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw new ConflictError("An account with this email already exists");
    }
    throw err;
  }
}

export async function login(email: string, password: string, meta: RequestMeta): Promise<AuthResult> {
  const user = await User.findOne({ email }).select("+passwordHash");
  if (!user) {
    await dummyVerify(password);
    throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
  }
  assertActive(user); // only revealed after the password is proven correct

  user.lastLoginAt = new Date();
  await user.save();
  return startSession(user, meta);
}

export async function refresh(raw: string, meta: RequestMeta) {
  const { userId, refreshToken } = await rotateRefreshToken(raw, meta);
  const user = await User.findById(userId);
  if (!user || user.status !== "active") {
    await revokeAllUserSessions(userId);
    throw new UnauthorizedError("Invalid or expired refresh token");
  }
  return { accessToken: signAccessToken(userId), expiresIn: ACCESS_TOKEN_TTL_SECONDS, refreshToken };
}

export async function logout(raw: string | undefined) {
  if (raw) await revokeRefreshToken(raw);
}

export async function forgotPassword(email: string): Promise<void> {
  const user = await User.findOne({ email, status: "active" });
  if (!user) return; // same response either way: no account enumeration

  const token = crypto.randomBytes(32).toString("hex");
  user.passwordResetTokenHash = sha256(token);
  user.passwordResetExpiresAt = new Date(Date.now() + env.PASSWORD_RESET_TTL_MINUTES * 60_000);
  await user.save();

  try {
    await getEmailProvider().send({
      to: user.email,
      subject: "Reset your password",
      text:
        `Hi ${user.fullName},\n\nUse this link to reset your password ` +
        `(valid for ${env.PASSWORD_RESET_TTL_MINUTES} minutes):\n` +
        `${env.FRONTEND_URL}/reset-password?token=${token}\n\n` +
        `If you did not request this, ignore this email.`,
    });
  } catch (err) {
    logger.error({ err }, "Failed to send password reset email");
  }
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const filter = { passwordResetTokenHash: sha256(token), passwordResetExpiresAt: { $gt: new Date() } };
  const user = await User.findOne(filter).select("_id");
  if (!user) throw new ValidationError("Reset token is invalid or has expired");

  const passwordHash = await hashPassword(newPassword);
  // Conditional update is atomic and single-use: a concurrent second request matches nothing.
  const result = await User.updateOne(filter, {
    $set: { passwordHash, passwordChangedAt: new Date() },
    $unset: { passwordResetTokenHash: "", passwordResetExpiresAt: "" },
  });
  if (result.modifiedCount !== 1) throw new ValidationError("Reset token is invalid or has expired");
  await revokeAllUserSessions(user.id);
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  meta: RequestMeta
): Promise<AuthResult> {
  const user = await User.findById(userId).select("+passwordHash");
  if (!user) throw new UnauthorizedError();
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new AppError("Current password is incorrect", 400, "INVALID_CURRENT_PASSWORD");
  }
  user.passwordHash = await hashPassword(newPassword);
  user.passwordChangedAt = new Date();
  await user.save();
  await revokeAllUserSessions(user.id);
  return startSession(user, meta); // keep this device logged in
}
