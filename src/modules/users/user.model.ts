import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";

export const ROLES = ["learner", "mentor", "admin"] as const;
export const ACCOUNT_STATUSES = ["active", "suspended", "disabled"] as const;
export const SKILL_LEVELS = ["beginner", "intermediate", "advanced"] as const;

export type Role = (typeof ROLES)[number];
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

const userSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: "learner", index: true },
    status: { type: String, enum: ACCOUNT_STATUSES, default: "active", index: true },
    profile: {
      programmingLanguage: { type: String, trim: true, maxlength: 50 },
      skillLevel: { type: String, enum: SKILL_LEVELS },
      learningGoals: { type: String, trim: true, maxlength: 1000 },
      weeklyAvailabilityHours: { type: Number, min: 1, max: 168 },
      // Existence is validated once LearningTrack exists (Stage 3/4).
      preferredTrack: { type: Schema.Types.ObjectId, ref: "LearningTrack" },
    },
    passwordChangedAt: { type: Date },
    lastLoginAt: { type: Date },
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpiresAt: { type: Date, select: false },
  },
  { timestamps: true }
);

export type UserDocument = HydratedDocument<InferSchemaType<typeof userSchema>>;
export const User = model("User", userSchema);
