import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { storageServiceMock } = vi.hoisted(() => {
  const storageServiceMock = {
    getUploadUrl: vi.fn(),
    saveFromUrl: vi.fn(),
    confirmUpload: vi.fn(),
    getViewUrl: vi.fn(),
    getDownloadUrl: vi.fn(),
    listFiles: vi.fn(),
    getStorageUsage: vi.fn(),
    deleteFile: vi.fn(),
    deleteFiles: vi.fn(),
  };

  return {
    storageServiceMock,
  };
});

import { apiAuthMiddleware } from "@middleware/apiAuth";
import { createStorageRoutes } from "@routes/storage.routes";

import { useTestApiKey } from "../helpers/apiRouteHarness";

const TEST_API_KEY = "integration-storage-key";
const TEST_USER_ID = `api-key:${TEST_API_KEY}`;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/storage",
    apiAuthMiddleware,
    createStorageRoutes(storageServiceMock as never),
  );
  return app;
}

describe("Storage Routes (integration)", () => {
  useTestApiKey(TEST_API_KEY);

  beforeEach(() => {
    vi.clearAllMocks();

    storageServiceMock.getUploadUrl.mockResolvedValue({
      uploadUrl: "https://upload.example.com",
      storagePath: "users/u/previews/images/abc.webp",
      expiresAt: "2026-02-10T00:00:00.000Z",
      maxSizeBytes: 1024,
    });
    storageServiceMock.saveFromUrl.mockResolvedValue({
      storagePath: "users/u/previews/images/abc.webp",
      viewUrl: "https://view.example.com",
      expiresAt: "2026-02-10T00:00:00.000Z",
      sizeBytes: 512,
      contentType: "image/webp",
      createdAt: "2026-02-10T00:00:00.000Z",
    });
    storageServiceMock.confirmUpload.mockResolvedValue({
      storagePath: "users/u/previews/images/abc.webp",
      confirmedAt: "2026-02-10T00:00:00.000Z",
    });
    storageServiceMock.getViewUrl.mockResolvedValue({
      viewUrl: "https://view.example.com",
      expiresAt: "2026-02-10T00:00:00.000Z",
      storagePath: "users/u/previews/images/abc.webp",
    });
    storageServiceMock.getDownloadUrl.mockResolvedValue({
      downloadUrl: "https://download.example.com",
      expiresAt: "2026-02-10T00:00:00.000Z",
    });
    storageServiceMock.listFiles.mockResolvedValue({
      files: [{ storagePath: "users/u/previews/images/abc.webp" }],
      nextPageToken: null,
    });
    storageServiceMock.getStorageUsage.mockResolvedValue({
      totalBytes: 1024,
      fileCount: 3,
    });
    storageServiceMock.deleteFile.mockResolvedValue({
      deleted: true,
      storagePath: "users/u/previews/images/abc.webp",
    });
    storageServiceMock.deleteFiles.mockResolvedValue({
      deleted: ["users/u/previews/images/abc.webp"],
      failed: [],
    });
  });

  it("supports upload, save-from-url, confirm-upload, view/download URL operations", async () => {
    const app = createApp();

    const uploadResponse = await request(app)
      .post("/api/storage/upload-url")
      .set("x-api-key", TEST_API_KEY)
      .send({
        type: "preview-image",
        contentType: "image/png",
        metadata: { source: "test" },
      });

    expect(uploadResponse.status).toBe(200);
    expect(uploadResponse.body.success).toBe(true);
    expect(storageServiceMock.getUploadUrl).toHaveBeenCalledWith(
      TEST_USER_ID,
      "preview-image",
      "image/png",
      { source: "test" },
    );

    const saveFromUrlResponse = await request(app)
      .post("/api/storage/save-from-url")
      .set("x-api-key", TEST_API_KEY)
      .send({
        sourceUrl: "https://example.com/image.png",
        type: "preview-image",
      });
    expect(saveFromUrlResponse.status).toBe(200);
    expect(storageServiceMock.saveFromUrl).toHaveBeenCalledWith(
      TEST_USER_ID,
      "https://example.com/image.png",
      "preview-image",
      {},
    );

    const confirmResponse = await request(app)
      .post("/api/storage/confirm-upload")
      .set("x-api-key", TEST_API_KEY)
      .send({ storagePath: "users/u/previews/images/abc.webp" });
    expect(confirmResponse.status).toBe(200);
    expect(storageServiceMock.confirmUpload).toHaveBeenCalledWith(
      TEST_USER_ID,
      "users/u/previews/images/abc.webp",
    );

    const viewResponse = await request(app)
      .get("/api/storage/view-url?path=users/u/previews/images/abc.webp")
      .set("x-api-key", TEST_API_KEY);
    expect(viewResponse.status).toBe(200);
    expect(storageServiceMock.getViewUrl).toHaveBeenCalledWith(
      TEST_USER_ID,
      "users/u/previews/images/abc.webp",
    );

    const downloadResponse = await request(app)
      .get(
        "/api/storage/download-url?path=users/u/previews/images/abc.webp&filename=preview.webp",
      )
      .set("x-api-key", TEST_API_KEY);
    expect(downloadResponse.status).toBe(200);
    expect(storageServiceMock.getDownloadUrl).toHaveBeenCalledWith(
      TEST_USER_ID,
      "users/u/previews/images/abc.webp",
      "preview.webp",
    );
  });

  it("supports list/usage/delete/delete-batch operations", async () => {
    const app = createApp();

    const listResponse = await request(app)
      .get("/api/storage/list?type=preview-image&limit=25&cursor=next-token")
      .set("x-api-key", TEST_API_KEY);
    expect(listResponse.status).toBe(200);
    expect(storageServiceMock.listFiles).toHaveBeenCalledWith(TEST_USER_ID, {
      type: "preview-image",
      limit: 25,
      pageToken: "next-token",
    });

    const usageResponse = await request(app)
      .get("/api/storage/usage")
      .set("x-api-key", TEST_API_KEY);
    expect(usageResponse.status).toBe(200);
    expect(storageServiceMock.getStorageUsage).toHaveBeenCalledWith(
      TEST_USER_ID,
    );

    const deleteResponse = await request(app)
      .delete("/api/storage/users/u/previews/images/abc.webp")
      .set("x-api-key", TEST_API_KEY);
    expect(deleteResponse.status).toBe(200);
    expect(storageServiceMock.deleteFile).toHaveBeenCalledWith(
      TEST_USER_ID,
      "users/u/previews/images/abc.webp",
    );

    const deleteBatchResponse = await request(app)
      .post("/api/storage/delete-batch")
      .set("x-api-key", TEST_API_KEY)
      .send({
        paths: ["users/u/previews/images/abc.webp"],
      });
    expect(deleteBatchResponse.status).toBe(200);
    expect(storageServiceMock.deleteFiles).toHaveBeenCalledWith(TEST_USER_ID, [
      "users/u/previews/images/abc.webp",
    ]);
  });

  it("returns validation and authentication failures for invalid requests", async () => {
    const app = createApp();

    const invalidTypeResponse = await request(app)
      .get("/api/storage/list?type=not-valid")
      .set("x-api-key", TEST_API_KEY);
    expect(invalidTypeResponse.status).toBe(400);
    expect(invalidTypeResponse.body.success).toBe(false);

    const missingFieldResponse = await request(app)
      .post("/api/storage/upload-url")
      .set("x-api-key", TEST_API_KEY)
      .send({ type: "preview-image" });
    expect(missingFieldResponse.status).toBe(400);

    const noAuthResponse = await request(app).get("/api/storage/usage");
    expect(noAuthResponse.status).toBe(401);
    expect(noAuthResponse.body.error).toBe("Authentication required");
  });
});
