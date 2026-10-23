import { z } from "zod";
import { SKILL_LEVELS } from "../users/user.model.js";
import { objectId } from "../users/user.schemas.js";
import { paginationSchema } from "../../utils/pagination.js";
import { CONTENT_STATUSES } from "./track.model.js";

const fields = {
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(1).max(2000),
  programmingLanguage: z.string().trim().min(1).max(50),
  skillLevel: z.enum(SKILL_LEVELS),
  estimatedDurationWeeks: z.number().int().min(1).max(260),
};

// New tracks are always drafts; publishing goes through PATCH so publish rules apply.
export const createTrackBody = z.strictObject(fields);
export type CreateTrackInput = z.infer<typeof createTrackBody>;

export const updateTrackBody = z
  .strictObject({
    title: fields.title.optional(),
    description: fields.description.optional(),
    programmingLanguage: fields.programmingLanguage.optional(),
    skillLevel: fields.skillLevel.optional(),
    estimatedDurationWeeks: fields.estimatedDurationWeeks.optional(),
    status: z.enum(CONTENT_STATUSES).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Provide at least one field to update");
export type UpdateTrackInput = z.infer<typeof updateTrackBody>;

export const listTracksQuery = paginationSchema.extend({
  language: z.string().trim().min(1).max(50).optional(),
  skillLevel: z.enum(SKILL_LEVELS).optional(),
  status: z.enum(CONTENT_STATUSES).optional(), // honoured for admins only
  q: z.string().trim().min(1).max(100).optional(),
});
export type ListTracksQuery = z.infer<typeof listTracksQuery>;

export const trackIdParams = z.object({ trackId: objectId });
