import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTestDb, closeTestDb, connectTestDb } from "./helpers/db.js";
import { api, bearer, createUser, loginAs } from "./helpers/auth.js";
import { Enrollment } from "../src/modules/enrollments/enrollment.model.js";
import { Submission } from "../src/modules/submissions/submission.model.js";

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
const approve = (id: string) => Submission.updateOne({ _id: id }, { status: "approved" });
const requestRevision = (id: string) => Submission.updateOne({ _id: id }, { status: "revision_requested" });

async function setup() {
  const admin = await as("admin");
  const learner = await as("learner");
  const content = await publishedTrack(admin.h);
  const enrollment = (await api().post("/api/v1/enrollments").set(learner.h).send({ trackId: content.trackId })).body.data.enrollment;
  return { admin, learner, ...content, enrollment };
}

describe("enrollment", () => {
  it("lets learners enroll in published tracks only", async () => {
    const admin = await as("admin");
    const learner = await as("learner");
    const { trackId } = await publishedTrack(admin.h);

    const res = await api().post("/api/v1/enrollments").set(learner.h).send({ trackId });
    expect(res.status).toBe(201);
    expect(res.body.data.enrollment).toMatchObject({ track: trackId, status: "active", learner: learner.user.id });

    const draft = (await api().post("/api/v1/tracks").set(admin.h).send({
      title: "Draft track", description: "d", programmingLanguage: "Go", skillLevel: "beginner", estimatedDurationWeeks: 2,
    })).body.data.track;
    expect((await api().post("/api/v1/enrollments").set(learner.h).send({ trackId: draft.id })).status).toBe(404);
    expect((await api().post("/api/v1/enrollments").set(learner.h).send({ trackId: "a".repeat(24) })).status).toBe(404);
    expect((await api().post("/api/v1/enrollments").set(learner.h).send({ trackId: "nope" })).status).toBe(400);
    expect((await api().post("/api/v1/enrollments").set(learner.h).send({ trackId, learner: "x" })).status).toBe(400);
  });

  it("is learner-only and unauthenticated access is rejected", async () => {
    const admin = await as("admin");
    const { trackId } = await publishedTrack(admin.h);
    expect((await api().post("/api/v1/enrollments").send({ trackId })).status).toBe(401);
    for (const who of [admin, await as("mentor")]) {
      expect((await api().post("/api/v1/enrollments").set(who.h).send({ trackId })).status).toBe(403);
    }
  });

  it("rejects duplicates, including concurrent ones", async () => {
    const admin = await as("admin");
    const learner = await as("learner");
    const { trackId } = await publishedTrack(admin.h);

    const results = await Promise.all(
      [1, 2, 3].map(() => api().post("/api/v1/enrollments").set(learner.h).send({ trackId }))
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409).every((r) => r.body.error.code === "ALREADY_ENROLLED")).toBe(true);
    expect(await Enrollment.countDocuments({ learner: learner.user.id })).toBe(1);
  });

  it("lists only my enrollments, with track details and pagination", async () => {
    const admin = await as("admin");
    const a = await as("learner");
    const b = await as("learner");
    const t1 = await publishedTrack(admin.h, { title: "Track one" });
    const t2 = await publishedTrack(admin.h, { title: "Track two" });
    for (const t of [t1, t2]) await api().post("/api/v1/enrollments").set(a.h).send({ trackId: t.trackId }).expect(201);
    await api().post("/api/v1/enrollments").set(b.h).send({ trackId: t1.trackId }).expect(201);

    const res = await api().get("/api/v1/enrollments/me?limit=1").set(a.h);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toMatchObject({ total: 2, totalPages: 2 });
    expect(res.body.data[0].trackDetails.title).toBe("Track two");
    expect((await api().get("/api/v1/enrollments/me").set(b.h)).body.data).toHaveLength(1);
    expect((await api().get("/api/v1/enrollments/me").set(admin.h)).status).toBe(403);
  });
});

describe("task progression", () => {
  it("unlocks only the first task and one more per approval, across modules", async () => {
    const { learner, enrollment, tasks } = await setup();
    const progress = async () => (await api().get(`/api/v1/enrollments/${enrollment.id}/progress`).set(learner.h)).body.data;

    let p = await progress();
    expect(p.tasks.map((t: { state: string }) => t.state)).toEqual(["current", "locked", "locked"]);
    expect(p.summary).toMatchObject({ totalTasks: 3, completedTasks: 0, percentComplete: 0, isComplete: false, currentTaskId: tasks[0] });

    const sub = (await api().post("/api/v1/submissions").set(learner.h).send(github(tasks[0]))).body.data.submission;
    p = await progress();
    expect(p.tasks[0]).toMatchObject({ state: "current", latestSubmission: { id: sub.id, attempt: 1, status: "pending_review" } });
    expect(p.tasks[1].state).toBe("locked"); // pending is not enough

    await approve(sub.id);
    p = await progress();
    expect(p.tasks.map((t: { state: string }) => t.state)).toEqual(["completed", "current", "locked"]);
    expect(p.summary).toMatchObject({ completedTasks: 1, percentComplete: 33, currentTaskId: tasks[1] });

    const sub2 = (await api().post("/api/v1/submissions").set(learner.h).send(github(tasks[1]))).body.data.submission;
    await approve(sub2.id);
    p = await progress();
    expect(p.tasks.map((t: { state: string }) => t.state)).toEqual(["completed", "completed", "current"]); // module 2 unlocked

    const sub3 = (await api().post("/api/v1/submissions").set(learner.h).send(github(tasks[2]))).body.data.submission;
    await approve(sub3.id);
    p = await progress();
    expect(p.summary).toMatchObject({ completedTasks: 3, percentComplete: 100, isComplete: true, currentTaskId: null });
  });

  it("restricts progress to the owner (and admins)", async () => {
    const { admin, enrollment } = await setup();
    const other = await as("learner");
    const mentor = await as("mentor");
    expect((await api().get(`/api/v1/enrollments/${enrollment.id}/progress`).set(other.h)).status).toBe(404);
    expect((await api().get(`/api/v1/enrollments/${enrollment.id}/progress`).set(mentor.h)).status).toBe(403);
    expect((await api().get(`/api/v1/enrollments/${enrollment.id}/progress`).set(admin.h)).status).toBe(200);
    expect((await api().get(`/api/v1/enrollments/${enrollment.id}/progress`)).status).toBe(401);
    expect((await api().get("/api/v1/enrollments/bad/progress").set(admin.h)).status).toBe(400);
    expect((await api().get(`/api/v1/enrollments/${"a".repeat(24)}/progress`).set(admin.h)).status).toBe(404);
  });

  it("gives learners task content only when enrolled and unlocked", async () => {
    const { admin, learner, tasks } = await setup();
    const stranger = await as("learner"); // not enrolled

    const notEnrolled = await api().get(`/api/v1/tasks/${tasks[0]}`).set(stranger.h);
    expect(notEnrolled.status).toBe(403);
    expect(notEnrolled.body.error.code).toBe("NOT_ENROLLED");

    const open = await api().get(`/api/v1/tasks/${tasks[0]}`).set(learner.h);
    expect(open.status).toBe(200);
    expect(open.body.data.task.problemDescription).toBe("Problem for Task A");

    const locked = await api().get(`/api/v1/tasks/${tasks[1]}`).set(learner.h);
    expect(locked.status).toBe(403);
    expect(locked.body.error.code).toBe("TASK_LOCKED");
    expect(JSON.stringify(locked.body)).not.toMatch(/Problem for/);
    expect((await api().get(`/api/v1/tasks/${tasks[2]}`).set(learner.h)).status).toBe(403); // can't skip ahead

    const sub = (await api().post("/api/v1/submissions").set(learner.h).send(github(tasks[0]))).body.data.submission;
    await approve(sub.id);
    expect((await api().get(`/api/v1/tasks/${tasks[1]}`).set(learner.h)).status).toBe(200);
    expect((await api().get(`/api/v1/tasks/${tasks[0]}`).set(learner.h)).status).toBe(200); // completed stays readable

    expect((await api().get(`/api/v1/tasks/${tasks[0]}`).set(admin.h)).status).toBe(200);
  });

  it("never exposes draft tasks to learners", async () => {
    const { admin, learner, tasks } = await setup();
    // add a draft task: never visible, never part of the sequence
    const { Task } = await import("../src/modules/tasks/task.model.js");
    const draft = await Task.create({
      ...taskBody("Draft task"), track: (await Task.findById(tasks[0]))!.track,
      module: (await Task.findById(tasks[0]))!.module, order: 50, status: "draft",
    });
    expect((await api().get(`/api/v1/tasks/${draft.id}`).set(learner.h)).status).toBe(404);
    expect((await api().post("/api/v1/submissions").set(learner.h).send(github(draft.id))).status).toBe(404);
    void admin;
  });
});

describe("submissions", () => {
  it("creates a pending submission for the current task", async () => {
    const { learner, tasks, enrollment } = await setup();
    const res = await api().post("/api/v1/submissions").set(learner.h).send({ ...github(tasks[0]), notes: "Used commander.js" });
    expect(res.status).toBe(201);
    expect(res.body.data.submission).toMatchObject({
      task: tasks[0], enrollment: enrollment.id, attempt: 1, status: "pending_review",
      type: "github", url: "https://github.com/ada/todo-cli", notes: "Used commander.js", previousSubmission: null,
    });
  });

  it("requires enrollment and unlocked task, and learner role", async () => {
    const { admin, learner, tasks } = await setup();
    const stranger = await as("learner");
    const mentor = await as("mentor");

    const a = await api().post("/api/v1/submissions").set(stranger.h).send(github(tasks[0]));
    expect([a.status, a.body.error.code]).toEqual([403, "NOT_ENROLLED"]);
    const b = await api().post("/api/v1/submissions").set(learner.h).send(github(tasks[1]));
    expect([b.status, b.body.error.code]).toEqual([403, "TASK_LOCKED"]);
    expect((await api().post("/api/v1/submissions").send(github(tasks[0]))).status).toBe(401);
    expect((await api().post("/api/v1/submissions").set(mentor.h).send(github(tasks[0]))).status).toBe(403);
    expect((await api().post("/api/v1/submissions").set(admin.h).send(github(tasks[0]))).status).toBe(403);
    expect(await Submission.countDocuments()).toBe(0);
  });

  it("validates submission content", async () => {
    const { learner, tasks } = await setup();
    const post = (b: object) => api().post("/api/v1/submissions").set(learner.h).send(b);
    for (const bad of [
      { taskId: tasks[0], type: "github", url: "https://gitlab.com/ada/repo" },
      { taskId: tasks[0], type: "github", url: "https://github.com/ada" },
      { taskId: tasks[0], type: "github", url: "http://github.com/ada/repo" },
      { taskId: tasks[0], type: "github", url: "https://user:pw@github.com/ada/repo" },
      { taskId: tasks[0], type: "github", url: "javascript:alert(1)" },
      { taskId: tasks[0], type: "github" },
      { taskId: tasks[0], type: "written", explanation: "too short" },
      { taskId: tasks[0], type: "github", url: "https://github.com/ada/repo", explanation: "x".repeat(60) },
      { taskId: tasks[0], type: "ftp", url: "https://github.com/ada/repo" },
      { taskId: tasks[0], type: "github", url: "https://github.com/ada/repo", status: "approved" },
      { type: "github", url: "https://github.com/ada/repo" },
      { taskId: "bad", type: "github", url: "https://github.com/ada/repo" },
    ]) {
      expect((await post(bad)).status, JSON.stringify(bad)).toBe(400);
    }
    expect(await Submission.countDocuments()).toBe(0);
  });

  it("enforces the task's allowed submission types", async () => {
    const { learner, tasks } = await setup(); // tasks allow github + written
    const res = await api().post("/api/v1/submissions").set(learner.h).send({ taskId: tasks[0], type: "deployed_url", url: "https://app.example.com" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("SUBMISSION_TYPE_NOT_ALLOWED");

    const written = await api().post("/api/v1/submissions").set(learner.h).send({
      taskId: tasks[0], type: "written", explanation: "I built it in three steps and this is how it works in detail.",
    });
    expect(written.status).toBe(201);
    expect(written.body.data.submission).toMatchObject({ type: "written", url: null });
  });

  it("allows one open submission per task, even under concurrency", async () => {
    const { learner, tasks } = await setup();
    const results = await Promise.all([1, 2, 3].map(() => api().post("/api/v1/submissions").set(learner.h).send(github(tasks[0]))));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status !== 201).every((r) => r.status === 409)).toBe(true);

    const again = await api().post("/api/v1/submissions").set(learner.h).send(github(tasks[0]));
    expect(again.body.error.code).toBe("SUBMISSION_EXISTS");
  });

  it("blocks new submissions on an already approved task", async () => {
    const { learner, tasks } = await setup();
    const sub = (await api().post("/api/v1/submissions").set(learner.h).send(github(tasks[0]))).body.data.submission;
    await approve(sub.id);
    const res = await api().post("/api/v1/submissions").set(learner.h).send(github(tasks[0]));
    expect([res.status, res.body.error.code]).toEqual([409, "TASK_ALREADY_COMPLETED"]);
  });
});

describe("resubmission", () => {
  it("creates a new attempt only after a revision is requested, and keeps history", async () => {
    const { learner, tasks } = await setup();
    const first = (await api().post("/api/v1/submissions").set(learner.h).send(github(tasks[0]))).body.data.submission;
    const redo = (id: string, body: object = { type: "github", url: "https://github.com/ada/todo-v2" }) =>
      api().post(`/api/v1/submissions/${id}/resubmit`).set(learner.h).send(body);

    const early = await redo(first.id);
    expect([early.status, early.body.error.code]).toEqual([409, "NOT_RESUBMITTABLE"]); // still pending

    await requestRevision(first.id);
    const second = await redo(first.id);
    expect(second.status).toBe(201);
    expect(second.body.data.submission).toMatchObject({
      attempt: 2, previousSubmission: first.id, status: "pending_review", url: "https://github.com/ada/todo-v2",
    });

    const detail = await api().get(`/api/v1/submissions/${second.body.data.submission.id}`).set(learner.h);
    expect(detail.body.data.history.map((h: { attempt: number; status: string }) => [h.attempt, h.status])).toEqual([
      [1, "revision_requested"], [2, "pending_review"],
    ]);

    // the old attempt can't be used to branch history again
    const stale = await redo(first.id);
    expect([stale.status, stale.body.error.code]).toEqual([409, "NOT_RESUBMITTABLE"]);

    // second round
    await requestRevision(second.body.data.submission.id);
    expect((await redo(second.body.data.submission.id, { type: "written", explanation: "Here is a full written explanation of my changes and design." })).body.data.submission.attempt).toBe(3);
  });

  it("allows only one concurrent resubmission", async () => {
    const { learner, tasks } = await setup();
    const first = (await api().post("/api/v1/submissions").set(learner.h).send(github(tasks[0]))).body.data.submission;
    await requestRevision(first.id);
    const results = await Promise.all([1, 2, 3].map(() =>
      api().post(`/api/v1/submissions/${first.id}/resubmit`).set(learner.h).send({ type: "github", url: "https://github.com/ada/v2" })
    ));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await Submission.countDocuments({ task: tasks[0] })).toBe(2);
  });

  it("rejects resubmitting approved work, other people's work, and bad content", async () => {
    const { learner, tasks } = await setup();
    const other = await as("learner");
    const first = (await api().post("/api/v1/submissions").set(learner.h).send(github(tasks[0]))).body.data.submission;
    const url = `/api/v1/submissions/${first.id}/resubmit`;
    const body = { type: "github", url: "https://github.com/ada/v2" };

    await approve(first.id);
    expect((await api().post(url).set(learner.h).send(body)).body.error.code).toBe("NOT_RESUBMITTABLE");

    await requestRevision(first.id);
    expect((await api().post(url).set(other.h).send(body)).status).toBe(404);
    expect((await api().post(url).send(body)).status).toBe(401);
    expect((await api().post(url).set(learner.h).send({ type: "github", url: "https://evil.com/x/y" })).status).toBe(400);
    expect((await api().post(url).set(learner.h).send({ ...body, taskId: tasks[1] })).status).toBe(400);
    expect((await api().post(url).set(learner.h).send({ type: "deployed_url", url: "https://app.example.com" })).body.error.code).toBe("SUBMISSION_TYPE_NOT_ALLOWED");
    expect((await api().post(`/api/v1/submissions/${"a".repeat(24)}/resubmit`).set(learner.h).send(body)).status).toBe(404);
  });
});

describe("reading submissions", () => {
  it("shows learners only their own, with filters and pagination", async () => {
    const { learner, tasks, admin } = await setup();
    const other = await as("learner");
    const mine = (await api().post("/api/v1/submissions").set(learner.h).send(github(tasks[0]))).body.data.submission;

    expect((await api().get(`/api/v1/submissions/${mine.id}`).set(learner.h)).status).toBe(200);
    expect((await api().get(`/api/v1/submissions/${mine.id}`).set(other.h)).status).toBe(404);
    expect((await api().get(`/api/v1/submissions/${mine.id}`).set(admin.h)).status).toBe(200);
    expect((await api().get(`/api/v1/submissions/${mine.id}`)).status).toBe(401);
    expect((await api().get("/api/v1/submissions/me").set(other.h)).body.data).toHaveLength(0);

    const list = await api().get(`/api/v1/submissions/me?taskId=${tasks[0]}&status=pending_review`).set(learner.h);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.meta.total).toBe(1);
    expect((await api().get("/api/v1/submissions/me?status=approved").set(learner.h)).body.data).toHaveLength(0);
    expect((await api().get("/api/v1/submissions/me?status=bogus").set(learner.h)).status).toBe(400);
  });
});

describe("content protection once learners are active", () => {
  it("blocks delete / unpublish / reorder of in-use content but allows edits and additions", async () => {
    const { admin, learner, trackId, modules, tasks } = await setup();
    const sub = (await api().post("/api/v1/submissions").set(learner.h).send(github(tasks[0]))).body.data.submission;
    const code = (r: { status: number; body: { error?: { code: string } } }) => [r.status, r.body.error?.code];

    // track has enrollments
    expect(code(await api().delete(`/api/v1/tracks/${trackId}`).set(admin.h))).toEqual([409, "CONTENT_IN_USE"]);
    expect(code(await api().patch(`/api/v1/tracks/${trackId}`).set(admin.h).send({ status: "draft" }))).toEqual([409, "CONTENT_IN_USE"]);
    expect(code(await api().put(`/api/v1/tracks/${trackId}/modules/order`).set(admin.h).send({ ids: [modules[1], modules[0]] }))).toEqual([409, "CONTENT_IN_USE"]);

    // module + task with submissions
    expect(code(await api().delete(`/api/v1/modules/${modules[0]}`).set(admin.h))).toEqual([409, "CONTENT_IN_USE"]);
    expect(code(await api().put(`/api/v1/modules/${modules[0]}/tasks/order`).set(admin.h).send({ ids: [tasks[1], tasks[0]] }))).toEqual([409, "CONTENT_IN_USE"]);
    expect(code(await api().delete(`/api/v1/tasks/${tasks[0]}`).set(admin.h))).toEqual([409, "CONTENT_IN_USE"]);
    expect(code(await api().patch(`/api/v1/tasks/${tasks[0]}`).set(admin.h).send({ status: "draft" }))).toEqual([409, "CONTENT_IN_USE"]);

    // tasks nobody has submitted to can still be removed (module keeps another published task)
    expect((await api().delete(`/api/v1/tasks/${tasks[1]}`).set(admin.h)).status).toBe(204);

    // edits and additions are fine
    expect((await api().patch(`/api/v1/tasks/${tasks[0]}`).set(admin.h).send({ instructions: "Updated instructions." })).status).toBe(200);
    expect((await api().post(`/api/v1/modules/${modules[0]}/tasks`).set(admin.h).send(taskBody("Task D"))).status).toBe(201);
    expect(await Submission.countDocuments({ _id: sub.id })).toBe(1);
  });
});
