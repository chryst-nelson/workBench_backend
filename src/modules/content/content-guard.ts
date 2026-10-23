import { AppError } from "../../lib/errors.js";
import { Enrollment } from "../enrollments/enrollment.model.js";
import { Submission } from "../submissions/submission.model.js";
import { Task } from "../tasks/task.model.js";

export interface ContentScope {
  trackId?: string;
  moduleId?: string;
  taskId?: string;
}

const inUse = (what: string) =>
  new AppError(
    `This ${what} is in use by learners and can't be deleted, unpublished or reordered. Edit its text instead.`,
    409,
    "CONTENT_IN_USE"
  );

/**
 * Called before destructive content changes (delete, unpublish, reorder).
 *  - track:  blocked once anyone is enrolled (the whole sequence is in play)
 *  - module / task: blocked once learners have submitted work against it
 * Adding content and editing text are never blocked.
 */
export async function ensureNoLearnerActivity(scope: ContentScope): Promise<void> {
  if (scope.trackId && (await Enrollment.exists({ track: scope.trackId }))) {
    throw inUse("track");
  }
  if (scope.moduleId) {
    const taskIds = await Task.find({ module: scope.moduleId }).distinct("_id");
    if (taskIds.length && (await Submission.exists({ task: { $in: taskIds } }))) throw inUse("module");
  }
  if (scope.taskId && (await Submission.exists({ task: scope.taskId }))) {
    throw inUse("task");
  }
}

