import type { ReviewView } from "../reviews/review.serializer.js";
import type { SubmissionDocument } from "./submission.model.js";

export const toSubmission = (s: SubmissionDocument, review: ReviewView | null = null) => ({
  id: s.id as string,
  learner: String(s.learner),
  enrollment: String(s.enrollment),
  track: String(s.track),
  task: String(s.task),
  attempt: s.attempt,
  previousSubmission: s.previousSubmission ? String(s.previousSubmission) : null,
  type: s.type,
  url: s.url ?? null,
  explanation: s.explanation ?? null,
  notes: s.notes ?? null,
  status: s.status,
  review,
  submittedAt: s.createdAt,
  updatedAt: s.updatedAt,
});
