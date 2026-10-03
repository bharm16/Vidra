import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import {
  createOwnedPictureResolver,
  type ImagePreviewAssetReader,
  type UserScopedMediaReader,
} from "@services/owned-media";
import type { PreviewStorageService } from "@routes/types";
import { createMediaReferenceViewHandler } from "../mediaReferenceView";

const buildResponse = () => {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  return response;
};

describe("media reference view handler", () => {
  const getOwnedMediaViewUrl = vi.fn();
  const handler = createMediaReferenceViewHandler({
    imageGenerationService: null,
    videoGenerationService: null,
    videoJobStore: null,
    storageService: {
      getOwnedMediaViewUrl,
    },
  } as never);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires authentication before resolving an owned-media reference", async () => {
    const response = buildResponse();

    await handler(
      {
        query: { ref: "om1.preview-image.preview.webp", kind: "image" },
      } as never,
      response as never,
    );

    expect(response.status).toHaveBeenCalledWith(401);
    expect(getOwnedMediaViewUrl).not.toHaveBeenCalled();
  });

  it("binds an opaque reference to the authenticated owner", async () => {
    getOwnedMediaViewUrl.mockResolvedValue({
      viewUrl: "https://storage.example.test/view",
      expiresAt: "2026-08-10T00:00:00.000Z",
      mediaRef: "om1.preview-image.preview.webp",
    });
    const response = buildResponse();

    await handler(
      {
        user: { uid: "current-user" },
        query: { ref: "om1.preview-image.preview.webp", kind: "image" },
      } as never,
      response as never,
    );

    expect(getOwnedMediaViewUrl).toHaveBeenCalledWith(
      "current-user",
      "om1.preview-image.preview.webp",
    );
    expect(response.json).toHaveBeenCalledWith({
      success: true,
      data: {
        viewUrl: "https://storage.example.test/view",
        expiresAt: "2026-08-10T00:00:00.000Z",
        mediaRef: "om1.preview-image.preview.webp",
        source: "owned",
      },
    });
  });
});

describe("admitted picture reference refresh", () => {
  const OWNER = "current-user";
  const ASSET = "accepted-picture";
  const VIEW_URL = "https://storage.example.test/image-asset?fresh-signature";

  function createHarness(
    options: { missing?: boolean; resolver?: boolean } = {},
  ) {
    const imageAssets = {
      getPublicUrl: vi.fn(
        async (assetId: string, userId: string): Promise<string | null> =>
          !options.missing && assetId === ASSET && userId === OWNER
            ? VIEW_URL
            : null,
      ),
    } satisfies ImagePreviewAssetReader;
    const userStorage = {
      getViewUrl: vi.fn(
        async (): Promise<{ viewUrl: string }> => ({ viewUrl: "unused" }),
      ),
      getPreviewImageViewUrl: vi.fn(async (): Promise<string | null> => null),
    } satisfies UserScopedMediaReader;
    const genericStorage = {
      saveFromUrl: vi.fn<PreviewStorageService["saveFromUrl"]>(),
      getViewUrl: vi.fn<PreviewStorageService["getViewUrl"]>(),
      getPreviewImageViewUrl:
        vi.fn<PreviewStorageService["getPreviewImageViewUrl"]>(),
      getOwnedMediaViewUrl:
        vi.fn<PreviewStorageService["getOwnedMediaViewUrl"]>(),
      uploadBuffer: vi.fn<PreviewStorageService["uploadBuffer"]>(),
      uploadStream: vi.fn<PreviewStorageService["uploadStream"]>(),
    } satisfies PreviewStorageService;
    const app = express();
    app.use((req, _res, next) => {
      Object.assign(req, { user: { uid: OWNER } });
      next();
    });
    app.get(
      "/media/view",
      createMediaReferenceViewHandler({
        imageGenerationService: null,
        videoGenerationService: null,
        videoJobStore: null,
        storageService: genericStorage,
        ownedPictureResolver:
          options.resolver === false
            ? null
            : createOwnedPictureResolver({ imageAssets, userStorage }),
      }),
    );
    return { app, imageAssets, userStorage, genericStorage };
  }

  it("refreshes a production image-asset path through its owner-checked store", async () => {
    const { app, imageAssets, userStorage, genericStorage } = createHarness();
    const response = await request(app)
      .get("/media/view")
      .query({
        ref: `image-previews/${OWNER}/${ASSET}`,
        kind: "image",
      });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: { viewUrl: VIEW_URL, source: "preview" },
    });
    expect(imageAssets.getPublicUrl).toHaveBeenCalledWith(ASSET, OWNER);
    expect(genericStorage.getOwnedMediaViewUrl).not.toHaveBeenCalled();
    expect(userStorage.getViewUrl).not.toHaveBeenCalled();
  });

  it("refuses another creator's path before any read or signing, ignoring a query owner", async () => {
    const { app, imageAssets, userStorage, genericStorage } = createHarness();
    const response = await request(app)
      .get("/media/view")
      .query({
        ref: `image-previews/someone-else/${ASSET}`,
        kind: "image",
        userId: "someone-else",
      });
    expect(response.status).toBe(404);
    expect(imageAssets.getPublicUrl).not.toHaveBeenCalled();
    expect(userStorage.getViewUrl).not.toHaveBeenCalled();
    expect(genericStorage.getOwnedMediaViewUrl).not.toHaveBeenCalled();
  });

  it("reports a missing owned image asset as absent", async () => {
    const { app, imageAssets, genericStorage } = createHarness({
      missing: true,
    });
    const response = await request(app)
      .get("/media/view")
      .query({ ref: `image-previews/${OWNER}/${ASSET}`, kind: "image" });
    expect(response.status).toBe(404);
    expect(imageAssets.getPublicUrl).toHaveBeenCalledWith(ASSET, OWNER);
    expect(genericStorage.getOwnedMediaViewUrl).not.toHaveBeenCalled();
  });

  it("reports an unavailable picture resolver without falling back to generic signing", async () => {
    const { app, imageAssets, genericStorage } = createHarness({
      resolver: false,
    });
    const response = await request(app)
      .get("/media/view")
      .query({ ref: `image-previews/${OWNER}/${ASSET}`, kind: "image" });
    expect(response.status).toBe(503);
    expect(imageAssets.getPublicUrl).not.toHaveBeenCalled();
    expect(genericStorage.getOwnedMediaViewUrl).not.toHaveBeenCalled();
  });

  it.each([
    "users/current-user/previews/images/picture.webp",
    "om1.preview-image.picture.webp",
  ])("keeps the generic owned-media flow for %s", async (ref) => {
    const { app, imageAssets, genericStorage } = createHarness();
    genericStorage.getOwnedMediaViewUrl.mockResolvedValue({
      viewUrl: VIEW_URL,
      expiresAt: "2026-10-03T21:00:00Z",
    });
    const response = await request(app)
      .get("/media/view")
      .query({ ref, kind: "image" });
    expect(response.status).toBe(200);
    expect(genericStorage.getOwnedMediaViewUrl).toHaveBeenCalledWith(
      OWNER,
      ref,
    );
    expect(imageAssets.getPublicUrl).not.toHaveBeenCalled();
    expect(response.body.data.source).toBe("owned");
  });
});
