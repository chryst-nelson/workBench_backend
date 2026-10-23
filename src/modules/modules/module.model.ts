import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";
import { CONTENT_STATUSES } from "../tracks/track.model.js";

const moduleSchema = new Schema(
  {
    track: { type: Schema.Types.ObjectId, ref: "LearningTrack", required: true },
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 1000, default: "" },
    order: { type: Number, required: true, min: 1, max: 10_000, validate: Number.isInteger },
    status: { type: String, enum: CONTENT_STATUSES, default: "draft" },
  },
  { timestamps: true }
);
// One position per module within a track; also serves ordered listing.
moduleSchema.index({ track: 1, order: 1 }, { unique: true });

export type ModuleDocument = HydratedDocument<InferSchemaType<typeof moduleSchema>>;
export const Module = model("Module", moduleSchema);
