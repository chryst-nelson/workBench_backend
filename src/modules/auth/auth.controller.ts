import type { Request, Response } from "express";
import { sendSuccess } from "../../utils/response.js";
import { getValidated } from "../../middleware/validate.js";
import { UnauthorizedError } from "../../lib/errors.js";
import { toPublicUser } from "../users/user.serializer.js";
import * as authService from "./auth.service.js";
import { REFRESH_COOKIE, clearRefreshCookie, setRefreshCookie } from "./cookies.js";
import type { RegisterInput } from "./auth.schemas.js";
import type { RequestMeta } from "./token.service.js";

export const metaOf = (req: Request): RequestMeta => ({
  ip: req.ip,
  userAgent: req.get("user-agent"),
});

export function sendSession(res: Response, result: authService.AuthResult, status = 200) {
  setRefreshCookie(res, result.refreshToken);
  return sendSuccess(
    res,
    { user: toPublicUser(result.user), accessToken: result.accessToken, expiresIn: result.expiresIn },
    { status }
  );
}

export async function register(req: Request, res: Response) {
  const { body } = getValidated<{ body: RegisterInput }>(res);
  sendSession(res, await authService.register(body, metaOf(req)), 201);
}

export async function login(req: Request, res: Response) {
  const { body } = getValidated<{ body: { email: string; password: string } }>(res);
  sendSession(res, await authService.login(body.email, body.password, metaOf(req)));
}

export async function refresh(req: Request, res: Response) {
  const raw = req.cookies?.[REFRESH_COOKIE];
  if (typeof raw !== "string" || !raw) throw new UnauthorizedError("Refresh token missing");
  try {
    const result = await authService.refresh(raw, metaOf(req));
    setRefreshCookie(res, result.refreshToken);
    sendSuccess(res, { accessToken: result.accessToken, expiresIn: result.expiresIn });
  } catch (err) {
    clearRefreshCookie(res);
    throw err;
  }
}

export async function logout(req: Request, res: Response) {
  await authService.logout(req.cookies?.[REFRESH_COOKIE]);
  clearRefreshCookie(res);
  res.status(204).send();
}

export function me(req: Request, res: Response) {
  sendSuccess(res, { user: toPublicUser(req.user!) });
}

export async function forgotPassword(_req: Request, res: Response) {
  const { body } = getValidated<{ body: { email: string } }>(res);
  await authService.forgotPassword(body.email);
  sendSuccess(
    res,
    { message: "If an account with that email exists, a reset link has been sent." },
    { status: 202 }
  );
}

export async function resetPassword(_req: Request, res: Response) {
  const { body } = getValidated<{ body: { token: string; newPassword: string } }>(res);
  await authService.resetPassword(body.token, body.newPassword);
  sendSuccess(res, { message: "Password updated. Please log in." });
}
