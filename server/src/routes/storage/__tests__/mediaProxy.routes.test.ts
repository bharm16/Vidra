/**
 * Regression test: Media proxy validates bucket, rejects non-GCS URLs.
 *
 * The media proxy must only allow URLs from the configured GCS bucket.
 * Non-HTTPS, wrong-bucket, or malformed URLs must be rejected to prevent SSRF.
 */
import { describe, expect, it } from "vitest";
import request from "supertest";
import express from "express";
import { createMediaProxyRoutes } from "../mediaProxy.routes";

const BUCKET = "test-bucket";

function createApp(): express.Express {
  const app = express();
  app.use(
    "/api/storage",
    createMediaProxyRoutes({
      bucketName: BUCKET,
      access: { kind: "signed-url-is-authorization" },
    }),
  );
  return app;
}

describe("mediaProxy.routes", () => {
  it("rejects requests without url param", async () => {
    const app = createApp();
    const res = await request(app).get("/api/storage/proxy");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_REQUEST");
  });

  it("rejects non-https URLs", async () => {
    const app = createApp();
    const res = await request(app).get(
      "/api/storage/proxy?url=http://evil.com/file.png",
    );
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("https");
  });

  it("rejects URLs from wrong bucket", async () => {
    const app = createApp();
    const res = await request(app).get(
      `/api/storage/proxy?url=${encodeURIComponent("https://storage.googleapis.com/wrong-bucket/file.png")}`,
    );
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("FORBIDDEN");
  });

  it("rejects URLs from non-GCS hosts", async () => {
    const app = createApp();
    const res = await request(app).get(
      `/api/storage/proxy?url=${encodeURIComponent("https://evil.com/file.png")}`,
    );
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("FORBIDDEN");
  });

  it("rejects invalid URL format", async () => {
    const app = createApp();
    const res = await request(app).get("/api/storage/proxy?url=not-a-url");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_REQUEST");
  });
});
