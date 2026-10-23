import { AppError, NotFoundError } from "../../lib/errors.js";
import { loadVisibleTask } from "../content/content.access.js";
import type { Viewer } from "../content/content.utils.js";
import { getTaskState, requireEnrollment } from "../enrollments/progression.service.js";
import type { TaskDocument } from "../tasks/task.model.js";
import { assertCanAccess, reviewsFor } from "../reviews/review.service.js";
import { User } from "../users/user.model.js";
import { Submission, type SubmissionDocument } from "./submission.model.js";
import type { CreateSubmissionInput, ListSubmissionsQuery, ResubmitInput } from "./submission.schemas.js";

type Content = Pick<CreateSubmissionInput, "type"> & { url?: string; explanation?: string; notes?: string };

function assertTypeAllowed(task: TaskDocument, type: string) {
  if (!(task.allowedSubmissionTypes as string[]).includes(type)) {
    throw new AppError(
      `This task accepts: ${task.allowedSubmissionTypes.join(", ")}`,
      400,
      "SUBMISSION_TYPE_NOT_ALLOWED"
    );
  }
}

const contentOf = (i: Content) => ({
  type: i.type,
  ...(i.url !== undefined && { url: i.url }),
  ...(i.explanation !== undefined && { explanation: i.explanation }),
  ...(i.notes !== undefined && { notes: i.notes }),
});

const isDuplicateKey = (err: unknown) => (err as { code?: number })?.code === 11000;

export async function createSubmission(learner: Viewer, input: CreateSubmissionInput) {
  const task = await loadVisibleTask(learner, input.taskId).then((r) => r.task);
  const enrollment = await requireEnrollment(learner.id, task.track);

  const state = await getTaskState(learner.id, task);
  if (state === "locked") throw new AppError("Complete the previous task to unlock this one", 403, "TASK_LOCKED");
  if (state === "completed") throw new AppError("This task is already approved", 409, "TASK_ALREADY_COMPLETED");
  assertTypeAllowed(task, input.type);

  if (await Submission.exists({ learner: learner.id, task: task._id })) {
    throw new AppError(
      "You already have a submission for this task. Use the resubmit endpoint after a revision is requested.",
      409,
      "SUBMISSION_EXISTS"
    );
  }
  try {
    return await Submission.create({
      learner: learner.id,
      enrollment: enrollment._id,
      track: task.track,
      task: task._id,
      attempt: 1,
      status: "pending_review",
      ...contentOf(input),
    });
  } catch (err) {
    if (isDuplicateKey(err)) throw new AppError("Submission already exists for this task", 409, "SUBMISSION_EXISTS");
    throw err;
  }
}

export async function resubmit(learner: Viewer, submissionId: string, input: ResubmitInput) {
  // Owner only: someone else's submission is a 404, not a 403.
  const previous = await Submission.findOne({ _id: submissionId, learner: learner.id });
  if (!previous) throw new NotFoundError("Submission not found");

  if (previous.status !== "revision_requested") {
    throw new AppError(
      previous.status === "approved"
        ? "This submission is already approved"
        : "This submission is still awaiting review",
      409,
      "NOT_RESUBMITTABLE"
    );
  }
  // Only the newest attempt can be resubmitted from.
  if (await Submission.exists({ learner: learner.id, task: previous.task, attempt: { $gt: previous.attempt } })) {
    throw new AppError("A newer attempt already exists for this task", 409, "NOT_RESUBMITTABLE");
  }

  const task = await loadVisibleTask(learner, String(previous.task)).then((r) => r.task);
  assertTypeAllowed(task, input.type);

  try {
    // The unique (learner, task, attempt) index makes concurrent resubmits safe: one wins.
    return await Submission.create({
      learner: learner.id,
      enrollment: previous.enrollment,
      track: previous.track,
      task: previous.task,
      attempt: previous.attempt + 1,
      previousSubmission: previous._id,
      status: "pending_review",
      ...contentOf(input),
    });
  } catch (err) {
    if (isDuplicateKey(err)) throw new AppError("A newer attempt already exists for this task", 409, "NOT_RESUBMITTABLE");
    throw err;
  }
}

export async function listMine(learnerId: string, query: ListSubmissionsQuery) {
  const { page, limit, taskId, status } = query;
  const filter: Record<string, unknown> = { learner: learnerId };
  if (taskId) filter.task = taskId;
  if (status) filter.status = status;
  const [items, total] = await Promise.all([
    Submission.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Submission.countDocuments(filter),
  ]);
  const reviews = await reviewsFor(items.map((i) => i._id));
  return { items, total, reviews };
}

/**
 * Owner, admin, or the mentor assigned to the learner's enrollment. Everyone else gets a 404.
 * Returns the submission plus every attempt for the same task, each with its review.
 */
export async function getSubmission(viewer: Viewer, submissionId: string) {
  const submission = await Submission.findById(submissionId);
  if (!submission) throw new NotFoundError("Submission not found");
  if (viewer.role === "learner") {
    if (String(submission.learner) !== viewer.id) throw new NotFoundError("Submission not found");
  } else {
    await assertCanAccess(viewer, submission.enrollment);
  }
  const history: SubmissionDocument[] = await Submission.find({
    learner: submission.learner,
    task: submission.task,
  }).sort({ attempt: 1 });
  const reviews = await reviewsFor(history.map((h) => h._id));
  const learner =
    viewer.role === "learner" ? null : await User.findById(submission.learner).select("fullName email profile");
  return { submission, history, reviews, learner };
}
