import type { ReviewDocument } from "./review.model.js";

export const toReview = (r: ReviewDocument) => ({
  id: r.id as string,
  decision: r.decision,
  feedback: r.feedback ?? null,
  reviewer: String(r.reviewer),
  reviewedAt: r.createdAt,
});

export type ReviewView = ReturnType<typeof toReview>;
