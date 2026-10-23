import { AppError, NotFoundError } from "../../lib/errors.js";
import { recordAudit } from "../audit/audit.service.js";
import { ensureNoLearnerActivity } from "../content/content-guard.js";
import { loadVisibleModule, loadVisibleTrack } from "../content/content.access.js";
import {
  createOrdered,
  reorderSiblings,
  visibleStatus,
  type AdminContext,
  type Viewer,
} from "../content/content.utils.js";
import { Track } from "../tracks/track.model.js";
import { Task, type TaskDocument } from "../tasks/task.model.js";
import { Module, type ModuleDocument } from "./module.model.js";
import type { CreateModuleInput, UpdateModuleInput } from "./module.schemas.js";

export const getModule = async (viewer: Viewer, moduleId: string) =>
  (await loadVisibleModule(viewer, moduleId)).module;

async function audit(ctx: AdminContext, action: string, mod: ModuleDocument, metadata: object = {}) {
  await recordAudit({
    actor: ctx.adminId,
    action,
    targetType: "Module",
    targetId: mod.id,
    metadata: { track: String(mod.track), title: mod.title, ...metadata },
    ip: ctx.ip,
  });
}

export async function createModule(ctx: AdminContext, trackId: string, input: CreateModuleInput) {
  const track = await Track.findById(trackId);
  if (!track) throw new NotFoundError("Learning track not found");

  const { order, ...data } = input;
  const mod = await createOrdered(
    Module,
    { track: track._id },
    (position) => Module.create({ ...data, track: track._id, order: position, status: "draft" }),
    order
  );
  await audit(ctx, "module.created", mod);
  return mod;
}

/** Syllabus: modules (in order) with their task summaries. Learners see published items only. */
export async function getSyllabus(viewer: Viewer, trackId: string) {
  const track = await loadVisibleTrack(viewer, trackId);
  const modules = await Module.find({ track: track._id, ...visibleStatus(viewer) }).sort({ order: 1 });
  const tasks = await Task.find({
    module: { $in: modules.map((m) => m._id) },
    ...visibleStatus(viewer),
  })
    .select("module title order estimatedDifficulty status")
    .sort({ order: 1 });

  const byModule = new Map<string, TaskDocument[]>();
  for (const t of tasks) {
    const key = String(t.module);
    byModule.set(key, [...(byModule.get(key) ?? []), t]);
  }
  return modules.map((m) => ({ module: m, tasks: byModule.get(m.id) ?? [] }));
}

export async function updateModule(ctx: AdminContext, moduleId: string, input: UpdateModuleInput) {
  const mod = await Module.findById(moduleId);
  if (!mod) throw new NotFoundError("Module not found");

  const { status, ...rest } = input;
  let action = "module.updated";
  if (status && status !== mod.status) {
    if (status === "published") {
      if ((await Task.countDocuments({ module: mod._id, status: "published" })) === 0) {
        throw new AppError(
          "A module needs at least one published task before it can be published",
          409,
          "PUBLISH_REQUIREMENTS_NOT_MET"
        );
      }
    } else {
      await assertTrackKeepsAPublishedModule(mod);
      await ensureNoLearnerActivity({ moduleId: mod.id });
    }
    mod.status = status;
    action = status === "published" ? "module.published" : "module.unpublished";
  }
  mod.set(rest);
  await mod.save();
  await audit(ctx, action, mod, { changedFields: Object.keys(input) });
  return mod;
}

/** A published track must always keep at least one published module. */
async function assertTrackKeepsAPublishedModule(mod: ModuleDocument) {
  if (mod.status !== "published") return;
  const track = await Track.findById(mod.track);
  if (track?.status !== "published") return;
  const others = await Module.countDocuments({ track: mod.track, status: "published", _id: { $ne: mod._id } });
  if (others === 0) {
    throw new AppError(
      "This is the only published module of a published track. Unpublish the track first.",
      409,
      "PARENT_WOULD_BE_EMPTY"
    );
  }
}

export async function deleteModule(ctx: AdminContext, moduleId: string) {
  const mod = await Module.findById(moduleId);
  if (!mod) throw new NotFoundError("Module not found");
  await assertTrackKeepsAPublishedModule(mod);
  await ensureNoLearnerActivity({ moduleId: mod.id });

  await Task.deleteMany({ module: mod._id });
  await Module.deleteOne({ _id: mod._id });
  await audit(ctx, "module.deleted", mod);
}

export async function reorderModules(ctx: AdminContext, trackId: string, ids: string[]) {
  const track = await Track.findById(trackId);
  if (!track) throw new NotFoundError("Learning track not found");
  await ensureNoLearnerActivity({ trackId: track.id });
  await reorderSiblings(Module, { track: track._id }, ids);
  await recordAudit({
    actor: ctx.adminId,
    action: "module.reordered",
    targetType: "LearningTrack",
    targetId: track.id,
    metadata: { count: ids.length },
    ip: ctx.ip,
  });
  return Module.find({ track: track._id }).sort({ order: 1 });
}
