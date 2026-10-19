import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { applyCorsMiddleware } from "../middleware.config";

describe("regression: cors preflight admits the API's mutating methods", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAllowedOrigins = process.env.ALLOWED_ORIGINS;

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalAllowedOrigins === undefined) delete process.env.ALLOWED_ORIGINS;
    else process.env.ALLOWED_ORIGINS = originalAllowedOrigins;
  });

  it("allows PATCH and DELETE preflights from a configured production origin", async () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOWED_ORIGINS = "https://app.vidra.example";

    const app = express();
    applyCorsMiddleware(app);
    app.patch("/api/projects/p1", (_req, res) => {
      res.status(200).json({ ok: true });
    });

    for (const method of ["PATCH", "DELETE"]) {
      const response = await request(app)
        .options("/api/projects/p1")
        .set("Origin", "https://app.vidra.example")
        .set("Access-Control-Request-Method", method);

      expect(response.status).toBe(204);
      expect(response.headers["access-control-allow-methods"]).toContain(method);
    }
  });

  it("still refuses a preflight from an unconfigured origin", async () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOWED_ORIGINS = "https://app.vidra.example";

    const app = express();
    applyCorsMiddleware(app);

    const response = await request(app)
      .options("/api/projects/p1")
      .set("Origin", "https://evil.example")
      .set("Access-Control-Request-Method", "PATCH");

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
