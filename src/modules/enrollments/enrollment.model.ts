import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";

export const ENROLLMENT_STATUSES = ["active", "completed"] as const;

const enrollmentSchema = new Schema(
  {
    learner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    track: { type: Schema.Types.ObjectId, ref: "LearningTrack", required: true },
    // Assigned in Stage 5.
    mentor: { type: Schema.Types.ObjectId, ref: "User" },
    status: { type: String, enum: ENROLLMENT_STATUSES, default: "active" },
    completedAt: { type: Date },
  },
  { timestamps: true }
);
// A learner can be enrolled in a given track only once (also stops double-click races).
enrollmentSchema.index({ learner: 1, track: 1 }, { unique: true });
enrollmentSchema.index({ track: 1 });
enrollmentSchema.index({ mentor: 1, status: 1 });

export type EnrollmentDocument = HydratedDocument<InferSchemaType<typeof enrollmentSchema>>;
export const Enrollment = model("Enrollment", enrollmentSchema);
