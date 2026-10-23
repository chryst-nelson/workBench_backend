import { z } from "zod";
import { ACCOUNT_STATUSES, ROLES, SKILL_LEVELS } from "./user.model.js";
import { paginationSchema } from "../../utils/pagination.js";

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");

export const emailField = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const passwordField = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .refine((v) => Buffer.byteLength(v) <= 72, "Password is too long")
  .refine((v) => /[A-Za-z]/.test(v), "Password must contain a letter")
  .refine((v) => /\d/.test(v), "Password must contain a number");

export const profileFields = {
  programmingLanguage: z.string().trim().min(1).max(50),
  skillLevel: z.enum(SKILL_LEVELS),
  learningGoals: z.string().trim().min(1).max(1000),
  weeklyAvailabilityHours: z.number().min(1).max(168),
  preferredTrack: objectId,
};

export const fullNameField = z.string().trim().min(2).max(100);

export const updateProfileBody = z
  .strictObject({
    fullName: fullNameField.optional(),
    programmingLanguage: profileFields.programmingLanguage.optional(),
    skillLevel: profileFields.skillLevel.optional(),
    learningGoals: profileFields.learningGoals.optional(),
    weeklyAvailabilityHours: profileFields.weeklyAvailabilityHours.optional(),
    preferredTrack: profileFields.preferredTrack.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Provide at least one field to update");
export type UpdateProfileInput = z.infer<typeof updateProfileBody>;

export const changePasswordBody = z.strictObject({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordField,
});

export const userIdParams = z.object({ userId: objectId });

export const listUsersQuery = paginationSchema.extend({
  role: z.enum(ROLES).optional(),
  status: z.enum(ACCOUNT_STATUSES).optional(),
  q: z.string().trim().min(1).max(100).optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuery>;

export const updateStatusBody = z.strictObject({ status: z.enum(ACCOUNT_STATUSES) });
export const updateRoleBody = z.strictObject({ role: z.enum(ROLES) });
