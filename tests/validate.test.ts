import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { z } from "zod";
import { validate } from "../src/middleware/validate.js";
import { errorHandler } from "../src/middleware/error-handler.js";

const app = express();
app.use(express.json());
app.post(
  "/echo",
  validate({ body: z.object({ email: z.string().email().toLowerCase() }) }),
  (_req, res) => res.json(res.locals.validated)
);
app.get("/boom", () => {
  throw new Error("secret internal detail");
});
app.use(errorHandler);

describe("validate middleware", () => {
  it("returns parsed values", async () => {
    const res = await request(app).post("/echo").send({ email: "A@B.com" });
    expect(res.body.body.email).toBe("a@b.com");
  });

  it("returns a 400 envelope with details on invalid input", async () => {
    const res = await request(app).post("/echo").send({ email: "nope" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details[0].path).toBe("email");
  });
});

describe("errorHandler", () => {
  it("does not leak internal error messages", async () => {
    const res = await request(app).get("/boom");
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("secret internal detail");
  });
});
