import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";
import { SUBMISSION_TYPES } from "../tasks/task.model.js";

export const SUBMISSION_STATUSES = ["pending_review", "approved", "revision_requested"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/**
 * One document per attempt. A resubmission is a new document (attempt + 1) pointing at the
 * previous one, so history never grows inside a single document.
 */
const submissionSchema = new Schema(
  {
    learner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    enrollment: { type: Schema.Types.ObjectId, ref: "Enrollment", required: true },
    track: { type: Schema.Types.ObjectId, ref: "LearningTrack", required: true },
    task: { type: Schema.Types.ObjectId, ref: "Task", required: true },
    attempt: { type: Number, required: true, min: 1, validate: Number.isInteger },
    previousSubmission: { type: Schema.Types.ObjectId, ref: "Submission" },
    type: { type: String, enum: SUBMISSION_TYPES, required: true },
    url: { type: String, trim: true, maxlength: 500 },
    explanation: { type: String, trim: true, maxlength: 10_000 },
    notes: { type: String, trim: true, maxlength: 2000 },
    status: { type: String, enum: SUBMISSION_STATUSES, default: "pending_review" },
  },
  { timestamps: true }
);
// Guarantees attempt numbers are sequential and a given attempt can't be created twice.
submissionSchema.index({ learner: 1, task: 1, attempt: 1 }, { unique: true });
submissionSchema.index({ task: 1 });
submissionSchema.index({ status: 1, createdAt: 1 });
submissionSchema.index({ enrollment: 1 });
submissionSchema.index({ learner: 1, createdAt: -1 });

export type SubmissionDocument = HydratedDocument<InferSchemaType<typeof submissionSchema>>;
export const Submission = model("Submission", submissionSchema);
