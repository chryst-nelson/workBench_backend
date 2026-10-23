import { z } from "zod";
import { objectId } from "../users/user.schemas.js";
import { paginationSchema } from "../../utils/pagination.js";

export const enrollBody = z.strictObject({ trackId: objectId });
export const enrollmentIdParams = z.object({ enrollmentId: objectId });
export const listEnrollmentsQuery = paginationSchema;

export const assignMentorBody = z.strictObject({ mentorId: objectId.nullable() });

export const adminListEnrollmentsQuery = paginationSchema.extend({
  trackId: objectId.optional(),
  mentorId: objectId.optional(),
  unassigned: z.enum(["true", "false"]).optional(),
  status: z.enum(["active", "completed"]).optional(),
});
export type AdminListEnrollmentsQuery = z.infer<typeof adminListEnrollmentsQuery>;
