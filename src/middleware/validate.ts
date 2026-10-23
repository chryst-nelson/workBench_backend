import type { Request, Response, NextFunction } from "express";
import type { ZodType } from "zod";

interface Schemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

/**
 * Validates req parts with Zod. Parsed (coerced/stripped) values are placed in
 * res.locals.validated because req.query is read-only in Express 5.
 */
export function validate(schemas: Schemas) {
  return (req: Request, res: Response, next: NextFunction) => {
    const validated: Record<string, unknown> = {};
    for (const key of ["params", "query", "body"] as const) {
      const schema = schemas[key];
      if (!schema) continue;
      const result = schema.safeParse(req[key]);
      if (!result.success) return next(result.error);
      validated[key] = result.data;
    }
    res.locals.validated = validated;
    next();
  };
}

/** Typed access to what `validate` parsed. */
export function getValidated<T extends { body?: unknown; query?: unknown; params?: unknown }>(
  res: Response
): T {
  return res.locals.validated as T;
}
