import type { Request, Response } from "express";
import { sendSuccess } from "../../utils/response.js";
import { paginationMeta } from "../../utils/pagination.js";
import { getValidated } from "../../middleware/validate.js";
import * as authService from "../auth/auth.service.js";
import { metaOf, sendSession } from "../auth/auth.controller.js";
import * as userService from "./user.service.js";
import { toPublicUser } from "./user.serializer.js";
import type { ListUsersQuery, UpdateProfileInput } from "./user.schemas.js";
import type { AccountStatus, Role } from "./user.model.js";

export const getMe = (req: Request, res: Response) =>
  sendSuccess(res, { user: toPublicUser(req.user!) });

export async function updateMe(req: Request, res: Response) {
  const { body } = getValidated<{ body: UpdateProfileInput }>(res);
  const user = await userService.updateProfile(req.user!.id, body);
  sendSuccess(res, { user: toPublicUser(user) });
}

export async function changePassword(req: Request, res: Response) {
  const { body } = getValidated<{ body: { currentPassword: string; newPassword: string } }>(res);
  const result = await authService.changePassword(
    req.user!.id,
    body.currentPassword,
    body.newPassword,
    metaOf(req)
  );
  sendSession(res, result);
}

export async function list(_req: Request, res: Response) {
  const { query } = getValidated<{ query: ListUsersQuery }>(res);
  const { items, total } = await userService.listUsers(query);
  sendSuccess(res, items.map(toPublicUser), { meta: paginationMeta(query.page, query.limit, total) });
}

export async function updateStatus(req: Request, res: Response) {
  const { params, body } = getValidated<{ params: { userId: string }; body: { status: AccountStatus } }>(res);
  const user = await userService.setStatus({ adminId: req.user!.id, ip: req.ip }, params.userId, body.status);
  sendSuccess(res, { user: toPublicUser(user) });
}

export async function updateRole(req: Request, res: Response) {
  const { params, body } = getValidated<{ params: { userId: string }; body: { role: Role } }>(res);
  const user = await userService.setRole({ adminId: req.user!.id, ip: req.ip }, params.userId, body.role);
  sendSuccess(res, { user: toPublicUser(user) });
}
