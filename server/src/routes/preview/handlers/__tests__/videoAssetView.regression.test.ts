import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createVideoAssetViewHandler } from "../videoAssetView";

const createApp = (
  handler: ReturnType<typeof createVideoAssetViewHandler>,
  userId: string | null = "user-1",
): express.Express => {
  const app = express();
  app.use((req, _res, next) => {
    const request = req as express.Request & { user?: { uid?: string } };
    if (userId) {
      request.user = { uid: userId };
    } else {
      delete request.user;
    }
    next();
  });
  app.get("/preview/video/view", (req, res, next) => {
    void handler(req, res).catch(next);
  });
  return app;
};

describe("videoAssetView ownership regression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 503 when video job store is unavailable", async () => {
    const getVideoUrl = vi.fn();
    const handler = createVideoAssetViewHandler({
      videoGenerationService: { getVideoUrl } as never,
      videoJobStore: null as never,
      storageService: null as never,
    });
    const app = createApp(handler);

    const response = await request(app)
      .get("/preview/video/view")
      .query({ assetId: "asset-1" });

    expect(response.status).toBe(503);
    expect(getVideoUrl).not.toHaveBeenCalled();
  });

  it("returns 404 when no job exists for the requested asset", async () => {
    const findJobByAssetId = vi.fn().mockResolvedValue(null);
    const getVideoUrl = vi.fn();
    const handler = createVideoAssetViewHandler({
      videoGenerationService: { getVideoUrl } as never,
      videoJobStore: { findJobByAssetId } as never,
      storageService: null as never,
    });
    const app = createApp(handler);

    const response = await request(app)
      .get("/preview/video/view")
      .query({ assetId: "asset-1" });

    expect(response.status).toBe(404);
    expect(findJobByAssetId).toHaveBeenCalledWith("asset-1");
    expect(getVideoUrl).not.toHaveBeenCalled();
  });

  it("returns 403 on owner mismatch even when storagePath is absent", async () => {
    const findJobByAssetId = vi.fn().mockResolvedValue({
      id: "job-1",
      userId: "other-user",
      result: {},
    });
    const getVideoUrl = vi.fn();
    const handler = createVideoAssetViewHandler({
      videoGenerationService: { getVideoUrl } as never,
      videoJobStore: { findJobByAssetId } as never,
      storageService: null as never,
    });
    const app = createApp(handler, "user-1");

    const response = await request(app)
      .get("/preview/video/view")
      .query({ assetId: "asset-1" });

    expect(response.status).toBe(403);
    expect(getVideoUrl).not.toHaveBeenCalled();
  });

  it("returns storage-backed URL for owned jobs with storage paths", async () => {
    const findJobByAssetId = vi.fn().mockResolvedValue({
      id: "job-1",
      userId: "user-1",
      result: { storagePath: "users/user-1/generations/asset-1.mp4" },
    });
    const getViewUrl = vi.fn().mockResolvedValue({
      viewUrl: "https://storage.example.com/asset-1",
      expiresAt: "2026-02-23T00:00:00.000Z",
      storagePath: "users/user-1/generations/asset-1.mp4",
    });
    const getVideoUrl = vi.fn();
    const handler = createVideoAssetViewHandler({
      videoGenerationService: { getVideoUrl } as never,
      videoJobStore: { findJobByAssetId } as never,
      storageService: { getViewUrl } as never,
    });
    const app = createApp(handler, "user-1");

    const response = await request(app)
      .get("/preview/video/view")
      .query({ assetId: "asset-1" });

    expect(response.status).toBe(200);
    expect(response.body.data.source).toBe("storage");
    expect(response.body.data.viewUrl).toBe(
      "https://storage.example.com/asset-1",
    );
    expect(getViewUrl).toHaveBeenCalledWith(
      "user-1",
      "users/user-1/generations/asset-1.mp4",
    );
    expect(getVideoUrl).not.toHaveBeenCalled();
  });

  it("falls back to preview URL for owned jobs when storage view fails", async () => {
    const findJobByAssetId = vi.fn().mockResolvedValue({
      id: "job-1",
      userId: "user-1",
      result: { storagePath: "users/user-1/generations/asset-1.mp4" },
    });
    const getViewUrl = vi
      .fn()
      .mockRejectedValue(new Error("storage unavailable"));
    const getVideoUrl = vi
      .fn()
      .mockResolvedValue("https://preview.example.com/asset-1");
    const handler = createVideoAssetViewHandler({
      videoGenerationService: { getVideoUrl } as never,
      videoJobStore: { findJobByAssetId } as never,
      storageService: { getViewUrl } as never,
    });
    const app = createApp(handler, "user-1");

    const response = await request(app)
      .get("/preview/video/view")
      .query({ assetId: "asset-1" });

    expect(response.status).toBe(200);
    expect(response.body.data.source).toBe("preview");
    expect(response.body.data.viewUrl).toBe(
      "https://preview.example.com/asset-1",
    );
    expect(getVideoUrl).toHaveBeenCalledWith("asset-1");
  });
});
