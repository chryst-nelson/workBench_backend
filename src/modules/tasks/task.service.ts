import { AppError, NotFoundError } from "../../lib/errors.js";
import { recordAudit } from "../audit/audit.service.js";
import { ensureNoLearnerActivity } from "../content/content-guard.js";
import { loadVisibleModule, loadVisibleTask } from "../content/content.access.js";
import {
  createOrdered,
  reorderSiblings,
  visibleStatus,
  type AdminContext,
  type Viewer,
} from "../content/content.utils.js";
import { assertTaskUnlocked } from "../enrollments/progression.service.js";
import { Module } from "../modules/module.model.js";
import { Task, type TaskDocument } from "./task.model.js";
import type { CreateTaskInput, UpdateTaskInput } from "./task.schemas.js";

/** Admins/mentors: per visibility. Learners: only tasks they are enrolled for and have unlocked. */
export async function getTask(viewer: Viewer, taskId: string) {
  const { task } = await loadVisibleTask(viewer, taskId);
  if (viewer.role === "learner") await assertTaskUnlocked(viewer.id, task);
  return task;
}

async function audit(ctx: AdminContext, action: string, task: TaskDocument, metadata: object = {}) {
  await recordAudit({
    actor: ctx.adminId,
    action,
    targetType: "Task",
    targetId: task.id,
    metadata: { module: String(task.module), title: task.title, ...metadata },
    ip: ctx.ip,
  });
}

export async function listTasks(viewer: Viewer, moduleId: string) {
  const { module } = await loadVisibleModule(viewer, moduleId);
  return Task.find({ module: module._id, ...visibleStatus(viewer) })
    .select("module title order estimatedDifficulty status")
    .sort({ order: 1 });
}

export async function createTask(ctx: AdminContext, moduleId: string, input: CreateTaskInput) {
  const mod = await Module.findById(moduleId);
  if (!mod) throw new NotFoundError("Module not found");

  const { order, ...data } = input;
  const task = await createOrdered(
    Task,
    { module: mod._id },
    (position) => Task.create({ ...data, track: mod.track, module: mod._id, order: position, status: "draft" }),
    order
  );
  await audit(ctx, "task.created", task);
  return task;
}

/** A published module must always keep at least one published task. */
async function assertModuleKeepsAPublishedTask(task: TaskDocument) {
  if (task.status !== "published") return;
  const mod = await Module.findById(task.module);
  if (mod?.status !== "published") return;
  const others = await Task.countDocuments({ module: task.module, status: "published", _id: { $ne: task._id } });
  if (others === 0) {
    throw new AppError(
      "This is the only published task of a published module. Unpublish the module first.",
      409,
      "PARENT_WOULD_BE_EMPTY"
    );
  }
}

export async function updateTask(ctx: AdminContext, taskId: string, input: UpdateTaskInput) {
  const task = await Task.findById(taskId);
  if (!task) throw new NotFoundError("Task not found");

  const { status, ...rest } = input;
  let action = "task.updated";
  if (status && status !== task.status) {
    if (status === "draft") {
      await assertModuleKeepsAPublishedTask(task);
      await ensureNoLearnerActivity({ taskId: task.id });
    }
    task.status = status;
    action = status === "published" ? "task.published" : "task.unpublished";
  }
  task.set(rest);
  await task.save();
  await audit(ctx, action, task, { changedFields: Object.keys(input) });
  return task;
}

export async function deleteTask(ctx: AdminContext, taskId: string) {
  const task = await Task.findById(taskId);
  if (!task) throw new NotFoundError("Task not found");
  await assertModuleKeepsAPublishedTask(task);
  await ensureNoLearnerActivity({ taskId: task.id });

  await Task.deleteOne({ _id: task._id });
  await audit(ctx, "task.deleted", task);
}

export async function reorderTasks(ctx: AdminContext, moduleId: string, ids: string[]) {
  const mod = await Module.findById(moduleId);
  if (!mod) throw new NotFoundError("Module not found");
  await ensureNoLearnerActivity({ moduleId: mod.id });
  await reorderSiblings(Task, { module: mod._id }, ids);
  await recordAudit({
    actor: ctx.adminId,
    action: "task.reordered",
    targetType: "Module",
    targetId: mod.id,
    metadata: { count: ids.length },
    ip: ctx.ip,
  });
  return Task.find({ module: mod._id })
    .select("module title order estimatedDifficulty status")
    .sort({ order: 1 });
}
