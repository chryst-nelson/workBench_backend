import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { clearTestDb, closeTestDb, connectTestDb } from "./helpers/db.js";
import { PASSWORD, api, bearer, createUser, loginAs, refreshCookieOf } from "./helpers/auth.js";
import { AuditLog } from "../src/modules/audit/audit.model.js";
import { User } from "../src/modules/users/user.model.js";
import { authenticate } from "../src/middleware/authenticate.js";
import { authorize } from "../src/middleware/authorize.js";
import { errorHandler } from "../src/middleware/error-handler.js";
import { createLimiter } from "../src/middleware/rate-limit.js";

beforeAll(connectTestDb);
afterAll(closeTestDb);
beforeEach(clearTestDb);

async function tokenFor(role: "learner" | "mentor" | "admin") {
  const u = await createUser(role);
  const { token, cookie } = await loginAs(u.email);
  return { user: u, token, cookie };
}

describe("profile", () => {
  it("GET /users/me requires auth", async () => {
    expect((await api().get("/api/v1/users/me")).status).toBe(401);
  });

  it("updates profile and computes onboardingCompleted", async () => {
    const { token } = await tokenFor("learner");
    const res = await api()
      .patch("/api/v1/users/me")
      .set(bearer(token))
      .send({
        fullName: "New Name",
        programmingLanguage: "Python",
        skillLevel: "intermediate",
        learningGoals: "Become a backend engineer",
        weeklyAvailabilityHours: 10,
      });
    expect(res.status).toBe(200);
    expect(res.body.data.user.fullName).toBe("New Name");
    expect(res.body.data.user.profile.skillLevel).toBe("intermediate");
    expect(res.body.data.user.onboardingCompleted).toBe(true);

    const me = await api().get("/api/v1/users/me").set(bearer(token));
    expect(me.body.data.user.profile.weeklyAvailabilityHours).toBe(10);
  });

  it.each([
    ["role escalation", { role: "admin" }],
    ["status change", { status: "active" }],
    ["email change", { email: "x@example.com" }],
    ["invalid skill level", { skillLevel: "wizard" }],
    ["out-of-range hours", { weeklyAvailabilityHours: 500 }],
    ["bad track id", { preferredTrack: "123" }],
    ["empty body", {}],
  ])("rejects %s", async (_n, body) => {
    const { token, user } = await tokenFor("learner");
    const res = await api().patch("/api/v1/users/me").set(bearer(token)).send(body);
    expect(res.status).toBe(400);
    expect((await User.findById(user.id))!.role).toBe("learner");
  });
});

describe("change password", () => {
  it("rejects a wrong current password", async () => {
    const { token } = await tokenFor("learner");
    const res = await api()
      .patch("/api/v1/users/me/password")
      .set(bearer(token))
      .send({ currentPassword: "Wrong123", newPassword: "NewPassw0rd" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_CURRENT_PASSWORD");
  });

  it("changes the password, revokes other sessions, keeps this one alive", async () => {
    const u = await createUser();
    const other = await loginAs(u.email);
    const current = await loginAs(u.email);

    // jwt iat has 1s resolution; make sure the old token predates passwordChangedAt
    await new Promise((r) => setTimeout(r, 1100));
    const res = await api()
      .patch("/api/v1/users/me/password")
      .set(bearer(current.token))
      .send({ currentPassword: PASSWORD, newPassword: "NewPassw0rd" });
    expect(res.status).toBe(200);

    expect((await api().get("/api/v1/auth/me").set(bearer(current.token))).status).toBe(401);
    expect((await api().post("/api/v1/auth/refresh").set("Cookie", other.cookie!)).status).toBe(401);
    expect((await api().post("/api/v1/auth/refresh").set("Cookie", current.cookie!)).status).toBe(401);

    const newCookie = refreshCookieOf(res)!;
    expect((await api().get("/api/v1/auth/me").set(bearer(res.body.data.accessToken))).status).toBe(200);
    expect((await api().post("/api/v1/auth/refresh").set("Cookie", newCookie)).status).toBe(200);
    expect((await loginAs(u.email, "NewPassw0rd")).res.status).toBe(200);
  });
});

describe("RBAC: admin user management", () => {
  it("forbids learners and mentors from admin endpoints", async () => {
    const target = await createUser();
    for (const role of ["learner", "mentor"] as const) {
      const { token } = await tokenFor(role);
      expect((await api().get("/api/v1/users").set(bearer(token))).status).toBe(403);
      expect(
        (await api().patch(`/api/v1/users/${target.id}/role`).set(bearer(token)).send({ role: "admin" })).status
      ).toBe(403);
      expect(
        (await api().patch(`/api/v1/users/${target.id}/status`).set(bearer(token)).send({ status: "disabled" })).status
      ).toBe(403);
    }
    expect((await User.findById(target.id))!.role).toBe("learner");
  });

  it("rejects unauthenticated access", async () => {
    expect((await api().get("/api/v1/users")).status).toBe(401);
  });

  it("lists users with pagination and filters", async () => {
    const { token } = await tokenFor("admin");
    for (let i = 0; i < 4; i++) await createUser("learner");
    await createUser("mentor", { fullName: "Grace Hopper" });

    const page = await api().get("/api/v1/users?limit=2&page=2").set(bearer(token));
    expect(page.status).toBe(200);
    expect(page.body.data).toHaveLength(2);
    expect(page.body.meta).toMatchObject({ page: 2, limit: 2, total: 6, totalPages: 3 });
    expect(JSON.stringify(page.body)).not.toMatch(/passwordHash/);

    const mentors = await api().get("/api/v1/users?role=mentor").set(bearer(token));
    expect(mentors.body.data).toHaveLength(1);
    const search = await api().get("/api/v1/users?q=hopper").set(bearer(token));
    expect(search.body.data[0].fullName).toBe("Grace Hopper");

    expect((await api().get("/api/v1/users?limit=1000").set(bearer(token))).status).toBe(400);
    // Operator-style query keys are not interpreted as Mongo operators: filter is simply ignored.
    const inj = await api().get("/api/v1/users?role[$ne]=admin&limit=100").set(bearer(token));
    expect(inj.status).toBe(200);
    expect(inj.body.data).toHaveLength(6);
    expect((await api().get("/api/v1/users?role=superuser").set(bearer(token))).status).toBe(400);
  });

  it("changes role (audited) and the new role takes effect immediately", async () => {
    const admin = await tokenFor("admin");
    const learner = await tokenFor("learner");

    expect((await api().get("/api/v1/users").set(bearer(learner.token))).status).toBe(403);
    const res = await api()
      .patch(`/api/v1/users/${learner.user.id}/role`)
      .set(bearer(admin.token))
      .send({ role: "admin" });
    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe("admin");
    // same (old) token, role read fresh from DB
    expect((await api().get("/api/v1/users").set(bearer(learner.token))).status).toBe(200);

    const log = await AuditLog.findOne({ action: "user.role_changed" });
    expect(log).toMatchObject({ targetType: "User" });
    expect(String(log!.actor)).toBe(admin.user.id);
    expect(log!.metadata).toEqual({ from: "learner", to: "admin" });
  });

  it("suspends a user: revokes sessions, blocks login, audited, reversible", async () => {
    const admin = await tokenFor("admin");
    const learner = await tokenFor("learner");

    const res = await api()
      .patch(`/api/v1/users/${learner.user.id}/status`)
      .set(bearer(admin.token))
      .send({ status: "suspended" });
    expect(res.status).toBe(200);

    expect((await api().get("/api/v1/auth/me").set(bearer(learner.token))).status).toBe(403);
    expect((await api().post("/api/v1/auth/refresh").set("Cookie", learner.cookie!)).status).toBe(401);
    expect((await loginAs(learner.user.email)).res.status).toBe(403);
    expect(await AuditLog.countDocuments({ action: "user.status_changed" })).toBe(1);

    await api().patch(`/api/v1/users/${learner.user.id}/status`).set(bearer(admin.token)).send({ status: "active" }).expect(200);
    expect((await loginAs(learner.user.email)).res.status).toBe(200);
  });

  it("prevents admins from changing their own role/status", async () => {
    const admin = await tokenFor("admin");
    const a = await api().patch(`/api/v1/users/${admin.user.id}/role`).set(bearer(admin.token)).send({ role: "learner" });
    const b = await api().patch(`/api/v1/users/${admin.user.id}/status`).set(bearer(admin.token)).send({ status: "disabled" });
    expect(a.status).toBe(403);
    expect(b.status).toBe(403);
  });

  it("validates ids, bodies, and missing users", async () => {
    const admin = await tokenFor("admin");
    expect((await api().patch("/api/v1/users/not-an-id/role").set(bearer(admin.token)).send({ role: "mentor" })).status).toBe(400);
    expect((await api().patch(`/api/v1/users/${admin.user.id.replace(/./g, "a")}/role`).set(bearer(admin.token)).send({ role: "mentor" })).status).toBe(404);
    const target = await createUser();
    expect((await api().patch(`/api/v1/users/${target.id}/role`).set(bearer(admin.token)).send({ role: "superuser" })).status).toBe(400);
    expect((await api().patch(`/api/v1/users/${target.id}/status`).set(bearer(admin.token)).send({ status: "active", role: "admin" })).status).toBe(400);
  });
});

describe("authorize middleware", () => {
  it("allows only listed roles", async () => {
    const app = express();
    app.get("/mentor-only", authenticate, authorize("mentor", "admin"), (_q, r) => void r.json({ ok: true }));
    app.use(errorHandler);

    const learner = await tokenFor("learner");
    const mentor = await tokenFor("mentor");
    expect((await request(app).get("/mentor-only").set(bearer(learner.token))).status).toBe(403);
    expect((await request(app).get("/mentor-only").set(bearer(mentor.token))).status).toBe(200);
  });
});

describe("rate limiting", () => {
  it("returns 429 in the standard envelope once the limit is exceeded", async () => {
    const app = express();
    app.use(createLimiter({ windowMs: 60_000, limit: 2, skip: () => false }));
    app.get("/x", (_q, r) => void r.json({ ok: true }));

    await request(app).get("/x").expect(200);
    await request(app).get("/x").expect(200);
    const res = await request(app).get("/x");
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
  });
});
