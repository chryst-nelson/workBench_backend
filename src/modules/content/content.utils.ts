import type { Model } from "mongoose";
import { AppError, ConflictError } from "../../lib/errors.js";
import type { Role } from "../users/user.model.js";

export interface Viewer {
  id: string;
  role: Role;
}
export interface AdminContext {
  adminId: string;
  ip?: string;
}
export const isAdmin = (v: Viewer) => v.role === "admin";
/** Non-admins only ever see published content. */
export const visibleStatus = (v: Viewer) => (isAdmin(v) ? {} : { status: "published" as const });

const MAX_ALLOCATION_ATTEMPTS = 12;

const isDuplicateKey = (err: unknown) => (err as { code?: number })?.code === 11000;

// The helpers below are shared by Module and Task, whose Mongoose generics differ.
/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyModel = Model<any>;

async function lastOrder(model: AnyModel, scope: object): Promise<number> {
  const last = await model.findOne(scope).sort({ order: -1 }).select("order").lean<{ order: number }>();
  return last?.order ?? 0;
}

/**
 * Creates an item at `explicitOrder`, or appended at the end. The unique (parent, order)
 * index guards against races; auto-assigned orders retry, explicit ones report a conflict.
 */
export async function createOrdered<T>(
  model: AnyModel,
  scope: object,
  build: (order: number) => Promise<T>,
  explicitOrder?: number
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const order = explicitOrder ?? (await lastOrder(model, scope)) + 1;
    try {
      return await build(order);
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
      if (explicitOrder !== undefined) {
        throw new AppError(
          `Position ${explicitOrder} is already taken. Omit "order" to append, or use the reorder endpoint.`,
          409,
          "ORDER_CONFLICT"
        );
      }
      if (attempt >= MAX_ALLOCATION_ATTEMPTS) {
        throw new ConflictError("Could not allocate a position, please retry");
      }
      // Jittered backoff so simultaneous creators stop colliding in lockstep.
      await new Promise((r) => setTimeout(r, Math.random() * 15 * attempt));
    }
  }
}

const REORDER_OFFSET = 1_000_000;

/**
 * Rewrites positions to match `ids` (1..n). `ids` must list every sibling exactly once.
 * Two phases keep the unique (parent, order) index satisfied at every step.
 */
export async function reorderSiblings(model: AnyModel, scope: object, ids: string[]): Promise<void> {
  const siblings = await model.find(scope).select("_id").lean<{ _id: unknown }[]>();
  const existing = new Set(siblings.map((s) => String(s._id)));
  const unique = new Set(ids);
  if (unique.size !== ids.length || ids.length !== existing.size || !ids.every((id) => existing.has(id))) {
    throw new AppError("`ids` must list every item exactly once", 400, "ORDER_MISMATCH");
  }
  await model.updateMany(scope, { $inc: { order: REORDER_OFFSET } });
  await Promise.all(ids.map((id, i) => model.updateOne({ _id: id }, { $set: { order: i + 1 } })));
}
/* eslint-enable @typescript-eslint/no-explicit-any */
