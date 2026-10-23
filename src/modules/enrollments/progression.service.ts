import type { Types } from "mongoose";
import { AppError } from "../../lib/errors.js";
import { Module } from "../modules/module.model.js";
import { Submission } from "../submissions/submission.model.js";
import { Task, type TaskDocument } from "../tasks/task.model.js";
import { Enrollment } from "./enrollment.model.js";

type Id = string | Types.ObjectId;

export type TaskState = "completed" | "current" | "locked";

/**
 * Progression is DERIVED, never stored: the track's published tasks in order
 * (module order, then task order) form the sequence, and the first task without an
 * approved submission is the learner's current task. Everything after it is locked;
 * everything approved stays accessible. Because nothing is cached, it can't drift.
 */
export async function getTrackSequence(trackId: Id): Promise<TaskDocument[]> {
  const modules = await Module.find({ track: trackId, status: "published" })
    .select("_id order")
    .sort({ order: 1 });
  const tasks = await Task.find({ module: { $in: modules.map((m) => m._id) }, status: "published" })
    .select("track module title order estimatedDifficulty status")
    .sort({ order: 1 });

  const byModule = new Map<string, TaskDocument[]>();
  for (const t of tasks) byModule.set(String(t.module), [...(byModule.get(String(t.module)) ?? []), t]);
  return modules.flatMap((m) => byModule.get(m.id) ?? []);
}

export async function getApprovedTaskIds(learnerId: Id, trackId: Id): Promise<Set<string>> {
  const ids = await Submission.distinct("task", { learner: learnerId, track: trackId, status: "approved" });
  return new Set(ids.map(String));
}

export function computeStates(sequence: TaskDocument[], approved: Set<string>) {
  let blocked = false;
  return sequence.map((task) => {
    let state: TaskState;
    if (approved.has(task.id)) state = "completed";
    else if (!blocked) {
      state = "current";
      blocked = true;
    } else state = "locked";
    return { task, state };
  });
}

/** Requires the learner to be enrolled in the task's track; returns the enrollment. */
export async function requireEnrollment(learnerId: string, trackId: Id) {
  const enrollment = await Enrollment.findOne({ learner: learnerId, track: trackId });
  if (!enrollment) {
    throw new AppError("You are not enrolled in this track", 403, "NOT_ENROLLED");
  }
  return enrollment;
}

/** State of one task for one learner (must already be enrolled). */
export async function getTaskState(learnerId: string, task: TaskDocument): Promise<TaskState> {
  const [sequence, approved] = await Promise.all([
    getTrackSequence(task.track),
    getApprovedTaskIds(learnerId, task.track),
  ]);
  return computeStates(sequence, approved).find((s) => s.task.id === task.id)?.state ?? "locked";
}

/** Throws unless the learner is enrolled and has unlocked the task. */
export async function assertTaskUnlocked(learnerId: string, task: TaskDocument): Promise<TaskState> {
  await requireEnrollment(learnerId, task.track);
  const state = await getTaskState(learnerId, task);
  if (state === "locked") {
    throw new AppError("Complete the previous task to unlock this one", 403, "TASK_LOCKED");
  }
  return state;
}
