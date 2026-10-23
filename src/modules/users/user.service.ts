import type { QueryFilter } from "mongoose";
import { ForbiddenError, NotFoundError } from "../../lib/errors.js";
import { escapeRegex } from "../../utils/pagination.js";
import { recordAudit } from "../audit/audit.service.js";
import { revokeAllUserSessions } from "../auth/token.service.js";
import { assertSelectableTrack } from "../tracks/track.service.js";
import { User, type AccountStatus, type Role, type UserDocument } from "./user.model.js";

type UserShape = UserDocument;
import type { ListUsersQuery, UpdateProfileInput } from "./user.schemas.js";

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const { fullName, ...profile } = input;
  await assertSelectableTrack(profile.preferredTrack);
  const $set: Record<string, unknown> = {};
  if (fullName !== undefined) $set.fullName = fullName;
  for (const [k, v] of Object.entries(profile)) $set[`profile.${k}`] = v;

  const result = await User.updateOne({ _id: userId }, { $set }, { runValidators: true });
  if (result.matchedCount === 0) throw new NotFoundError("User not found");
  const user = await User.findById(userId);
  if (!user) throw new NotFoundError("User not found");
  return user;
}

export async function listUsers(query: ListUsersQuery) {
  const { page, limit, role, status, q } = query;
  const filter: QueryFilter<UserShape> = {};
  if (role) filter.role = role;
  if (status) filter.status = status;
  if (q) {
    const re = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ fullName: re }, { email: re }];
  }
  const [items, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(filter),
  ]);
  return { items, total };
}

interface AdminContext {
  adminId: string;
  ip?: string;
}

async function loadTarget(adminId: string, targetId: string) {
  // Prevents an admin locking themselves (or the last admin) out by mistake.
  if (adminId === targetId) {
    throw new ForbiddenError("You cannot change your own role or status");
  }
  const user = await User.findById(targetId);
  if (!user) throw new NotFoundError("User not found");
  return user;
}

export async function setStatus(ctx: AdminContext, targetId: string, status: AccountStatus) {
  const user = await loadTarget(ctx.adminId, targetId);
  const from = user.status;
  user.status = status;
  await user.save();
  if (status !== "active") await revokeAllUserSessions(user.id);
  await recordAudit({
    actor: ctx.adminId,
    action: "user.status_changed",
    targetType: "User",
    targetId: user.id,
    metadata: { from, to: status },
    ip: ctx.ip,
  });
  return user;
}

export async function setRole(ctx: AdminContext, targetId: string, role: Role) {
  const user = await loadTarget(ctx.adminId, targetId);
  const from = user.role;
  user.role = role;
  await user.save();
  await recordAudit({
    actor: ctx.adminId,
    action: "user.role_changed",
    targetType: "User",
    targetId: user.id,
    metadata: { from, to: role },
    ip: ctx.ip,
  });
  return user;
}
