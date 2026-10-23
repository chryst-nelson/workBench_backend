import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";

export const REVIEW_DECISIONS = ["approved", "revision_requested"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

/** One review per submission attempt; the unique index is what makes concurrent reviews safe. */
const reviewSchema = new Schema(
  {
    submission: { type: Schema.Types.ObjectId, ref: "Submission", required: true },
    enrollment: { type: Schema.Types.ObjectId, ref: "Enrollment", required: true },
    learner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    task: { type: Schema.Types.ObjectId, ref: "Task", required: true },
    reviewer: { type: Schema.Types.ObjectId, ref: "User", required: true },
    decision: { type: String, enum: REVIEW_DECISIONS, required: true },
    feedback: { type: String, trim: true, maxlength: 5000 },
  },
  { timestamps: true }
);
reviewSchema.index({ submission: 1 }, { unique: true });
reviewSchema.index({ reviewer: 1, createdAt: -1 });

export type ReviewDocument = HydratedDocument<InferSchemaType<typeof reviewSchema>>;
export const Review = model("Review", reviewSchema);
