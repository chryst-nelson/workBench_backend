import type { TrackDocument } from "../tracks/track.model.js";
import type { ModuleDocument } from "../modules/module.model.js";
import type { TaskDocument } from "../tasks/task.model.js";

export const toTrack = (t: TrackDocument) => ({
  id: t.id as string,
  title: t.title,
  description: t.description,
  programmingLanguage: t.programmingLanguage,
  skillLevel: t.skillLevel,
  estimatedDurationWeeks: t.estimatedDurationWeeks,
  status: t.status,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
});

export const toModule = (m: ModuleDocument) => ({
  id: m.id as string,
  track: String(m.track),
  title: m.title,
  description: m.description ?? "",
  order: m.order,
  status: m.status,
  createdAt: m.createdAt,
  updatedAt: m.updatedAt,
});

/** Safe for learners: no problem statement, instructions or deliverables. */
export const toTaskSummary = (t: TaskDocument) => ({
  id: t.id as string,
  module: String(t.module),
  title: t.title,
  order: t.order,
  estimatedDifficulty: t.estimatedDifficulty,
  status: t.status,
});

export const toTask = (t: TaskDocument) => ({
  ...toTaskSummary(t),
  track: String(t.track),
  problemDescription: t.problemDescription,
  learningObjectives: [...t.learningObjectives],
  requirements: [...t.requirements],
  instructions: t.instructions,
  expectedDeliverables: [...t.expectedDeliverables],
  submissionGuidelines: t.submissionGuidelines,
  allowedSubmissionTypes: [...t.allowedSubmissionTypes],
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
});
