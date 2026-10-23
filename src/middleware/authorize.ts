import type { RequestHandler } from "express";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";
import type { Role } from "../modules/users/user.model.js";

/** Must run after `authenticate`. */
export const authorize =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) throw new UnauthorizedError();
    if (!roles.includes(req.user.role)) throw new ForbiddenError();
    next();
  };
