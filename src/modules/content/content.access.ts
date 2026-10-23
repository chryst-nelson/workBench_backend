import { NotFoundError } from "../../lib/errors.js";
import { Track, type TrackDocument } from "../tracks/track.model.js";
import { Module, type ModuleDocument } from "../modules/module.model.js";
import { Task, type TaskDocument } from "../tasks/task.model.js";
import { isAdmin, type Viewer } from "./content.utils.js";

/**
 * Visibility loaders. Non-admins get 404 (not 403) for anything draft, or published
 * beneath a draft parent, so unpublished content is indistinguishable from missing.
 */
export async function loadVisibleTrack(viewer: Viewer, trackId: string): Promise<TrackDocument> {
  const track = await Track.findById(trackId);
  if (!track || (!isAdmin(viewer) && track.status !== "published")) {
    throw new NotFoundError("Learning track not found");
  }
  return track;
}

export async function loadVisibleModule(
  viewer: Viewer,
  moduleId: string
): Promise<{ module: ModuleDocument; track: TrackDocument }> {
  const module = await Module.findById(moduleId);
  if (!module || (!isAdmin(viewer) && module.status !== "published")) {
    throw new NotFoundError("Module not found");
  }
  const track = await loadVisibleTrack(viewer, String(module.track)).catch(() => {
    throw new NotFoundError("Module not found");
  });
  return { module, track };
}

export async function loadVisibleTask(
  viewer: Viewer,
  taskId: string
): Promise<{ task: TaskDocument; module: ModuleDocument; track: TrackDocument }> {
  const task = await Task.findById(taskId);
  if (!task || (!isAdmin(viewer) && task.status !== "published")) {
    throw new NotFoundError("Task not found");
  }
  const parents = await loadVisibleModule(viewer, String(task.module)).catch(() => {
    throw new NotFoundError("Task not found");
  });
  return { task, ...parents };
}
