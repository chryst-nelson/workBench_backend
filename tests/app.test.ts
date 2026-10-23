import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../src/app.js";

describe("health", () => {
  it("GET /api/v1/health returns ok in the standard envelope", async () => {
    const res = await request(app).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({ status: "ok" });
    expect(typeof res.body.data.uptime).toBe("number");
  });

  it("GET /health works for container probes", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
  });

  it("GET /api/v1/health/ready returns 503 when the database is not connected", async () => {
    const res = await request(app).get("/api/v1/health/ready");
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("SERVICE_UNAVAILABLE");
  });
});

describe("error handling", () => {
  it("returns a 404 envelope for unknown routes", async () => {
    const res = await request(app).get("/nope");
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, error: { code: "NOT_FOUND" } });
  });

  it("returns 400 for malformed JSON", async () => {
    const res = await request(app)
      .post("/api/v1/health")
      .set("Content-Type", "application/json")
      .send('{"bad": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_JSON");
  });

  it("rejects disallowed CORS origins", async () => {
    const res = await request(app).get("/api/v1/health").set("Origin", "http://evil.example");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CORS_FORBIDDEN");
  });

  it("allows whitelisted CORS origins", async () => {
    const res = await request(app).get("/api/v1/health").set("Origin", "http://localhost:5173");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });

  it("sets security headers and hides x-powered-by", async () => {
    const res = await request(app).get("/api/v1/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});

describe("docs", () => {
  it("serves the OpenAPI document", async () => {
    const res = await request(app).get("/api/v1/docs.json");
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe("3.0.3");
    expect(res.body.paths).toHaveProperty("/health");
  });
});
