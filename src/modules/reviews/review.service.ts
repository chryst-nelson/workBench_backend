import type { Types } from "mongoose";
import { AppError, NotFoundError } from "../../lib/errors.js";
import { recordAudit } from "../audit/audit.service.js";
import type { Viewer } from "../content/content.utils.js";
import { Enrollment } from "../enrollments/enrollment.model.js";
import { computeStates, getApprovedTaskIds, getTrackSequence } from "../enrollments/progression.service.js";
import { Submission } from "../submissions/submission.model.js";
import { Task } from "../tasks/task.model.js";
import { Track } from "../tracks/track.model.js";
import { User } from "../users/user.model.js";
import { Review, type ReviewDocument } from "./review.model.js";
import type { QueueQuery, ReviewInput } from "./review.schemas.js";

type Id = string | Types.ObjectId;

export async function reviewsFor(submissionIds: Id[]): Promise<Map<string, ReviewDocument>> {
  if (submissionIds.length === 0) return new Map();
  const reviews = await Review.find({ submission: { $in: submissionIds } });
  return new Map(reviews.map((r) => [String(r.submission), r]));
}

/** Mentors only reach submissions of learners assigned to them; anything else is a 404. */
export async function assertCanAccess(viewer: Viewer, enrollmentId: Id) {
  const enrollment = await Enrollment.findById(enrollmentId);
  if (!enrollment) throw new NotFoundError("Submission not found");
  if (viewer.role === "mentor" && String(enrollment.mentor) !== viewer.id) {
    throw new NotFoundError("Submission not found");
  }
  return enrollment;
}

async function completeEnrollmentIfDone(enrollmentId: Id, learnerId: Id, trackId: Id) {
  const [sequence, approved] = await Promise.all([getTrackSequence(trackId), getApprovedTaskIds(learnerId, trackId)]);
  const states = computeStates(sequence, approved);
  if (states.length > 0 && states.every((s) => s.state === "completed")) {
    await Enrollment.updateOne({ _id: enrollmentId, status: "active" }, { status: "completed", completedAt: new Date() });
  }
}

export async function reviewSubmission(reviewer: Viewer, submissionId: string, input: ReviewInput, ip?: string) {
  const submission = await Submission.findById(submissionId);
  if (!submission) throw new NotFoundError("Submission not found");
  await assertCanAccess(reviewer, submission.enrollment);

  if (submission.status !== "pending_review") {
    throw new AppError("This submission has already been reviewed", 409, "ALREADY_REVIEWED");
  }

  let review: ReviewDocument;
  try {
    // The unique index on `submission` lets exactly one concurrent reviewer win.
    review = await Review.create({
      submission: submission._id,
      enrollment: submission.enrollment,
      learner: submission.learner,
      task: submission.task,
      reviewer: reviewer.id,
      decision: input.decision,
      ...(input.feedback ? { feedback: input.feedback } : {}),
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw new AppError("This submission has already been reviewed", 409, "ALREADY_REVIEWED");
    }
    throw err;
  }

  await Submission.updateOne({ _id: submission._id }, { status: input.decision });
  if (input.decision === "approved") {
    await completeEnrollmentIfDone(submission.enrollment, submission.learner, submission.track);
  }

  await recordAudit({
    actor: reviewer.id,
    action: `submission.${input.decision}`,
    targetType: "Submission",
    targetId: submission._id,
    metadata: { learner: String(submission.learner), task: String(submission.task), attempt: submission.attempt },
    ip,
  });

  const updated = await Submission.findById(submission._id);
  return { submission: updated ?? submission, review };
}

export async function listQueue(viewer: Viewer, query: QueueQuery) {
  const { page, limit, status, trackId } = query;
  const filter: Record<string, unknown> = { status };
  if (trackId) filter.track = trackId;
  if (viewer.role === "mentor") {
    filter.enrollment = { $in: await Enrollment.distinct("_id", { mentor: viewer.id }) };
  }
  // Oldest first for the work queue, newest first for history views.
  const sort: Record<string, 1 | -1> =
    status === "pending_review" ? { createdAt: 1, _id: 1 } : { updatedAt: -1, _id: -1 };
  const [items, total] = await Promise.all([
    Submission.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit),
    Submission.countDocuments(filter),
  ]);

  const [learners, tasks, tracks, reviews] = await Promise.all([
    User.find({ _id: { $in: items.map((s) => s.learner) } }).select("fullName email"),
    Task.find({ _id: { $in: items.map((s) => s.task) } }).select("title"),
    Track.find({ _id: { $in: items.map((s) => s.track) } }).select("title"),
    reviewsFor(items.map((s) => s._id)),
  ]);
  const by = <T extends { id?: string }>(docs: T[]) => new Map(docs.map((d) => [String(d.id), d]));
  const L = by(learners);
  const T = by(tasks);
  const R = by(tracks);

  return {
    total,
    items: items.map((submission) => ({
      submission,
      review: reviews.get(submission.id) ?? null,
      learner: L.get(String(submission.learner)),
      task: T.get(String(submission.task)),
      track: R.get(String(submission.track)),
    })),
  };
}
