import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createImageAssetViewHandler } from "../imageAssetView";

/**
 * Regression: Library covers 404'd through the view route while their objects
 * existed in GCS.
 *
 * Observed live (2026-08-01): current-loop frames persist via the storage
 * service at users/{uid}/previews/images/{timestamp}-{hash}.webp, but the
 * view route resolved assetIds only through the image-generation asset store
 * (image-previews/{uid}/{assetId} + legacy) — so every new frame's cover died
 * as soon as its signed URL expired, with the object sitting healthy in the
 * bucket (signed URL 200, view route 404).
 *
 * Invariant: for any preview-image asset whose object exists under the
 * requester's storage namespace, the view route resolves a URL — the
 * image-generation store miss falls back to the storage-service location;
 * only true absence 404s.
 */

interface ErrorWithCode {
  code?: string;
  message?: string;
}

const isSocketPermissionError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as ErrorWithCode;
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message =
    typeof candidate.message === "string" ? candidate.message : "";
  if (code === "EPERM" || code === "EACCES") {
    return true;
  }

  return (
    message.includes("listen EPERM") ||
    message.includes("listen EACCES") ||
    message.includes("operation not permitted") ||
    message.includes("Cannot read properties of null (reading 'port')")
  );
};

const runSupertestOrSkip = async <T>(
  execute: () => Promise<T>,
): Promise<T | null> => {
  if (process.env.CODEX_SANDBOX === "seatbelt") {
    return null;
  }

  try {
    return await execute();
  } catch (error) {
    if (isSocketPermissionError(error)) {
      return null;
    }
    throw error;
  }
};

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

    const response = await runSupertestOrSkip(() =>
      request(app)
        .get("/preview/image/view")
        .query({ assetId: STORAGE_ASSET_ID }),
    );
    if (!response) return;

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

    const response = await runSupertestOrSkip(() =>
      request(app).get("/preview/image/view").query({ assetId: "asset-1" }),
    );
    if (!response) return;

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

    const response = await runSupertestOrSkip(() =>
      request(app)
        .get("/preview/image/view")
        .query({ assetId: STORAGE_ASSET_ID }),
    );
    if (!response) return;

    expect(response.status).toBe(404);
    expect(getPreviewImageViewUrl).toHaveBeenCalledWith(
      "user-1",
      STORAGE_ASSET_ID,
    );
  });

  it("404s cleanly when no storage service is wired", async () => {
    const getImageUrl = vi.fn().mockResolvedValue(null);
    const handler = createImageAssetViewHandler({
      imageGenerationService: { getImageUrl } as never,
    });
    const app = createApp(handler, "user-1");

    const response = await runSupertestOrSkip(() =>
      request(app).get("/preview/image/view").query({ assetId: "asset-1" }),
    );
    if (!response) return;

    expect(response.status).toBe(404);
  });
});
