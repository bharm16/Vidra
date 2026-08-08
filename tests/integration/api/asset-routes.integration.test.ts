import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiAuthMiddleware } from "@middleware/apiAuth";
import { createAssetRoutes } from "@routes/asset.routes";

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

const TEST_API_KEY = "integration-asset-key";
const TEST_USER_ID = `api-key:${TEST_API_KEY}`;

function createApp() {
  const assetService = {
    listAssets: vi.fn().mockResolvedValue({
      assets: [{ id: "asset_1", type: "character", trigger: "@hero" }],
      total: 1,
      byType: { character: 1, style: 0, location: 0, object: 0 },
    }),
    // AssetCrudService.listAssetsByType returns ListAssetsByTypeResult
    // ({ items, hasMore }), and the route destructures it. A bare array left
    // `items` undefined and the route threw on `items.length` — a 500 that read
    // as a route bug rather than a stale fake.
    listAssetsByType: vi.fn().mockResolvedValue({
      items: [{ id: "asset_1", type: "character" }],
      hasMore: false,
    }),
    createAsset: vi
      .fn()
      .mockResolvedValue({ id: "asset_2", type: "style", trigger: "@neon" }),
    getSuggestions: vi
      .fn()
      .mockResolvedValue([{ id: "asset_1", trigger: "@hero" }]),
    resolvePrompt: vi
      .fn()
      .mockResolvedValue({ expandedText: "resolved prompt", assets: [] }),
    validateTriggers: vi
      .fn()
      .mockResolvedValue({ valid: true, unknownTriggers: [] }),
    getAsset: vi.fn().mockResolvedValue({ id: "asset_1", type: "character" }),
    updateAsset: vi.fn().mockResolvedValue({ id: "asset_1", name: "updated" }),
    deleteAsset: vi.fn().mockResolvedValue(undefined),
    addReferenceImage: vi.fn().mockResolvedValue({
      id: "img_1",
      imageUrl: "https://example.com/img.png",
    }),
    deleteReferenceImage: vi.fn().mockResolvedValue(undefined),
    setPrimaryImage: vi
      .fn()
      .mockResolvedValue({ id: "asset_1", primaryImageId: "img_1" }),
    getAssetForGeneration: vi.fn().mockResolvedValue({
      id: "asset_1",
      primaryImageUrl: "https://example.com/img.png",
    }),
  };

  const app = express();
  app.use(express.json());
  app.use(
    "/api/assets",
    apiAuthMiddleware,
    createAssetRoutes(assetService as never),
  );

  return { app, assetService };
}

describe("Asset Routes (integration)", () => {
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

  it("supports asset list/create/read/update/delete and helper endpoints", async () => {
    const { app, assetService } = createApp();

    const listResponse = await request(app)
      .get("/api/assets")
      .set("x-api-key", TEST_API_KEY);
    expect(listResponse.status).toBe(200);
    expect(assetService.listAssets).toHaveBeenCalledWith(TEST_USER_ID);

    const filteredListResponse = await request(app)
      .get("/api/assets?type=character")
      .set("x-api-key", TEST_API_KEY);
    expect(filteredListResponse.status).toBe(200);
    expect(assetService.listAssetsByType).toHaveBeenCalledWith(
      TEST_USER_ID,
      "character",
    );

    const createResponse = await request(app)
      .post("/api/assets")
      .set("x-api-key", TEST_API_KEY)
      .send({
        type: "style",
        trigger: "@neon",
        name: "Neon Style",
      });
    expect(createResponse.status).toBe(201);
    expect(assetService.createAsset).toHaveBeenCalledWith(
      TEST_USER_ID,
      expect.objectContaining({ trigger: "@neon" }),
    );

    const suggestionsResponse = await request(app)
      .get("/api/assets/suggestions?q=hero")
      .set("x-api-key", TEST_API_KEY);
    expect(suggestionsResponse.status).toBe(200);
    expect(assetService.getSuggestions).toHaveBeenCalledWith(
      TEST_USER_ID,
      "hero",
    );

    const resolveResponse = await request(app)
      .post("/api/assets/resolve")
      .set("x-api-key", TEST_API_KEY)
      .send({ prompt: "@hero running through rain" });
    expect(resolveResponse.status).toBe(200);
    expect(assetService.resolvePrompt).toHaveBeenCalledWith(
      TEST_USER_ID,
      "@hero running through rain",
    );

    const validateResponse = await request(app)
      .post("/api/assets/validate")
      .set("x-api-key", TEST_API_KEY)
      .send({ prompt: "@hero and @neon" });
    expect(validateResponse.status).toBe(200);
    expect(assetService.validateTriggers).toHaveBeenCalledWith(
      TEST_USER_ID,
      "@hero and @neon",
    );

    const getResponse = await request(app)
      .get("/api/assets/asset_1")
      .set("x-api-key", TEST_API_KEY);
    expect(getResponse.status).toBe(200);
    expect(assetService.getAsset).toHaveBeenCalledWith(TEST_USER_ID, "asset_1");

    const patchResponse = await request(app)
      .patch("/api/assets/asset_1")
      .set("x-api-key", TEST_API_KEY)
      .send({ name: "Updated name" });
    expect(patchResponse.status).toBe(200);
    expect(assetService.updateAsset).toHaveBeenCalledWith(
      TEST_USER_ID,
      "asset_1",
      expect.objectContaining({ name: "Updated name" }),
    );

    const forGenerationResponse = await request(app)
      .get("/api/assets/asset_1/for-generation")
      .set("x-api-key", TEST_API_KEY);
    expect(forGenerationResponse.status).toBe(200);
    expect(assetService.getAssetForGeneration).toHaveBeenCalledWith(
      TEST_USER_ID,
      "asset_1",
    );

    const deleteResponse = await request(app)
      .delete("/api/assets/asset_1")
      .set("x-api-key", TEST_API_KEY);
    expect(deleteResponse.status).toBe(204);
    expect(assetService.deleteAsset).toHaveBeenCalledWith(
      TEST_USER_ID,
      "asset_1",
    );
  });

  it("supports reference image upload/delete/primary-image operations", async () => {
    const { app, assetService } = createApp();

    const uploadResponse = await request(app)
      .post("/api/assets/asset_1/images")
      .set("x-api-key", TEST_API_KEY)
      .field("angle", "front")
      .attach("image", PNG_BYTES, {
        filename: "asset.png",
        contentType: "image/png",
      });

    expect(uploadResponse.status).toBe(201);
    expect(assetService.addReferenceImage).toHaveBeenCalledWith(
      TEST_USER_ID,
      "asset_1",
      expect.any(Buffer),
      expect.objectContaining({ angle: "front" }),
    );

    const primaryResponse = await request(app)
      .patch("/api/assets/asset_1/images/img_1/primary")
      .set("x-api-key", TEST_API_KEY);
    expect(primaryResponse.status).toBe(200);
    expect(assetService.setPrimaryImage).toHaveBeenCalledWith(
      TEST_USER_ID,
      "asset_1",
      "img_1",
    );

    const deleteImageResponse = await request(app)
      .delete("/api/assets/asset_1/images/img_1")
      .set("x-api-key", TEST_API_KEY);
    expect(deleteImageResponse.status).toBe(204);
    expect(assetService.deleteReferenceImage).toHaveBeenCalledWith(
      TEST_USER_ID,
      "asset_1",
      "img_1",
    );
  });

  it("returns validation and auth failures where expected", async () => {
    const { app, assetService } = createApp();

    const invalidFilterResponse = await request(app)
      .get("/api/assets?type=invalid-type")
      .set("x-api-key", TEST_API_KEY);
    expect(invalidFilterResponse.status).toBe(400);
    expect(invalidFilterResponse.body.error).toBe("Invalid asset type filter");

    const invalidResolveResponse = await request(app)
      .post("/api/assets/resolve")
      .set("x-api-key", TEST_API_KEY)
      .send({});
    expect(invalidResolveResponse.status).toBe(400);
    // requireBody reports a generic error with a machine-readable code and puts
    // the offending field in `details` ("prompt: ..."). Assert the code and the
    // field, so this still fails if the route stops naming what was missing.
    expect(invalidResolveResponse.body.error).toBe("Invalid request");
    expect(invalidResolveResponse.body.code).toBe("INVALID_REQUEST");
    expect(invalidResolveResponse.body.details).toContain("prompt");
    expect(assetService.resolvePrompt).not.toHaveBeenCalled();

    const noAuthResponse = await request(app).get("/api/assets");
    expect(noAuthResponse.status).toBe(401);
    expect(noAuthResponse.body.error).toBe("Authentication required");
  });
});
