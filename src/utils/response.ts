import type { Response } from "express";

export function sendSuccess<T>(
  res: Response,
  data: T,
  options: { status?: number; meta?: Record<string, unknown> } = {}
) {
  const body: { success: true; data: T; meta?: Record<string, unknown> } = {
    success: true,
    data,
  };
  if (options.meta) body.meta = options.meta;
  return res.status(options.status ?? 200).json(body);
}
