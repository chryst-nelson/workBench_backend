import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTestDb, closeTestDb, connectTestDb } from "./helpers/db.js";
import { api, bearer, createUser, loginAs } from "./helpers/auth.js";
import { Enrollment } from "../src/modules/enrollments/enrollment.model.js";
import { AuditLog } from "../src/modules/audit/audit.model.js";

beforeAll(connectTestDb);
afterAll(closeTestDb);
beforeEach(clearTestDb);

type H = Record<string, string>;
async function as(role: "learner" | "mentor" | "admin") {
  const u = await createUser(role);
  const { token } = await loginAs(u.email);
  return { user: u, h: bearer(token) as H };
}

const taskBody = (title: string, over: Record<string, unknown> = {}) => ({
  title,
  problemDescription: `Problem for ${title}`,
  learningObjectives: ["Learn"],
  requirements: ["Do it"],
  instructions: "Follow the steps.",
  expectedDeliverables: ["A repo"],
  submissionGuidelines: "Share a link.",
  allowedSubmissionTypes: ["github", "written"],
  estimatedDifficulty: "easy",
  ...over,
});

/** Published track: module 1 has 2 tasks, module 2 has 1 task -> sequence of 3. */
async function publishedTrack(h: H, over: Record<string, unknown> = {}) {
  const track = (await api().post("/api/v1/tracks").set(h).send({
    title: "Backend Foundations", description: "Learn backend", programmingLanguage: "JavaScript",
    skillLevel: "beginner", estimatedDurationWeeks: 6, ...over,
  })).body.data.track;
  const tasks: string[] = [];
  const modules: string[] = [];
  for (const [mi, titles] of [["Module one", ["Task A", "Task B"]], ["Module two", ["Task C"]]] as const) {
    const mod = (await api().post(`/api/v1/tracks/${track.id}/modules`).set(h).send({ title: mi })).body.data.module;
    modules.push(mod.id);
    for (const t of titles) {
      const task = (await api().post(`/api/v1/modules/${mod.id}/tasks`).set(h).send(taskBody(t))).body.data.task;
      await api().patch(`/api/v1/tasks/${task.id}`).set(h).send({ status: "published" }).expect(200);
      tasks.push(task.id);
    }
    await api().patch(`/api/v1/modules/${mod.id}`).set(h).send({ status: "published" }).expect(200);
  }
  await api().patch(`/api/v1/tracks/${track.id}`).set(h).send({ status: "published" }).expect(200);
  return { trackId: track.id as string, tasks, modules };
}

const github = (taskId: string) => ({ taskId, type: "github", url: "https://github.com/ada/todo-cli" });
const B = "/api/v1";

async function setup() {
  const admin = await as("admin");
  const learner = await as("learner");
  const mentor = await as("mentor");
  const content = await publishedTrack(admin.h);
  const enrollment = (await api().post(`${B}/enrollments`).set(learner.h).send({ trackId: content.trackId })).body.data.enrollment;
  const assign = (mentorId: string | null = mentor.user.id) =>
    api().patch(`${B}/enrollments/${enrollment.id}/mentor`).set(admin.h).send({ mentorId });
  const submit = async (i: number) =>
    (await api().post(`${B}/submissions`).set(learner.h).send(github(content.tasks[i]!))).body.data.submission as { id: string };
  const review = (h: H, id: string, body: Record<string, unknown>) =>
    api().post(`${B}/submissions/${id}/review`).set(h).send(body);
  const progress = async () => (await api().get(`${B}/enrollments/${enrollment.id}/progress`).set(learner.h)).body.data;
  return { admin, learner, mentor, ...content, enrollment, assign, submit, review, progress };
}

describe("mentor assignment", () => {
  it("lets admins list, assign, reassign and clear a mentor", async () => {
    const s = await setup();
    const unassigned = await api().get(`${B}/enrollments?unassigned=true`).set(s.admin.h);
    expect(unassigned.status).toBe(200);
    expect(unassigned.body.data).toHaveLength(1);
    expect(unassigned.body.data[0]).toMatchObject({ mentorDetails: null, learnerDetails: { id: s.learner.user.id } });

    const ok = await s.assign();
    expect(ok.status).toBe(200);
    expect(ok.body.data.enrollment.mentor).toBe(s.mentor.user.id);
    expect((await api().get(`${B}/enrollments?unassigned=true`).set(s.admin.h)).body.data).toHaveLength(0);
    expect((await api().get(`${B}/enrollments?mentorId=${s.mentor.user.id}`).set(s.admin.h)).body.data).toHaveLength(1);

    const cleared = await s.assign(null);
    expect(cleared.body.data.enrollment.mentor).toBeNull();
    expect(await AuditLog.countDocuments({ action: { $in: ["enrollment.mentor_assigned", "enrollment.mentor_removed"] } })).toBe(2);
  });

  it("only accepts active mentors", async () => {
    const s = await setup();
    for (const target of [s.learner.user.id, s.admin.user.id]) {
      const res = await s.assign(target);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_MENTOR");
    }
    const suspended = await createUser("mentor", { status: "suspended" });
    expect((await s.assign(suspended.id)).body.error.code).toBe("INVALID_MENTOR");
    expect((await s.assign("a".repeat(24))).status).toBe(400);
    expect((await api().patch(`${B}/enrollments/${"a".repeat(24)}/mentor`).set(s.admin.h).send({ mentorId: null })).status).toBe(404);
  });

  it("is admin-only", async () => {
    const s = await setup();
    for (const who of [s.learner, s.mentor]) {
      expect((await api().patch(`${B}/enrollments/${s.enrollment.id}/mentor`).set(who.h).send({ mentorId: null })).status).toBe(403);
      expect((await api().get(`${B}/enrollments`).set(who.h)).status).toBe(403);
    }
  });

  it("shows mentors only their own learners", async () => {
    const s = await setup();
    await s.assign();
    const other = await as("mentor");
    const mine = await api().get(`${B}/enrollments/assigned`).set(s.mentor.h);
    expect(mine.body.data).toHaveLength(1);
    expect(mine.body.data[0]).toMatchObject({ pendingReviews: 0, trackDetails: { id: s.trackId } });
    expect((await api().get(`${B}/enrollments/assigned`).set(other.h)).body.data).toHaveLength(0);
    expect((await api().get(`${B}/enrollments/assigned`).set(s.learner.h)).status).toBe(403);

    await s.submit(0);
    expect((await api().get(`${B}/enrollments/assigned`).set(s.mentor.h)).body.data[0].pendingReviews).toBe(1);
  });
});

describe("review queue", () => {
  it("scopes mentors to assigned learners; admins see all", async () => {
    const s = await setup();
    const other = await as("mentor");
    const sub = await s.submit(0);

    const unassignedView = await api().get(`${B}/reviews/queue`).set(s.mentor.h);
    expect(unassignedView.body.data).toHaveLength(0);

    await s.assign();
    const mine = await api().get(`${B}/reviews/queue`).set(s.mentor.h);
    expect(mine.status).toBe(200);
    expect(mine.body.data).toHaveLength(1);
    expect(mine.body.data[0]).toMatchObject({
      submission: { id: sub.id, status: "pending_review", review: null },
      learner: { id: s.learner.user.id },
      task: { title: "Task A" },
      track: { id: s.trackId },
    });
    expect((await api().get(`${B}/reviews/queue`).set(other.h)).body.data).toHaveLength(0);
    expect((await api().get(`${B}/reviews/queue`).set(s.admin.h)).body.data).toHaveLength(1);
    expect((await api().get(`${B}/reviews/queue`).set(s.learner.h)).status).toBe(403);
    expect((await api().get(`${B}/reviews/queue`)).status).toBe(401);
    expect((await api().get(`${B}/reviews/queue?status=bogus`).set(s.mentor.h)).status).toBe(400);
  });
});

describe("reviewing", () => {
  it("approves, unlocks the next task and shows feedback to the learner", async () => {
    const s = await setup();
    await s.assign();
    const sub = await s.submit(0);
    expect((await s.progress()).tasks.map((t: { state: string }) => t.state)).toEqual(["current", "locked", "locked"]);

    const res = await s.review(s.mentor.h, sub.id, { decision: "approved", feedback: "Clean work." });
    expect(res.status).toBe(201);
    expect(res.body.data.submission).toMatchObject({
      status: "approved",
      review: { decision: "approved", feedback: "Clean work.", reviewer: s.mentor.user.id },
    });
    expect((await s.progress()).tasks.map((t: { state: string }) => t.state)).toEqual(["completed", "current", "locked"]);

    const mine = await api().get(`${B}/submissions/me`).set(s.learner.h);
    expect(mine.body.data[0].review).toMatchObject({ decision: "approved", feedback: "Clean work." });
    expect((await api().get(`${B}/reviews/queue`).set(s.mentor.h)).body.data).toHaveLength(0);
    expect((await api().get(`${B}/reviews/queue?status=approved`).set(s.mentor.h)).body.data).toHaveLength(1);
    expect(await AuditLog.countDocuments({ action: "submission.approved" })).toBe(1);
  });

  it("requires feedback when requesting changes, then allows a resubmission", async () => {
    const s = await setup();
    await s.assign();
    const sub = await s.submit(0);

    expect((await s.review(s.mentor.h, sub.id, { decision: "revision_requested" })).status).toBe(400);
    expect((await s.review(s.mentor.h, sub.id, { decision: "revision_requested", feedback: "short" })).status).toBe(400);
    expect((await s.review(s.mentor.h, sub.id, { decision: "maybe" })).status).toBe(400);
    expect((await s.review(s.mentor.h, sub.id, { decision: "approved", extra: 1 })).status).toBe(400);

    const rev = await s.review(s.mentor.h, sub.id, { decision: "revision_requested", feedback: "Add input validation to the CLI." });
    expect(rev.status).toBe(201);
    expect(rev.body.data.submission.status).toBe("revision_requested");
    expect((await s.progress()).tasks[0].state).toBe("current");

    const again = await api().post(`${B}/submissions/${sub.id}/resubmit`).set(s.learner.h).send({ type: "github", url: "https://github.com/ada/todo-cli-v2" });
    expect(again.status).toBe(201);
    expect(again.body.data.submission.attempt).toBe(2);

    const detail = await api().get(`${B}/submissions/${again.body.data.submission.id}`).set(s.learner.h);
    expect(detail.body.data.history).toHaveLength(2);
    expect(detail.body.data.history[0].review).toMatchObject({ decision: "revision_requested", feedback: "Add input validation to the CLI." });
    expect(detail.body.data.history[1].review).toBeNull();
    expect(detail.body.data.learner).toBeNull();

    const ok = await s.review(s.mentor.h, again.body.data.submission.id, { decision: "approved" });
    expect(ok.body.data.submission.review.feedback).toBeNull();
  });

  it("rejects second reviews, including concurrent ones", async () => {
    const s = await setup();
    await s.assign();
    const sub = await s.submit(0);
    const results = await Promise.all([
      s.review(s.mentor.h, sub.id, { decision: "approved" }),
      s.review(s.admin.h, sub.id, { decision: "revision_requested", feedback: "Needs more tests, please." }),
    ]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    const loser = results.find((r) => r.status !== 201)!;
    expect(loser.status).toBe(409);
    expect(loser.body.error.code).toBe("ALREADY_REVIEWED");
    expect((await s.review(s.mentor.h, sub.id, { decision: "approved" })).body.error.code).toBe("ALREADY_REVIEWED");
  });

  it("hides submissions from mentors who are not assigned", async () => {
    const s = await setup();
    const other = await as("mentor");
    const sub = await s.submit(0);
    await s.assign();

    expect((await s.review(other.h, sub.id, { decision: "approved" })).status).toBe(404);
    expect((await api().get(`${B}/submissions/${sub.id}`).set(other.h)).status).toBe(404);
    expect((await api().get(`${B}/submissions/${sub.id}`).set(s.mentor.h)).status).toBe(200);
    expect((await s.review(s.learner.h, sub.id, { decision: "approved" })).status).toBe(403);
    expect((await s.review(s.mentor.h, "a".repeat(24), { decision: "approved" })).status).toBe(404);

    await s.assign(null);
    expect((await api().get(`${B}/submissions/${sub.id}`).set(s.mentor.h)).status).toBe(404);
  });

  it("gives the assigned mentor the learner's profile on the submission", async () => {
    const s = await setup();
    await api().patch(`${B}/users/me`).set(s.learner.h).send({ programmingLanguage: "Python", skillLevel: "beginner", learningGoals: "Build APIs", weeklyAvailabilityHours: 6 });
    await s.assign();
    const sub = await s.submit(0);
    const res = await api().get(`${B}/submissions/${sub.id}`).set(s.mentor.h);
    expect(res.body.data.learner).toMatchObject({
      id: s.learner.user.id,
      profile: { programmingLanguage: "Python", skillLevel: "beginner", learningGoals: "Build APIs" },
    });
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  it("lets admins review unassigned submissions", async () => {
    const s = await setup();
    const sub = await s.submit(0);
    const rr = await s.review(s.admin.h, sub.id, { decision: "approved" }); console.log("DBG", JSON.stringify(rr.body)); expect(rr.status).toBe(201);
  });

  it("completes the enrollment once every task is approved", async () => {
    const s = await setup();
    await s.assign();
    for (let i = 0; i < 3; i++) {
      const sub = await s.submit(i);
      expect((await s.review(s.mentor.h, sub.id, { decision: "approved" })).status).toBe(201);
      const done = await Enrollment.findById(s.enrollment.id);
      expect(done?.status).toBe(i === 2 ? "completed" : "active");
    }
    const p = await s.progress();
    expect(p.summary).toMatchObject({ isComplete: true, percentComplete: 100, currentTaskId: null });
    expect((await Enrollment.findById(s.enrollment.id))?.completedAt).toBeTruthy();
  });
});
