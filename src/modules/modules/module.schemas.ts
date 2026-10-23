import { z } from "zod";
import { objectId } from "../users/user.schemas.js";
import { CONTENT_STATUSES } from "../tracks/track.model.js";

const fields = {
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(1000),
};

export const createModuleBody = z.strictObject({
  title: fields.title,
  description: fields.description.optional(),
  order: z.number().int().min(1).max(10_000).optional(),
});
export type CreateModuleInput = z.infer<typeof createModuleBody>;

// Position changes go through the reorder endpoint only.
export const updateModuleBody = z
  .strictObject({
    title: fields.title.optional(),
    description: fields.description.optional(),
    status: z.enum(CONTENT_STATUSES).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Provide at least one field to update");
export type UpdateModuleInput = z.infer<typeof updateModuleBody>;

export const reorderBody = z.strictObject({ ids: z.array(objectId).min(1).max(500) });

export const moduleIdParams = z.object({ moduleId: objectId });
