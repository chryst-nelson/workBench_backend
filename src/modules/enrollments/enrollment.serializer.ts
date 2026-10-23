import { toTaskSummary, toTrack } from "../content/content.serializer.js";
import type { EnrollmentDocument } from "./enrollment.model.js";
import type { TaskDocument } from "../tasks/task.model.js";
import type { TrackDocument } from "../tracks/track.model.js";
import type { SubmissionDocument } from "../submissions/submission.model.js";
import type { TaskState } from "./progression.service.js";

export const toEnrollment = (e: EnrollmentDocument) => ({
  id: e.id as string,
  learner: String(e.learner),
  track: String(e.track),
  mentor: e.mentor ? String(e.mentor) : null,
  status: e.status,
  completedAt: e.completedAt ?? null,
  enrolledAt: e.createdAt,
});

export const toEnrollmentWithTrack = (e: EnrollmentDocument, track?: TrackDocument) => ({
  ...toEnrollment(e),
  trackDetails: track ? toTrack(track) : null,
});

export const toProgressTask = (i: { task: TaskDocument; state: TaskState; latestSubmission: SubmissionDocument | null }) => ({
  ...toTaskSummary(i.task),
  state: i.state,
  latestSubmission: i.latestSubmission
    ? { id: i.latestSubmission.id as string, attempt: i.latestSubmission.attempt, status: i.latestSubmission.status }
    : null,
});

type Named = { id?: string; fullName: string; email: string };

export const toEnrollmentListItem = (i: {
  enrollment: EnrollmentDocument;
  learner?: Named;
  mentor?: Named;
  track?: { id?: string; title: string };
  pendingReviews: number;
}) => ({
  ...toEnrollment(i.enrollment),
  learnerDetails: i.learner ? { id: i.learner.id as string, fullName: i.learner.fullName, email: i.learner.email } : null,
  mentorDetails: i.mentor ? { id: i.mentor.id as string, fullName: i.mentor.fullName, email: i.mentor.email } : null,
  trackDetails: i.track ? { id: i.track.id as string, title: i.track.title } : null,
  pendingReviews: i.pendingReviews,
});
