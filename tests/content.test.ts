import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTestDb, closeTestDb, connectTestDb } from "./helpers/db.js";
import { api, bearer, createUser, loginAs } from "./helpers/auth.js";
import { AuditLog } from "../src/modules/audit/audit.model.js";
import { Module } from "../src/modules/modules/module.model.js";
import { Task } from "../src/modules/tasks/task.model.js";
import { Track } from "../src/modules/tracks/track.model.js";

beforeAll(connectTestDb);
afterAll(closeTestDb);
beforeEach(clearTestDb);

async function as(role: "learner" | "mentor" | "admin") {
  const u = await createUser(role);
  const { token } = await loginAs(u.email);
  return { user: u, h: bearer(token) };
}

const trackBody = (over: Record<string, unknown> = {}) => ({
  title: "JavaScript Foundations",
  description: "Build real things with JavaScript",
  programmingLanguage: "JavaScript",
  skillLevel: "beginner",
  estimatedDurationWeeks: 8,
  ...over,
});
const taskBody = (over: Record<string, unknown> = {}) => ({
  title: "Build a CLI todo app",
  problemDescription: "Create a command line todo manager.",
  learningObjectives: ["Use the filesystem", "Parse arguments"],
  requirements: ["Add, list and remove todos"],
  instructions: "Start from an empty repo and commit often.",
  expectedDeliverables: ["GitHub repository with README"],
  submissionGuidelines: "Share the repo link.",
  estimatedDifficulty: "easy",
  ...over,
});

/** Creates track -> module -> task as admin (all drafts). */
async function scaffold(h: Record<string, string>) {
  const track = (await api().post("/api/v1/tracks").set(h).send(trackBody())).body.data.track;
  const mod = (await api().post(`/api/v1/tracks/${track.id}/modules`).set(h).send({ title: "Getting started" })).body.data.module;
  const task = (await api().post(`/api/v1/modules/${mod.id}/tasks`).set(h).send(taskBody())).body.data.task;
  return { track, mod, task };
}
const publishAll = async (h: Record<string, string>, ids: { track: string; mod: string; task: string }) => {
  await api().patch(`/api/v1/tasks/${ids.task}`).set(h).send({ status: "published" }).expect(200);
  await api().patch(`/api/v1/modules/${ids.mod}`).set(h).send({ status: "published" }).expect(200);
  await api().patch(`/api/v1/tracks/${ids.track}`).set(h).send({ status: "published" }).expect(200);
};

describe("authorization", () => {
  it("requires authentication for all content endpoints", async () => {
    expect((await api().get("/api/v1/tracks")).status).toBe(401);
    expect((await api().get("/api/v1/tracks/" + "a".repeat(24) + "/modules")).status).toBe(401);
    expect((await api().get("/api/v1/tasks/" + "a".repeat(24))).status).toBe(401);
  });

  it("only admins can write content", async () => {
    const admin = await as("admin");
    const { track, mod, task } = await scaffold(admin.h);
    const fakeId = "a".repeat(24);

    for (const who of [await as("learner"), await as("mentor")]) {
      const h = who.h;
      const calls = [
        api().post("/api/v1/tracks").set(h).send(trackBody()),
        api().patch(`/api/v1/tracks/${track.id}`).set(h).send({ title: "Hacked title" }),
        api().delete(`/api/v1/tracks/${track.id}`).set(h),
        api().post(`/api/v1/tracks/${track.id}/modules`).set(h).send({ title: "Nope nope" }),
        api().put(`/api/v1/tracks/${track.id}/modules/order`).set(h).send({ ids: [mod.id] }),
        api().patch(`/api/v1/modules/${mod.id}`).set(h).send({ title: "Hacked title" }),
        api().delete(`/api/v1/modules/${mod.id}`).set(h),
        api().post(`/api/v1/modules/${mod.id}/tasks`).set(h).send(taskBody()),
        api().put(`/api/v1/modules/${mod.id}/tasks/order`).set(h).send({ ids: [task.id] }),
        api().patch(`/api/v1/tasks/${task.id}`).set(h).send({ title: "Hacked title" }),
        api().delete(`/api/v1/tasks/${task.id}`).set(h),
        api().delete(`/api/v1/tracks/${fakeId}`).set(h),
      ];
      for (const res of await Promise.all(calls)) expect(res.status).toBe(403);
    }
    expect(await Track.countDocuments()).toBe(1);
    expect((await Track.findById(track.id))!.title).toBe("JavaScript Foundations");
  });
});

describe("tracks", () => {
  it("creates draft tracks and validates input", async () => {
    const { h } = await as("admin");
    const res = await api().post("/api/v1/tracks").set(h).send(trackBody());
    expect(res.status).toBe(201);
    expect(res.body.data.track).toMatchObject({ status: "draft", skillLevel: "beginner", estimatedDurationWeeks: 8 });

    for (const bad of [
      trackBody({ status: "published" }),
      trackBody({ skillLevel: "wizard" }),
      trackBody({ estimatedDurationWeeks: 0 }),
      trackBody({ estimatedDurationWeeks: 1.5 }),
      trackBody({ title: "ab" }),
      { ...trackBody(), extra: 1 },
    ]) {
      expect((await api().post("/api/v1/tracks").set(h).send(bad)).status).toBe(400);
    }
  });

  it("hides drafts from learners and mentors but not from admins", async () => {
    const admin = await as("admin");
    const learner = await as("learner");
    const mentor = await as("mentor");
    const { track } = await scaffold(admin.h);

    for (const who of [learner, mentor]) {
      expect((await api().get(`/api/v1/tracks/${track.id}`).set(who.h)).status).toBe(404);
      expect((await api().get("/api/v1/tracks").set(who.h)).body.data).toHaveLength(0);
      expect((await api().get(`/api/v1/tracks/${track.id}/modules`).set(who.h)).status).toBe(404);
      // a learner asking for drafts via the admin-only filter still sees nothing
      expect((await api().get("/api/v1/tracks?status=draft").set(who.h)).body.data).toHaveLength(0);
    }
    expect((await api().get(`/api/v1/tracks/${track.id}`).set(admin.h)).status).toBe(200);
    expect((await api().get("/api/v1/tracks").set(admin.h)).body.data).toHaveLength(1);
    expect((await api().get("/api/v1/tracks?status=draft").set(admin.h)).body.data).toHaveLength(1);
    expect((await api().get("/api/v1/tracks?status=published").set(admin.h)).body.data).toHaveLength(0);
  });

  it("lists with pagination and filters", async () => {
    const admin = await as("admin");
    const learner = await as("learner");
    const ids: { track: string; mod: string; task: string }[] = [];
    for (const [title, language, level] of [
      ["Python Basics", "Python", "beginner"],
      ["Advanced Python", "Python", "advanced"],
      ["Node Intermediate", "JavaScript", "intermediate"],
    ]) {
      const track = (await api().post("/api/v1/tracks").set(admin.h).send(trackBody({ title, programmingLanguage: language, skillLevel: level }))).body.data.track;
      const mod = (await api().post(`/api/v1/tracks/${track.id}/modules`).set(admin.h).send({ title: "Module one" })).body.data.module;
      const task = (await api().post(`/api/v1/modules/${mod.id}/tasks`).set(admin.h).send(taskBody())).body.data.task;
      ids.push({ track: track.id, mod: mod.id, task: task.id });
    }
    for (const i of ids) await publishAll(admin.h, i);

    const page = await api().get("/api/v1/tracks?limit=2&page=2").set(learner.h);
    expect(page.body.data).toHaveLength(1);
    expect(page.body.meta).toMatchObject({ page: 2, limit: 2, total: 3, totalPages: 2 });
    expect((await api().get("/api/v1/tracks?language=python").set(learner.h)).body.data).toHaveLength(2);
    expect((await api().get("/api/v1/tracks?language=python&skillLevel=advanced").set(learner.h)).body.data).toHaveLength(1);
    expect((await api().get("/api/v1/tracks?q=node").set(learner.h)).body.data[0].title).toBe("Node Intermediate");
    expect((await api().get("/api/v1/tracks?limit=500").set(learner.h)).status).toBe(400);
  });

  it("updates tracks, rejects unknown fields and bad ids, 404s unknown tracks", async () => {
    const { h } = await as("admin");
    const track = (await api().post("/api/v1/tracks").set(h).send(trackBody())).body.data.track;
    const res = await api().patch(`/api/v1/tracks/${track.id}`).set(h).send({ title: "Renamed track", estimatedDurationWeeks: 12 });
    expect(res.status).toBe(200);
    expect(res.body.data.track).toMatchObject({ title: "Renamed track", estimatedDurationWeeks: 12 });

    expect((await api().patch(`/api/v1/tracks/${track.id}`).set(h).send({ createdBy: "x" })).status).toBe(400);
    expect((await api().patch(`/api/v1/tracks/${track.id}`).set(h).send({})).status).toBe(400);
    expect((await api().patch("/api/v1/tracks/not-an-id").set(h).send({ title: "Whatever" })).status).toBe(400);
    expect((await api().patch(`/api/v1/tracks/${"a".repeat(24)}`).set(h).send({ title: "Whatever" })).status).toBe(404);
  });
});

describe("publishing rules and visibility", () => {
  it("enforces bottom-up publishing", async () => {
    const { h } = await as("admin");
    const { track, mod, task } = await scaffold(h);

    const t1 = await api().patch(`/api/v1/tracks/${track.id}`).set(h).send({ status: "published" });
    expect(t1.status).toBe(409);
    expect(t1.body.error.code).toBe("PUBLISH_REQUIREMENTS_NOT_MET");
    expect((await api().patch(`/api/v1/modules/${mod.id}`).set(h).send({ status: "published" })).status).toBe(409);

    await api().patch(`/api/v1/tasks/${task.id}`).set(h).send({ status: "published" }).expect(200);
    await api().patch(`/api/v1/modules/${mod.id}`).set(h).send({ status: "published" }).expect(200);
    await api().patch(`/api/v1/tracks/${track.id}`).set(h).send({ status: "published" }).expect(200);
  });

  it("keeps published parents non-empty", async () => {
    const { h } = await as("admin");
    const ids = await scaffold(h);
    await publishAll(h, { track: ids.track.id, mod: ids.mod.id, task: ids.task.id });

    const a = await api().patch(`/api/v1/tasks/${ids.task.id}`).set(h).send({ status: "draft" });
    expect(a.status).toBe(409);
    expect(a.body.error.code).toBe("PARENT_WOULD_BE_EMPTY");
    expect((await api().delete(`/api/v1/tasks/${ids.task.id}`).set(h)).status).toBe(409);
    expect((await api().patch(`/api/v1/modules/${ids.mod.id}`).set(h).send({ status: "draft" })).status).toBe(409);
    expect((await api().delete(`/api/v1/modules/${ids.mod.id}`).set(h)).status).toBe(409);

    // top-down works
    await api().patch(`/api/v1/tracks/${ids.track.id}`).set(h).send({ status: "draft" }).expect(200);
    await api().patch(`/api/v1/modules/${ids.mod.id}`).set(h).send({ status: "draft" }).expect(200);
    await api().patch(`/api/v1/tasks/${ids.task.id}`).set(h).send({ status: "draft" }).expect(200);
  });

  it("learners see a syllabus of published items with task summaries only", async () => {
    const admin = await as("admin");
    const learner = await as("learner");
    const ids = await scaffold(admin.h);
    // second, draft task and draft module must stay invisible
    await api().post(`/api/v1/modules/${ids.mod.id}/tasks`).set(admin.h).send(taskBody({ title: "Draft task here" })).expect(201);
    await api().post(`/api/v1/tracks/${ids.track.id}/modules`).set(admin.h).send({ title: "Draft module" }).expect(201);
    await publishAll(admin.h, { track: ids.track.id, mod: ids.mod.id, task: ids.task.id });

    const res = await api().get(`/api/v1/tracks/${ids.track.id}/modules`).set(learner.h);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].tasks).toHaveLength(1);
    expect(res.body.data[0].tasks[0]).toMatchObject({ title: "Build a CLI todo app", estimatedDifficulty: "easy" });
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/problemDescription|instructions|expectedDeliverables|Draft task|Draft module/);

    const tasks = await api().get(`/api/v1/modules/${ids.mod.id}/tasks`).set(learner.h);
    expect(tasks.body.data).toHaveLength(1);
    expect(JSON.stringify(tasks.body)).not.toMatch(/problemDescription/);

    const adminView = await api().get(`/api/v1/tracks/${ids.track.id}/modules`).set(admin.h);
    expect(adminView.body.data).toHaveLength(2);
    expect(adminView.body.data[0].tasks).toHaveLength(2);
  });

  it("gives full task content to mentors (published only) and admins, never learners", async () => {
    const admin = await as("admin");
    const mentor = await as("mentor");
    const learner = await as("learner");
    const ids = await scaffold(admin.h);

    expect((await api().get(`/api/v1/tasks/${ids.task.id}`).set(mentor.h)).status).toBe(404); // draft
    expect((await api().get(`/api/v1/tasks/${ids.task.id}`).set(admin.h)).status).toBe(200);

    await publishAll(admin.h, { track: ids.track.id, mod: ids.mod.id, task: ids.task.id });
    const m = await api().get(`/api/v1/tasks/${ids.task.id}`).set(mentor.h);
    expect(m.status).toBe(200);
    expect(m.body.data.task).toMatchObject({
      problemDescription: "Create a command line todo manager.",
      allowedSubmissionTypes: ["github"],
      learningObjectives: ["Use the filesystem", "Parse arguments"],
    });
    expect((await api().get(`/api/v1/tasks/${ids.task.id}`).set(learner.h)).status).toBe(403);
  });

  it("hides published children of unpublished parents", async () => {
    const admin = await as("admin");
    const mentor = await as("mentor");
    const learner = await as("learner");
    const ids = await scaffold(admin.h);
    await publishAll(admin.h, { track: ids.track.id, mod: ids.mod.id, task: ids.task.id });
    await api().patch(`/api/v1/tracks/${ids.track.id}`).set(admin.h).send({ status: "draft" }).expect(200);

    expect((await api().get(`/api/v1/modules/${ids.mod.id}`).set(learner.h)).status).toBe(404);
    expect((await api().get(`/api/v1/modules/${ids.mod.id}/tasks`).set(learner.h)).status).toBe(404);
    expect((await api().get(`/api/v1/tasks/${ids.task.id}`).set(mentor.h)).status).toBe(404);
  });
});

describe("modules and tasks", () => {
  it("validates task payloads", async () => {
    const { h } = await as("admin");
    const { mod } = await scaffold(h);
    const url = `/api/v1/modules/${mod.id}/tasks`;
    for (const bad of [
      taskBody({ learningObjectives: [] }),
      taskBody({ requirements: "not an array" }),
      taskBody({ estimatedDifficulty: "impossible" }),
      taskBody({ allowedSubmissionTypes: ["ftp"] }),
      taskBody({ allowedSubmissionTypes: ["github", "github"] }),
      taskBody({ status: "published" }),
      taskBody({ track: "a".repeat(24) }),
      { ...taskBody(), title: undefined },
    ]) {
      expect((await api().post(url).set(h).send(bad)).status).toBe(400);
    }
    const ok = await api().post(url).set(h).send(taskBody({ allowedSubmissionTypes: ["github", "written"] }));
    expect(ok.status).toBe(201);
    expect(ok.body.data.task.allowedSubmissionTypes).toEqual(["github", "written"]);
  });

  it("returns 404 when creating under a missing parent", async () => {
    const { h } = await as("admin");
    expect((await api().post(`/api/v1/tracks/${"a".repeat(24)}/modules`).set(h).send({ title: "Orphan module" })).status).toBe(404);
    expect((await api().post(`/api/v1/modules/${"a".repeat(24)}/tasks`).set(h).send(taskBody())).status).toBe(404);
  });

  it("auto-assigns positions and rejects taken explicit ones", async () => {
    const { h } = await as("admin");
    const track = (await api().post("/api/v1/tracks").set(h).send(trackBody())).body.data.track;
    const url = `/api/v1/tracks/${track.id}/modules`;
    const orders: number[] = [];
    for (const t of ["First module", "Second module", "Third module"]) {
      orders.push((await api().post(url).set(h).send({ title: t })).body.data.module.order);
    }
    expect(orders).toEqual([1, 2, 3]);

    const dup = await api().post(url).set(h).send({ title: "Dup module", order: 2 });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("ORDER_CONFLICT");
    expect((await api().post(url).set(h).send({ title: "Far module", order: 10 })).body.data.module.order).toBe(10);
    expect((await api().post(url).set(h).send({ title: "Append module" })).body.data.module.order).toBe(11);
  });

  it("allocates distinct positions for concurrent creates", async () => {
    const { h } = await as("admin");
    const track = (await api().post("/api/v1/tracks").set(h).send(trackBody())).body.data.track;
    const results = await Promise.all(
      [1, 2, 3, 4, 5, 6, 7, 8].map((i) => api().post(`/api/v1/tracks/${track.id}/modules`).set(h).send({ title: `Parallel ${i}` }))
    );
    expect(results.map((r) => r.status)).toEqual(Array(8).fill(201));
    const orders = (await Module.find({ track: track.id })).map((m) => m.order).sort();
    expect(new Set(orders).size).toBe(8);
  });

  it("reorders modules and tasks, and rejects mismatching id lists", async () => {
    const { h } = await as("admin");
    const track = (await api().post("/api/v1/tracks").set(h).send(trackBody())).body.data.track;
    const mods = [];
    for (const t of ["Module A", "Module B", "Module C"]) {
      mods.push((await api().post(`/api/v1/tracks/${track.id}/modules`).set(h).send({ title: t })).body.data.module.id);
    }
    const [a, b, c] = mods;
    const res = await api().put(`/api/v1/tracks/${track.id}/modules/order`).set(h).send({ ids: [c, a, b] });
    expect(res.status).toBe(200);
    expect(res.body.data.map((m: { id: string; order: number }) => [m.id, m.order])).toEqual([[c, 1], [a, 2], [b, 3]]);

    for (const ids of [[a, b], [a, a, b], [a, b, c, "f".repeat(24)], [a, b, "f".repeat(24)]]) {
      const bad = await api().put(`/api/v1/tracks/${track.id}/modules/order`).set(h).send({ ids });
      expect(bad.status).toBe(400);
    }
    expect((await Module.find({ track: track.id }).sort({ order: 1 })).map((m) => m.id)).toEqual([c, a, b]);

    const t1 = (await api().post(`/api/v1/modules/${a}/tasks`).set(h).send(taskBody({ title: "Task one" }))).body.data.task.id;
    const t2 = (await api().post(`/api/v1/modules/${a}/tasks`).set(h).send(taskBody({ title: "Task two" }))).body.data.task.id;
    const r2 = await api().put(`/api/v1/modules/${a}/tasks/order`).set(h).send({ ids: [t2, t1] });
    expect(r2.body.data.map((t: { id: string }) => t.id)).toEqual([t2, t1]);
    expect(JSON.stringify(r2.body)).not.toMatch(/problemDescription/);
  });

  it("does not allow changing order or moving content through PATCH", async () => {
    const { h } = await as("admin");
    const { mod, task } = await scaffold(h);
    expect((await api().patch(`/api/v1/modules/${mod.id}`).set(h).send({ order: 5 })).status).toBe(400);
    expect((await api().patch(`/api/v1/tasks/${task.id}`).set(h).send({ order: 5 })).status).toBe(400);
    expect((await api().patch(`/api/v1/tasks/${task.id}`).set(h).send({ module: "a".repeat(24) })).status).toBe(400);
  });

  it("updates a task's content", async () => {
    const { h } = await as("admin");
    const { task } = await scaffold(h);
    const res = await api().patch(`/api/v1/tasks/${task.id}`).set(h).send({
      title: "Build a better CLI",
      requirements: ["Add", "List", "Remove"],
      estimatedDifficulty: "medium",
    });
    expect(res.status).toBe(200);
    expect(res.body.data.task).toMatchObject({ title: "Build a better CLI", requirements: ["Add", "List", "Remove"], estimatedDifficulty: "medium" });
  });
});

describe("deleting", () => {
  it("cascades from track to modules and tasks", async () => {
    const { h } = await as("admin");
    const { track } = await scaffold(h);
    await scaffold(h); // an unrelated second track must survive

    expect((await api().delete(`/api/v1/tracks/${track.id}`).set(h)).status).toBe(204);
    expect(await Track.countDocuments()).toBe(1);
    expect(await Module.countDocuments({ track: track.id })).toBe(0);
    expect(await Task.countDocuments({ track: track.id })).toBe(0);
    expect(await Module.countDocuments()).toBe(1);
    expect(await Task.countDocuments()).toBe(1);
    expect((await api().delete(`/api/v1/tracks/${track.id}`).set(h)).status).toBe(404);
  });

  it("cascades from module to tasks and removes tasks individually", async () => {
    const { h } = await as("admin");
    const { mod, task } = await scaffold(h);
    expect((await api().delete(`/api/v1/tasks/${task.id}`).set(h)).status).toBe(204);
    expect(await Task.countDocuments()).toBe(0);
    await api().post(`/api/v1/modules/${mod.id}/tasks`).set(h).send(taskBody()).expect(201);
    expect((await api().delete(`/api/v1/modules/${mod.id}`).set(h)).status).toBe(204);
    expect(await Task.countDocuments()).toBe(0);
    expect(await Module.countDocuments()).toBe(0);
  });
});

describe("preferredTrack (profile link)", () => {
  it("only accepts published tracks", async () => {
    const admin = await as("admin");
    const learner = await as("learner");
    const ids = await scaffold(admin.h);

    const draft = await api().patch("/api/v1/users/me").set(learner.h).send({ preferredTrack: ids.track.id });
    expect(draft.status).toBe(400);
    expect(draft.body.error.details[0].path).toBe("preferredTrack");
    expect((await api().patch("/api/v1/users/me").set(learner.h).send({ preferredTrack: "b".repeat(24) })).status).toBe(400);

    await publishAll(admin.h, { track: ids.track.id, mod: ids.mod.id, task: ids.task.id });
    const ok = await api().patch("/api/v1/users/me").set(learner.h).send({ preferredTrack: ids.track.id });
    expect(ok.status).toBe(200);
    expect(ok.body.data.user.profile.preferredTrack).toBe(ids.track.id);

    const reg = await api().post("/api/v1/auth/register").send({
      fullName: "New Learner",
      email: "new.learner@example.com",
      password: "Passw0rd!",
      preferredTrack: "c".repeat(24),
    });
    expect(reg.status).toBe(400);
  });
});

describe("audit trail", () => {
  it("records admin content actions with the acting admin", async () => {
    const admin = await as("admin");
    const ids = await scaffold(admin.h);
    await publishAll(admin.h, { track: ids.track.id, mod: ids.mod.id, task: ids.task.id });
    await api().patch(`/api/v1/tracks/${ids.track.id}`).set(admin.h).send({ title: "Edited title" }).expect(200);
    await api().patch(`/api/v1/tracks/${ids.track.id}`).set(admin.h).send({ status: "draft" }).expect(200);
    await api().delete(`/api/v1/tracks/${ids.track.id}`).set(admin.h).expect(204);

    const actions = (await AuditLog.find().sort({ createdAt: 1 })).map((l) => l.action);
    for (const a of [
      "track.created", "module.created", "task.created",
      "task.published", "module.published", "track.published",
      "track.updated", "track.unpublished", "track.deleted",
    ]) {
      expect(actions).toContain(a);
    }
    const log = await AuditLog.findOne({ action: "track.created" });
    expect(String(log!.actor)).toBe(admin.user.id);
  });
});
