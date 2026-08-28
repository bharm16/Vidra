import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getStorageServiceMock, storageServiceMock } = vi.hoisted(() => {
  const storageServiceMock = {
    saveFromUrl: vi.fn(),
  };

  return {
    storageServiceMock,
    getStorageServiceMock: vi.fn(() => storageServiceMock),
  };
});

vi.mock("@services/storage/StorageService", () => ({
  getStorageService: getStorageServiceMock,
}));

import { apiAuthMiddleware } from "@middleware/apiAuth";
import { createPreviewRoutes } from "@routes/preview.routes";

const TEST_API_KEY = "integration-preview-key";

function createApp() {
  const imageGenerationService = {
    generatePreview: vi.fn().mockResolvedValue({
      imageUrl: "https://provider.example.com/generated.webp",
      metadata: {
        model: "replicate-flux-schnell",
        aspectRatio: "16:9",
      },
    }),
    getImageUrl: vi.fn(),
  };

  const videoGenerationService = {
    getAvailabilitySnapshot: vi.fn().mockReturnValue({
      models: {},
      availableModelIds: ["sora2"],
    }),
    getVideoUrl: vi.fn(),
    getVideoContent: vi.fn(),
  };

  const userCreditService = {
    reserveCredits: vi.fn().mockResolvedValue(true),
    refundCredits: vi.fn().mockResolvedValue(true),
  };

  const services = {
    imageGenerationService,
    storyboardPreviewService: null,
    videoGenerationService,
    videoJobStore: null,
    videoContentAccessService: null,
    userCreditService,
    storageService: storageServiceMock,
    keyframeService: null,
    faceSwapService: null,
    assetService: null,
  };

  const app = express();
  app.use(express.json());
  app.use(
    "/api/preview",
    apiAuthMiddleware,
    createPreviewRoutes(services as never),
  );

  return {
    app,
    imageGenerationService,
    videoGenerationService,
    userCreditService,
  };
}

describe("Preview Routes (integration)", () => {
  let previousAllowedApiKeys: string | undefined;

  beforeEach(() => {
    previousAllowedApiKeys = process.env.ALLOWED_API_KEYS;
    process.env.ALLOWED_API_KEYS = TEST_API_KEY;
    vi.clearAllMocks();

    storageServiceMock.saveFromUrl.mockResolvedValue({
      storagePath: "users/user/previews/images/generated.webp",
      viewUrl: "https://storage.example.com/generated.webp",
      expiresAt: "2026-02-10T00:00:00.000Z",
      sizeBytes: 1234,
    });
  });

  afterEach(() => {
    if (previousAllowedApiKeys === undefined) {
      delete process.env.ALLOWED_API_KEYS;
      return;
    }
    process.env.ALLOWED_API_KEYS = previousAllowedApiKeys;
  });

  it("generates image previews for authenticated requests", async () => {
    const { app, imageGenerationService, userCreditService } = createApp();

    const response = await request(app)
      .post("/api/preview/generate")
      .set("x-api-key", TEST_API_KEY)
      .send({
        prompt: "A dramatic skyline in rain",
        aspectRatio: "16:9",
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.imageUrl).toBe(
      "https://storage.example.com/generated.webp",
    );
    expect(userCreditService.reserveCredits).toHaveBeenCalled();
    expect(imageGenerationService.generatePreview).toHaveBeenCalledWith(
      "A dramatic skyline in rain",
      expect.objectContaining({
        aspectRatio: "16:9",
      }),
    );
    expect(storageServiceMock.saveFromUrl).toHaveBeenCalled();
  });

  it("returns validation failures for invalid preview payloads", async () => {
    const { app, imageGenerationService, userCreditService } = createApp();

    const response = await request(app)
      .post("/api/preview/generate")
      .set("x-api-key", TEST_API_KEY)
      .send({
        prompt: "",
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Prompt");
    expect(imageGenerationService.generatePreview).not.toHaveBeenCalled();
    expect(userCreditService.reserveCredits).not.toHaveBeenCalled();
  });

  it("enforces auth middleware", async () => {
    const { app } = createApp();

    const noAuthResponse = await request(app)
      .post("/api/preview/generate")
      .send({
        prompt: "No auth prompt",
      });

    expect(noAuthResponse.status).toBe(401);
    expect(noAuthResponse.body.error).toBe("Authentication required");
  });
});
