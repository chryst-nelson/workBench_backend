import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import mongoose from "mongoose";
import { AppError, NotFoundError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { env } from "../config/env.js";

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Route not found: ${req.method} ${req.path}`));
};

interface Normalized {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalize(err: any): Normalized {
  if (err instanceof AppError) {
    return { status: err.statusCode, code: err.code, message: err.message, details: err.details };
  }
  if (err instanceof ZodError) {
    return {
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Validation failed",
      details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    };
  }
  if (err instanceof mongoose.Error.ValidationError) {
    return {
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Validation failed",
      details: Object.values(err.errors).map((e) => ({ path: e.path, message: e.message })),
    };
  }
  if (err instanceof mongoose.Error.CastError) {
    return { status: 400, code: "INVALID_ID", message: `Invalid value for '${err.path}'` };
  }
  if (err?.code === 11000) {
    return {
      status: 409,
      code: "DUPLICATE_KEY",
      message: "A record with the same unique value already exists",
      details: { fields: Object.keys(err.keyPattern ?? {}) },
    };
  }
  if (err?.type === "entity.parse.failed") {
    return { status: 400, code: "INVALID_JSON", message: "Malformed JSON body" };
  }
  if (err?.type === "entity.too.large") {
    return { status: 413, code: "PAYLOAD_TOO_LARGE", message: "Request body too large" };
  }
  return { status: 500, code: "INTERNAL_ERROR", message: "Internal server error" };
}

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  const n = normalize(err);
  if (n.status >= 500) {
    logger.error({ err, method: req.method, url: req.originalUrl }, "Unhandled error");
  }

  const error: Record<string, unknown> = { code: n.code, message: n.message };
  if (n.details !== undefined) error.details = n.details;
  // Never leak internals in production; helpful stack in dev only.
  if (n.status >= 500 && env.NODE_ENV === "development" && err?.stack) error.stack = err.stack;

  res.status(n.status).json({ success: false, error });
};
