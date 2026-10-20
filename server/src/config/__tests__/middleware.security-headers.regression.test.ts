import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { applySecurityMiddleware } from "../middleware.config";

/**
 * The API runs helmet's defaults with one exception: the client is served from
 * a different origin (Firebase Hosting) than this API (Cloud Run), and it loads
 * media this API serves — clip content and the storage proxy — straight into
 * <img> and <video>. Helmet's default Cross-Origin-Resource-Policy of
 * `same-origin` would block those loads, so resources stay `cross-origin`.
 */
describe("regression: security headers", () => {
  const fetchHeaders = async (): Promise<Record<string, string>> => {
    const app = express();
    applySecurityMiddleware(app);
    app.get("/media", (_req, res) => {
      res.status(200).send("bytes");
    });
    return (await request(app).get("/media")).headers as Record<string, string>;
  };

  it("lets another origin embed media this API serves", async () => {
    const headers = await fetchHeaders();

    expect(headers["cross-origin-resource-policy"]).toBe("cross-origin");
  });

  it("keeps helmet's default protections", async () => {
    const headers = await fetchHeaders();

    expect(headers["content-security-policy"]).toContain("default-src 'self'");
    expect(headers["strict-transport-security"]).toContain("max-age=");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("SAMEORIGIN");
  });
});
