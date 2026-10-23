import type { RequestHandler } from "express";
import { AppError, UnauthorizedError } from "../lib/errors.js";
import { verifyAccessToken } from "../modules/auth/token.service.js";
import { User } from "../modules/users/user.model.js";

/**
 * Verifies the Bearer token, then loads the user from the DB. Role and status always
 * come from the database, never from the token or the client.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw new UnauthorizedError();

  const { userId, issuedAt } = verifyAccessToken(header.slice(7).trim());
  const user = await User.findById(userId);
  if (!user) throw new UnauthorizedError("Invalid or expired access token");

  if (user.passwordChangedAt && issuedAt < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
    throw new UnauthorizedError("Session expired, please log in again");
  }
  if (user.status !== "active") {
    throw new AppError(
      user.status === "suspended" ? "Account suspended" : "Account disabled",
      403,
      user.status === "suspended" ? "ACCOUNT_SUSPENDED" : "ACCOUNT_DISABLED"
    );
  }

  req.user = user;
  next();
};
