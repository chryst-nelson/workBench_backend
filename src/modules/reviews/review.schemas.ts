import { z } from "zod";
import { paginationSchema } from "../../utils/pagination.js";
import { objectId } from "../users/user.schemas.js";
import { SUBMISSION_STATUSES } from "../submissions/submission.model.js";

export const MIN_REVISION_FEEDBACK = 10;

const feedback = z.string().trim().max(5000);

export const reviewBody = z.discriminatedUnion("decision", [
  z.strictObject({ decision: z.literal("approved"), feedback: feedback.optional() }),
  z.strictObject({
    decision: z.literal("revision_requested"),
    feedback: feedback.min(MIN_REVISION_FEEDBACK, `Explain what to change (at least ${MIN_REVISION_FEEDBACK} characters)`),
  }),
]);
export type ReviewInput = z.infer<typeof reviewBody>;

export const queueQuery = paginationSchema.extend({
  status: z.enum(SUBMISSION_STATUSES).default("pending_review"),
  trackId: objectId.optional(),
});
export type QueueQuery = z.infer<typeof queueQuery>;
