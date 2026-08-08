import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiAuthMiddleware } from "@middleware/apiAuth";
import { createReferenceImagesRoutes } from "@routes/reference-images.routes";

// A real PNG signature + IHDR. The routes validate uploads by magic bytes
// (validateImageBuffer -> fileTypeFromBuffer), so arbitrary text is rejected
// as "expected image, got unknown" and surfaces as a 500. Matches the fixture
// in tests/unit/validate-file-type.test.ts.
const PNG_BYTES = Buffer.from([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a, // PNG signature
  0x00,
  0x00,
  0x00,
  0x0d,
  0x49,
  0x48,
  0x44,
  0x52, // IHDR chunk
]);

const TEST_API_KEY = "integration-reference-images-key";
const TEST_USER_ID = `api-key:${TEST_API_KEY}`;

function createApp() {
  const referenceImageService = {
    listImages: vi.fn().mockResolvedValue([
      {
        id: "ref_img_1",
        label: "Primary",
        sourceUrl: "https://example.com/ref-1.png",
      },
    ]),
    createFromBuffer: vi.fn().mockResolvedValue({
      id: "ref_img_upload",
      label: "Upload",
      source: "upload",
    }),
    createFromUrl: vi.fn().mockResolvedValue({
      id: "ref_img_2",
      sourceUrl: "https://example.com/reference.png",
    }),
    deleteImage: vi.fn().mockResolvedValue(true),
  };

  const app = express();
  app.use(express.json());
  app.use(
    "/api/reference-images",
    apiAuthMiddleware,
    createReferenceImagesRoutes(referenceImageService as never),
  );

  return { app, referenceImageService };
}

describe("Reference Images Routes (integration)", () => {
  let previousAllowedApiKeys: string | undefined;

  beforeEach(() => {
    previousAllowedApiKeys = process.env.ALLOWED_API_KEYS;
    process.env.ALLOWED_API_KEYS = TEST_API_KEY;
  });

  afterEach(() => {
    if (previousAllowedApiKeys === undefined) {
      delete process.env.ALLOWED_API_KEYS;
      return;
    }
    process.env.ALLOWED_API_KEYS = previousAllowedApiKeys;
  });

  it("lists reference images for authenticated user", async () => {
    const { app, referenceImageService } = createApp();

    const response = await request(app)
      .get("/api/reference-images?limit=5")
      .set("x-api-key", TEST_API_KEY);

    expect(response.status).toBe(200);
    // Response envelope: the payload sits under `data`.
    expect(response.body.data.images).toHaveLength(1);
    expect(referenceImageService.listImages).toHaveBeenCalledWith(
      TEST_USER_ID,
      { limit: 5 },
    );
  });

  it("creates reference image from URL and uploaded file", async () => {
    const { app, referenceImageService } = createApp();

    const fromUrlResponse = await request(app)
      .post("/api/reference-images/from-url")
      .set("x-api-key", TEST_API_KEY)
      .send({
        sourceUrl: "https://example.com/reference.png",
        label: "Ref image",
      });

    expect(fromUrlResponse.status).toBe(201);
    expect(fromUrlResponse.body.data.id).toBe("ref_img_2");
    expect(referenceImageService.createFromUrl).toHaveBeenCalledWith(
      TEST_USER_ID,
      "https://example.com/reference.png",
      expect.objectContaining({ label: "Ref image" }),
    );

    const uploadResponse = await request(app)
      .post("/api/reference-images")
      .set("x-api-key", TEST_API_KEY)
      .field("label", "Uploaded")
      .attach("file", PNG_BYTES, {
        filename: "reference.png",
        contentType: "image/png",
      });

    expect(uploadResponse.status).toBe(201);
    expect(uploadResponse.body.data.id).toBe("ref_img_upload");
    expect(referenceImageService.createFromBuffer).toHaveBeenCalledWith(
      TEST_USER_ID,
      expect.any(Buffer),
      expect.objectContaining({
        label: "Uploaded",
        originalName: "reference.png",
      }),
    );
  });

  it("deletes reference images by id and returns 404 when missing", async () => {
    const { app, referenceImageService } = createApp();

    const deleteResponse = await request(app)
      .delete("/api/reference-images/ref_img_1")
      .set("x-api-key", TEST_API_KEY);

    expect(deleteResponse.status).toBe(204);
    expect(referenceImageService.deleteImage).toHaveBeenCalledWith(
      TEST_USER_ID,
      "ref_img_1",
    );

    referenceImageService.deleteImage.mockResolvedValueOnce(false);

    const notFoundResponse = await request(app)
      .delete("/api/reference-images/missing")
      .set("x-api-key", TEST_API_KEY);

    expect(notFoundResponse.status).toBe(404);
    expect(notFoundResponse.body.error).toBe("Reference image not found");
  });

  it("returns validation/auth failures for invalid payloads and missing auth", async () => {
    const { app, referenceImageService } = createApp();

    const invalidResponse = await request(app)
      .post("/api/reference-images/from-url")
      .set("x-api-key", TEST_API_KEY)
      .send({ label: "Missing URL" });

    expect(invalidResponse.status).toBe(400);
    expect(invalidResponse.body.error).toBe("sourceUrl is required");
    expect(referenceImageService.createFromUrl).not.toHaveBeenCalled();

    const noAuthResponse = await request(app).get("/api/reference-images");

    expect(noAuthResponse.status).toBe(401);
    expect(noAuthResponse.body.error).toBe("Authentication required");
  });
});
