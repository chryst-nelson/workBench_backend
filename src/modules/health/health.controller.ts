import type { Request, Response } from "express";
import { isDatabaseReady } from "../../config/database.js";
import { sendSuccess } from "../../utils/response.js";

export function liveness(_req: Request, res: Response) {
  sendSuccess(res, {
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
}

export function readiness(_req: Request, res: Response) {
  const dbReady = isDatabaseReady();
  const data = { status: dbReady ? "ready" : "unavailable", database: dbReady ? "connected" : "disconnected" };
  if (dbReady) return sendSuccess(res, data);
  res.status(503).json({
    success: false,
    error: { code: "SERVICE_UNAVAILABLE", message: "Database is not connected", details: data },
  });
}
