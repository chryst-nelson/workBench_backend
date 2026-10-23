import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";
import { SKILL_LEVELS } from "../users/user.model.js";

export const CONTENT_STATUSES = ["draft", "published"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

const trackSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 120 },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    programmingLanguage: { type: String, required: true, trim: true, maxlength: 50 },
    skillLevel: { type: String, enum: SKILL_LEVELS, required: true },
    estimatedDurationWeeks: { type: Number, required: true, min: 1, max: 260 },
    status: { type: String, enum: CONTENT_STATUSES, default: "draft" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);
trackSchema.index({ status: 1, programmingLanguage: 1, skillLevel: 1 });
trackSchema.index({ createdAt: -1 });

export type TrackDocument = HydratedDocument<InferSchemaType<typeof trackSchema>>;
// Registered as "LearningTrack" so User.profile.preferredTrack's ref resolves.
export const Track = model("LearningTrack", trackSchema);
