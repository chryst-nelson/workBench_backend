import { z } from "zod";
import {
  emailField,
  fullNameField,
  passwordField,
  profileFields,
} from "../users/user.schemas.js";

// strictObject: unknown keys (e.g. `role`, `status`) are rejected, never silently accepted.
export const registerBody = z.strictObject({
  fullName: fullNameField,
  email: emailField,
  password: passwordField,
  programmingLanguage: profileFields.programmingLanguage.optional(),
  skillLevel: profileFields.skillLevel.optional(),
  learningGoals: profileFields.learningGoals.optional(),
  weeklyAvailabilityHours: profileFields.weeklyAvailabilityHours.optional(),
  preferredTrack: profileFields.preferredTrack.optional(),
});
export type RegisterInput = z.infer<typeof registerBody>;

export const loginBody = z.strictObject({
  email: emailField,
  password: z.string().min(1).max(200),
});

export const forgotPasswordBody = z.strictObject({ email: emailField });

export const resetPasswordBody = z.strictObject({
  token: z.string().min(20).max(200),
  newPassword: passwordField,
});
