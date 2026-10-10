import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createImageAssetViewHandler } from "../imageAssetView";

const createApp = (
  handler: ReturnType<typeof createImageAssetViewHandler>,
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
  app.get("/preview/image/view", (req, res, next) => {
    void handler(req, res).catch(next);
  });
  return app;
};

const STORAGE_ASSET_ID = "1785598164559-507131c0688a0e20.webp";

describe("imageAssetView storage-location fallback regression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves a storage-service preview image when the asset store misses", async () => {
    const getImageUrl = vi.fn().mockResolvedValue(null);
    const getPreviewImageViewUrl = vi
      .fn()
      .mockResolvedValue("https://signed.example.com/storage-preview.webp");
    const handler = createImageAssetViewHandler({
      imageGenerationService: { getImageUrl } as never,
      storageService: { getPreviewImageViewUrl } as never,
    });
    const app = createApp(handler, "user-1");

    const response = await request(app)
      .get("/preview/image/view")
      .query({ assetId: STORAGE_ASSET_ID });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      viewUrl: "https://signed.example.com/storage-preview.webp",
      assetId: STORAGE_ASSET_ID,
      source: "storage",
    });
    expect(getImageUrl).toHaveBeenCalledWith(STORAGE_ASSET_ID, "user-1");
    expect(getPreviewImageViewUrl).toHaveBeenCalledWith(
      "user-1",
      STORAGE_ASSET_ID,
    );
  });

  it("does not consult the storage fallback when the asset store resolves", async () => {
    const getImageUrl = vi
      .fn()
      .mockResolvedValue("https://images.example.com/asset-1");
    const getPreviewImageViewUrl = vi.fn();
    const handler = createImageAssetViewHandler({
      imageGenerationService: { getImageUrl } as never,
      storageService: { getPreviewImageViewUrl } as never,
    });
    const app = createApp(handler, "user-1");

    const response = await request(app)
      .get("/preview/image/view")
      .query({ assetId: "asset-1" });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      viewUrl: "https://images.example.com/asset-1",
      source: "preview",
    });
    expect(getPreviewImageViewUrl).not.toHaveBeenCalled();
  });

  it("still 404s when the asset exists in neither location", async () => {
    const getImageUrl = vi.fn().mockResolvedValue(null);
    const getPreviewImageViewUrl = vi.fn().mockResolvedValue(null);
    const handler = createImageAssetViewHandler({
      imageGenerationService: { getImageUrl } as never,
      storageService: { getPreviewImageViewUrl } as never,
    });
    const app = createApp(handler, "user-1");

    const response = await request(app)
      .get("/preview/image/view")
      .query({ assetId: STORAGE_ASSET_ID });

    expect(response.status).toBe(404);
    expect(getPreviewImageViewUrl).toHaveBeenCalledWith(
      "user-1",
      STORAGE_ASSET_ID,
    );
  });
});
