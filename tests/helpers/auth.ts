import request from "supertest";
import type { Response } from "supertest";
import app from "../../src/app.js";
import { User, type Role } from "../../src/modules/users/user.model.js";
import { hashPassword } from "../../src/utils/password.js";

export const PASSWORD = "Passw0rd!";
export const api = () => request(app);

let counter = 0;
export const uniqueEmail = (prefix = "user") => `${prefix}${++counter}@example.com`;

export async function createUser(role: Role = "learner", overrides: Record<string, unknown> = {}) {
  return User.create({
    fullName: `Test ${role}`,
    email: uniqueEmail(role),
    passwordHash: await hashPassword(PASSWORD),
    role,
    ...overrides,
  });
}

export function refreshCookieOf(res: Response): string | undefined {
  const raw = res.headers["set-cookie"] as unknown as string[] | string | undefined;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const c = list.find((x) => x.startsWith("refreshToken="));
  if (!c) return undefined;
  const pair = c.split(";")[0]!;
  return pair === "refreshToken=" ? undefined : pair;
}

export async function loginAs(email: string, password = PASSWORD) {
  const res = await api().post("/api/v1/auth/login").send({ email, password });
  return {
    res,
    token: res.body.data?.accessToken as string,
    cookie: refreshCookieOf(res),
  };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
