import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";
import { CONTENT_STATUSES } from "../tracks/track.model.js";

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export const SUBMISSION_TYPES = ["github", "deployed_url", "written"] as const;
export type SubmissionType = (typeof SUBMISSION_TYPES)[number];

const stringList = { type: [{ type: String, trim: true, maxlength: 500 }], default: [] };

const taskSchema = new Schema(
  {
    // Denormalised from the module so progression queries can scan a whole track.
    track: { type: Schema.Types.ObjectId, ref: "LearningTrack", required: true, index: true },
    module: { type: Schema.Types.ObjectId, ref: "Module", required: true },
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 150 },
    problemDescription: { type: String, required: true, trim: true, maxlength: 10_000 },
    learningObjectives: stringList,
    requirements: stringList,
    instructions: { type: String, required: true, trim: true, maxlength: 10_000 },
    expectedDeliverables: stringList,
    submissionGuidelines: { type: String, required: true, trim: true, maxlength: 5000 },
    allowedSubmissionTypes: {
      type: [{ type: String, enum: SUBMISSION_TYPES }],
      default: ["github"],
    },
    order: { type: Number, required: true, min: 1, max: 10_000, validate: Number.isInteger },
    estimatedDifficulty: { type: String, enum: DIFFICULTIES, required: true },
    status: { type: String, enum: CONTENT_STATUSES, default: "draft" },
  },
  { timestamps: true }
);
taskSchema.index({ module: 1, order: 1 }, { unique: true });

export type TaskDocument = HydratedDocument<InferSchemaType<typeof taskSchema>>;
export const Task = model("Task", taskSchema);
