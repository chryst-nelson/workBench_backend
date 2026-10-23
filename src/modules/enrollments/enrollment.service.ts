import { AppError, NotFoundError } from "../../lib/errors.js";
import { loadVisibleTrack } from "../content/content.access.js";
import type { Viewer } from "../content/content.utils.js";
import { Submission } from "../submissions/submission.model.js";
import { Track } from "../tracks/track.model.js";
import { User } from "../users/user.model.js";
import { recordAudit } from "../audit/audit.service.js";
import { Enrollment } from "./enrollment.model.js";
import { computeStates, getApprovedTaskIds, getTrackSequence } from "./progression.service.js";

export async function enroll(learner: Viewer, trackId: string) {
  // Unpublished tracks are invisible to learners, so they 404 here too.
  const track = await loadVisibleTrack(learner, trackId);
  try {
    return await Enrollment.create({ learner: learner.id, track: track._id });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw new AppError("You are already enrolled in this track", 409, "ALREADY_ENROLLED");
    }
    throw err;
  }
}

export async function listMine(learnerId: string, page: number, limit: number) {
  const filter = { learner: learnerId };
  const [items, total] = await Promise.all([
    Enrollment.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Enrollment.countDocuments(filter),
  ]);
  const tracks = await Track.find({ _id: { $in: items.map((e) => e.track) } });
  const byId = new Map(tracks.map((t) => [t.id, t]));
  return { items: items.map((enrollment) => ({ enrollment, track: byId.get(String(enrollment.track)) })), total };
}

/** Owner or admin only; anyone else gets a 404 so enrollment ids can't be probed. */
export async function getProgress(viewer: Viewer, enrollmentId: string) {
  const enrollment = await Enrollment.findById(enrollmentId);
  if (!enrollment || (viewer.role !== "admin" && String(enrollment.learner) !== viewer.id)) {
    throw new NotFoundError("Enrollment not found");
  }
  const track = await Track.findById(enrollment.track);
  if (!track) throw new NotFoundError("Enrollment not found");

  const [sequence, approved] = await Promise.all([
    getTrackSequence(enrollment.track),
    getApprovedTaskIds(enrollment.learner, enrollment.track),
  ]);
  const states = computeStates(sequence, approved);

  // Latest attempt per task, to show "pending review" / "revision requested" on the current task.
  const attempts = await Submission.find({
    learner: enrollment.learner,
    task: { $in: sequence.map((t) => t._id) },
  }).sort({ attempt: -1 });
  const latest = new Map<string, (typeof attempts)[number]>();
  for (const a of attempts) if (!latest.has(String(a.task))) latest.set(String(a.task), a);

  const completed = states.filter((s) => s.state === "completed").length;
  return {
    enrollment,
    track,
    summary: {
      totalTasks: states.length,
      completedTasks: completed,
      percentComplete: states.length ? Math.round((completed / states.length) * 100) : 0,
      isComplete: states.length > 0 && completed === states.length,
      currentTaskId: states.find((s) => s.state === "current")?.task.id ?? null,
    },
    tasks: states.map(({ task, state }) => ({ task, state, latestSubmission: latest.get(task.id) ?? null })),
  };
}

/** Admin only: set or clear the mentor responsible for reviewing this enrollment's submissions. */
export async function assignMentor(
  ctx: { adminId: string; ip?: string },
  enrollmentId: string,
  mentorId: string | null
) {
  const enrollment = await Enrollment.findById(enrollmentId);
  if (!enrollment) throw new NotFoundError("Enrollment not found");

  if (mentorId) {
    const mentor = await User.findById(mentorId).select("role status");
    if (!mentor || mentor.role !== "mentor" || mentor.status !== "active") {
      throw new AppError("The selected user is not an active mentor", 400, "INVALID_MENTOR");
    }
    await Enrollment.updateOne({ _id: enrollment._id }, { mentor: mentor._id });
  } else {
    await Enrollment.updateOne({ _id: enrollment._id }, { $unset: { mentor: 1 } });
  }

  await recordAudit({
    actor: ctx.adminId,
    action: mentorId ? "enrollment.mentor_assigned" : "enrollment.mentor_removed",
    targetType: "Enrollment",
    targetId: enrollment._id,
    metadata: { mentorId, previousMentorId: enrollment.mentor ? String(enrollment.mentor) : null },
    ip: ctx.ip,
  });
  return (await Enrollment.findById(enrollment._id)) ?? enrollment;
}

type ListScope = { mentorId?: string; trackId?: string; unassigned?: boolean; status?: string };

/** Shared by the admin list and the mentor's "my learners" list. */
export async function listEnrollments(scope: ListScope, page: number, limit: number) {
  const filter: Record<string, unknown> = {};
  if (scope.trackId) filter.track = scope.trackId;
  if (scope.status) filter.status = scope.status;
  if (scope.unassigned) filter.mentor = { $exists: false };
  else if (scope.mentorId) filter.mentor = scope.mentorId;

  const [items, total] = await Promise.all([
    Enrollment.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Enrollment.countDocuments(filter),
  ]);

  const [learners, mentors, tracks, pending] = await Promise.all([
    User.find({ _id: { $in: items.map((e) => e.learner) } }).select("fullName email"),
    User.find({ _id: { $in: items.map((e) => e.mentor).filter(Boolean) } }).select("fullName email"),
    Track.find({ _id: { $in: items.map((e) => e.track) } }).select("title"),
    Submission.aggregate<{ _id: unknown; n: number }>([
      { $match: { enrollment: { $in: items.map((e) => e._id) }, status: "pending_review" } },
      { $group: { _id: "$enrollment", n: { $sum: 1 } } },
    ]),
  ]);
  const by = <T extends { id?: string }>(docs: T[]) => new Map(docs.map((d) => [String(d.id), d]));
  const L = by(learners);
  const M = by(mentors);
  const T = by(tracks);
  const P = new Map(pending.map((p) => [String(p._id), p.n]));

  return {
    total,
    items: items.map((enrollment) => ({
      enrollment,
      learner: L.get(String(enrollment.learner)),
      mentor: enrollment.mentor ? M.get(String(enrollment.mentor)) : undefined,
      track: T.get(String(enrollment.track)),
      pendingReviews: P.get(enrollment.id) ?? 0,
    })),
  };
}
