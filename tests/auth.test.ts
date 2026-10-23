import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTestDb, closeTestDb, connectTestDb } from "./helpers/db.js";
import { PASSWORD, api, bearer, createUser, loginAs, refreshCookieOf, uniqueEmail } from "./helpers/auth.js";
import { MemoryEmailProvider, setEmailProvider } from "../src/services/email/email.provider.js";
import { User } from "../src/modules/users/user.model.js";
import { RefreshToken } from "../src/modules/auth/refresh-token.model.js";
import jwt from "jsonwebtoken";
import { env } from "../src/config/env.js";

const mailbox = new MemoryEmailProvider();

beforeAll(async () => {
  await connectTestDb();
  setEmailProvider(mailbox);
});
afterAll(closeTestDb);
beforeEach(async () => {
  await clearTestDb();
  mailbox.sent = [];
});

const valid = () => ({ fullName: "Ada Obi", email: uniqueEmail("ada"), password: PASSWORD });

describe("POST /auth/register", () => {
  it("creates a learner, returns tokens, and never leaks secrets", async () => {
    const body = { ...valid(), email: "  Ada.OBI@Example.COM ", programmingLanguage: "JavaScript", skillLevel: "beginner" };
    const res = await api().post("/api/v1/auth/register").send(body);

    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({
      email: "ada.obi@example.com",
      role: "learner",
      status: "active",
      onboardingCompleted: false,
    });
    expect(res.body.data.accessToken).toBeTruthy();
    expect(refreshCookieOf(res)).toBeTruthy();
    expect(res.headers["set-cookie"]![0]).toMatch(/HttpOnly/i);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|password"/);

    const stored = await User.findOne({ email: "ada.obi@example.com" }).select("+passwordHash");
    expect(stored!.passwordHash).not.toBe(PASSWORD);
    expect(stored!.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it("rejects client-supplied role/status", async () => {
    const res = await api().post("/api/v1/auth/register").send({ ...valid(), role: "admin" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects duplicate emails (case-insensitive)", async () => {
    const u = valid();
    await api().post("/api/v1/auth/register").send(u).expect(201);
    const res = await api().post("/api/v1/auth/register").send({ ...u, email: u.email.toUpperCase() });
    expect(res.status).toBe(409);
  });

  it.each([
    ["short", "Ab1"],
    ["no number", "Password"],
    ["no letter", "12345678"],
  ])("rejects weak password (%s)", async (_n, password) => {
    const res = await api().post("/api/v1/auth/register").send({ ...valid(), password });
    expect(res.status).toBe(400);
  });

  it("rejects invalid email and NoSQL-operator payloads", async () => {
    expect((await api().post("/api/v1/auth/register").send({ ...valid(), email: "nope" })).status).toBe(400);
    const res = await api().post("/api/v1/auth/login").send({ email: { $ne: "" }, password: { $ne: "" } });
    expect(res.status).toBe(400);
  });
});

describe("POST /auth/login", () => {
  it("logs in with normalized email", async () => {
    const u = await createUser();
    const { res } = await loginAs(u.email.toUpperCase());
    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(u.id);
    expect((await User.findById(u.id))!.lastLoginAt).toBeTruthy();
  });

  it("returns the same error for wrong password and unknown email", async () => {
    const u = await createUser();
    const a = await loginAs(u.email, "WrongPass1");
    const b = await loginAs("ghost@example.com");
    expect(a.res.status).toBe(401);
    expect(b.res.status).toBe(401);
    expect(a.res.body.error).toEqual(b.res.body.error);
  });

  it.each([
    ["suspended", "ACCOUNT_SUSPENDED"],
    ["disabled", "ACCOUNT_DISABLED"],
  ])("blocks %s accounts", async (status, code) => {
    const u = await createUser("learner", { status });
    const { res } = await loginAs(u.email);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(code);
  });
});

describe("authentication guard", () => {
  it("rejects missing, malformed, expired and wrongly signed tokens", async () => {
    const u = await createUser();
    const expired = jwt.sign({}, env.JWT_ACCESS_SECRET, { subject: u.id, expiresIn: -10 });
    const forged = jwt.sign({}, "x".repeat(40), { subject: u.id });
    const noneAlg = jwt.sign({ sub: u.id }, "", { algorithm: "none" } as jwt.SignOptions);

    for (const h of [{}, bearer("garbage"), bearer(expired), bearer(forged), bearer(noneAlg)]) {
      const res = await api().get("/api/v1/auth/me").set(h);
      expect(res.status).toBe(401);
    }
  });

  it("returns the current user", async () => {
    const u = await createUser();
    const { token } = await loginAs(u.email);
    const res = await api().get("/api/v1/auth/me").set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(u.email);
  });

  it("rejects tokens of users suspended after login", async () => {
    const u = await createUser();
    const { token } = await loginAs(u.email);
    await User.updateOne({ _id: u.id }, { status: "suspended" });
    const res = await api().get("/api/v1/auth/me").set(bearer(token));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ACCOUNT_SUSPENDED");
  });

  it("rejects tokens issued before a password change", async () => {
    const u = await createUser();
    const { token } = await loginAs(u.email);
    await User.updateOne({ _id: u.id }, { passwordChangedAt: new Date(Date.now() + 5000) });
    expect((await api().get("/api/v1/auth/me").set(bearer(token))).status).toBe(401);
  });
});

describe("refresh tokens", () => {
  it("rotates the token and rejects the old one", async () => {
    const u = await createUser();
    const { cookie } = await loginAs(u.email);

    const r1 = await api().post("/api/v1/auth/refresh").set("Cookie", cookie!);
    expect(r1.status).toBe(200);
    expect(r1.body.data.accessToken).toBeTruthy();
    const next = refreshCookieOf(r1)!;
    expect(next).not.toBe(cookie);

    const replay = await api().post("/api/v1/auth/refresh").set("Cookie", cookie!);
    expect(replay.status).toBe(401);
  });

  it("revokes the whole family when a rotated token is replayed", async () => {
    const u = await createUser();
    const { cookie } = await loginAs(u.email);
    const r1 = await api().post("/api/v1/auth/refresh").set("Cookie", cookie!);
    const newest = refreshCookieOf(r1)!;

    await api().post("/api/v1/auth/refresh").set("Cookie", cookie!).expect(401); // replay -> family revoked
    await api().post("/api/v1/auth/refresh").set("Cookie", newest).expect(401);
  });

  it("is single-use under concurrency", async () => {
    const u = await createUser();
    const { cookie } = await loginAs(u.email);
    const results = await Promise.all(
      [1, 2, 3].map(() => api().post("/api/v1/auth/refresh").set("Cookie", cookie!))
    );
    expect(results.filter((r) => r.status === 200).length).toBe(1);
  });

  it("rejects missing or unknown refresh tokens", async () => {
    expect((await api().post("/api/v1/auth/refresh")).status).toBe(401);
    expect((await api().post("/api/v1/auth/refresh").set("Cookie", "refreshToken=nope")).status).toBe(401);
  });

  it("refuses refresh for a suspended user", async () => {
    const u = await createUser();
    const { cookie } = await loginAs(u.email);
    await User.updateOne({ _id: u.id }, { status: "suspended" });
    expect((await api().post("/api/v1/auth/refresh").set("Cookie", cookie!)).status).toBe(401);
  });

  it("stores only hashes of refresh tokens", async () => {
    const u = await createUser();
    const { cookie } = await loginAs(u.email);
    const raw = cookie!.split("=")[1]!;
    expect(await RefreshToken.countDocuments({ tokenHash: raw })).toBe(0);
    expect(await RefreshToken.countDocuments({ user: u.id })).toBe(1);
  });
});

describe("POST /auth/logout", () => {
  it("revokes the refresh token and clears the cookie", async () => {
    const u = await createUser();
    const { cookie } = await loginAs(u.email);
    const res = await api().post("/api/v1/auth/logout").set("Cookie", cookie!);
    expect(res.status).toBe(204);
    expect((await api().post("/api/v1/auth/refresh").set("Cookie", cookie!)).status).toBe(401);
  });

  it("is idempotent without a cookie", async () => {
    expect((await api().post("/api/v1/auth/logout")).status).toBe(204);
  });
});

describe("password reset", () => {
  const tokenFromMail = () => /token=([a-f0-9]+)/.exec(mailbox.sent.at(-1)!.text)![1]!;

  it("answers identically for known and unknown emails", async () => {
    const u = await createUser();
    const a = await api().post("/api/v1/auth/forgot-password").send({ email: u.email });
    const b = await api().post("/api/v1/auth/forgot-password").send({ email: "ghost@example.com" });
    expect(a.status).toBe(202);
    expect(b.status).toBe(202);
    expect(a.body).toEqual(b.body);
    expect(mailbox.sent).toHaveLength(1);
  });

  it("resets the password once, revokes sessions, and stores only a token hash", async () => {
    const u = await createUser();
    const { cookie } = await loginAs(u.email);
    await api().post("/api/v1/auth/forgot-password").send({ email: u.email });
    const token = tokenFromMail();

    const stored = await User.findById(u.id).select("+passwordResetTokenHash");
    expect(stored!.passwordResetTokenHash).not.toBe(token);

    const res = await api().post("/api/v1/auth/reset-password").send({ token, newPassword: "NewPassw0rd" });
    expect(res.status).toBe(200);

    expect((await loginAs(u.email, PASSWORD)).res.status).toBe(401);
    expect((await loginAs(u.email, "NewPassw0rd")).res.status).toBe(200);
    expect((await api().post("/api/v1/auth/refresh").set("Cookie", cookie!)).status).toBe(401);

    const reuse = await api().post("/api/v1/auth/reset-password").send({ token, newPassword: "Another1Pass" });
    expect(reuse.status).toBe(400);
  });

  it("rejects expired and bogus tokens", async () => {
    const u = await createUser();
    await api().post("/api/v1/auth/forgot-password").send({ email: u.email });
    const token = tokenFromMail();
    await User.updateOne({ _id: u.id }, { passwordResetExpiresAt: new Date(Date.now() - 1000) });
    expect((await api().post("/api/v1/auth/reset-password").send({ token, newPassword: "NewPassw0rd" })).status).toBe(400);
    expect((await api().post("/api/v1/auth/reset-password").send({ token: "a".repeat(64), newPassword: "NewPassw0rd" })).status).toBe(400);
  });

  it("does not send reset emails to suspended accounts", async () => {
    const u = await createUser("learner", { status: "suspended" });
    await api().post("/api/v1/auth/forgot-password").send({ email: u.email });
    expect(mailbox.sent).toHaveLength(0);
  });
});
