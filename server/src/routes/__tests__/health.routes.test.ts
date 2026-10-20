import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createHealthRoutes } from "../health.routes";

describe("GET /health", () => {
  it("returns 200 with healthy status", async () => {
    const app = express();
    app.use(createHealthRoutes());

    const result = await request(app).get("/health");

    expect(result.status).toBe(200);
    expect(result.body.status).toBe("healthy");
    expect(result.body.timestamp).toBeDefined();
    expect(result.body.uptime).toBeDefined();
  });
});
