import { z } from "zod";
import { objectId } from "../users/user.schemas.js";
import { CONTENT_STATUSES } from "../tracks/track.model.js";
import { DIFFICULTIES, SUBMISSION_TYPES } from "./task.model.js";

const list = (max: number) =>
  z.array(z.string().trim().min(1).max(500)).min(1).max(max);

const fields = {
  title: z.string().trim().min(3).max(150),
  problemDescription: z.string().trim().min(1).max(10_000),
  learningObjectives: list(20),
  requirements: list(30),
  instructions: z.string().trim().min(1).max(10_000),
  expectedDeliverables: list(20),
  submissionGuidelines: z.string().trim().min(1).max(5000),
  allowedSubmissionTypes: z.array(z.enum(SUBMISSION_TYPES)).min(1).max(SUBMISSION_TYPES.length),
  estimatedDifficulty: z.enum(DIFFICULTIES),
};

const distinctTypes = (v: { allowedSubmissionTypes?: string[] }) =>
  !v.allowedSubmissionTypes || new Set(v.allowedSubmissionTypes).size === v.allowedSubmissionTypes.length;

export const createTaskBody = z
  .strictObject({
    ...fields,
    allowedSubmissionTypes: fields.allowedSubmissionTypes.default(["github"]),
    order: z.number().int().min(1).max(10_000).optional(),
  })
  .refine(distinctTypes, "allowedSubmissionTypes must not contain duplicates");
export type CreateTaskInput = z.infer<typeof createTaskBody>;

export const updateTaskBody = z
  .strictObject({
    title: fields.title.optional(),
    problemDescription: fields.problemDescription.optional(),
    learningObjectives: fields.learningObjectives.optional(),
    requirements: fields.requirements.optional(),
    instructions: fields.instructions.optional(),
    expectedDeliverables: fields.expectedDeliverables.optional(),
    submissionGuidelines: fields.submissionGuidelines.optional(),
    allowedSubmissionTypes: fields.allowedSubmissionTypes.optional(),
    estimatedDifficulty: fields.estimatedDifficulty.optional(),
    status: z.enum(CONTENT_STATUSES).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Provide at least one field to update")
  .refine(distinctTypes, "allowedSubmissionTypes must not contain duplicates");
export type UpdateTaskInput = z.infer<typeof updateTaskBody>;

export const taskIdParams = z.object({ taskId: objectId });
