import type { QueryFilter } from "mongoose";
import { AppError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { escapeRegex } from "../../utils/pagination.js";
import { recordAudit } from "../audit/audit.service.js";
import { ensureNoLearnerActivity } from "../content/content-guard.js";
import { loadVisibleTrack } from "../content/content.access.js";
import { isAdmin, type AdminContext, type Viewer } from "../content/content.utils.js";
import { Module } from "../modules/module.model.js";
import { Task } from "../tasks/task.model.js";
import { Track, type TrackDocument } from "./track.model.js";
import type { CreateTrackInput, ListTracksQuery, UpdateTrackInput } from "./track.schemas.js";

export { loadVisibleTrack as getTrack };

export async function createTrack(ctx: AdminContext, input: CreateTrackInput) {
  const track = await Track.create({ ...input, status: "draft", createdBy: ctx.adminId });
  await recordAudit({
    actor: ctx.adminId,
    action: "track.created",
    targetType: "LearningTrack",
    targetId: track.id,
    metadata: { title: track.title },
    ip: ctx.ip,
  });
  return track;
}

export async function listTracks(viewer: Viewer, query: ListTracksQuery) {
  const { page, limit, language, skillLevel, status, q } = query;
  const filter: QueryFilter<TrackDocument> = {};
  // Non-admins are pinned to published; the status filter is an admin tool.
  if (!isAdmin(viewer)) filter.status = "published";
  else if (status) filter.status = status;
  if (language) filter.programmingLanguage = new RegExp(`^${escapeRegex(language)}$`, "i");
  if (skillLevel) filter.skillLevel = skillLevel;
  if (q) filter.title = new RegExp(escapeRegex(q), "i");

  const [items, total] = await Promise.all([
    Track.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Track.countDocuments(filter),
  ]);
  return { items, total };
}

async function assertPublishable(trackId: string) {
  const published = await Module.countDocuments({ track: trackId, status: "published" });
  if (published === 0) {
    throw new AppError(
      "A track needs at least one published module before it can be published",
      409,
      "PUBLISH_REQUIREMENTS_NOT_MET"
    );
  }
}

export async function updateTrack(ctx: AdminContext, trackId: string, input: UpdateTrackInput) {
  const track = await Track.findById(trackId);
  if (!track) throw new NotFoundError("Learning track not found");

  const { status, ...rest } = input;
  let action = "track.updated";
  if (status && status !== track.status) {
    if (status === "published") await assertPublishable(track.id);
    else await ensureNoLearnerActivity({ trackId: track.id });
    track.status = status;
    action = status === "published" ? "track.published" : "track.unpublished";
  }
  track.set(rest);
  await track.save();

  await recordAudit({
    actor: ctx.adminId,
    action,
    targetType: "LearningTrack",
    targetId: track.id,
    metadata: { changedFields: Object.keys(input) },
    ip: ctx.ip,
  });
  return track;
}

/** Deletes the track with all its modules and tasks. */
export async function deleteTrack(ctx: AdminContext, trackId: string) {
  const track = await Track.findById(trackId);
  if (!track) throw new NotFoundError("Learning track not found");
  await ensureNoLearnerActivity({ trackId: track.id });

  // Children first: a failure midway leaves a still-deletable track, never orphans.
  await Task.deleteMany({ track: track._id });
  await Module.deleteMany({ track: track._id });
  await Track.deleteOne({ _id: track._id });

  await recordAudit({
    actor: ctx.adminId,
    action: "track.deleted",
    targetType: "LearningTrack",
    targetId: track.id,
    metadata: { title: track.title },
    ip: ctx.ip,
  });
}

/** Used by profile/registration: preferredTrack must point at a real, published track. */
export async function assertSelectableTrack(trackId: string | undefined) {
  if (!trackId) return;
  if (!(await Track.exists({ _id: trackId, status: "published" }))) {
    throw new ValidationError("preferredTrack must be a published learning track", [
      { path: "preferredTrack", message: "Unknown or unpublished learning track" },
    ]);
  }
}
