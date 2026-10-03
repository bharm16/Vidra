import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiAuthMiddleware } from "@middleware/apiAuth";
import { createPreviewRoutes } from "@routes/preview.routes";
import type {
  PreviewRoutesServices,
  PreviewStorageService,
} from "@routes/types";
import type { ImageGenerationService } from "@services/image-generation/ImageGenerationService";
import type { VideoGenerationService } from "@services/video-generation/VideoGenerationService";
import type { RequestIdempotencyService } from "@services/video-generation/jobs/RequestIdempotencyService";
import type { RouteCreditService } from "@services/credits/ports";
import { API_KEY_UID_PREFIX } from "@utils/apiKeyUser";
import { InMemoryIdempotencyService } from "../helpers/cross-mode/boundaryDoubles";

const TEST_API_KEY = "integration-preview-key";
const TEST_USER_ID = `${API_KEY_UID_PREFIX}${TEST_API_KEY}`;
const IDEMPOTENCY_KEY = "integration-picture-1";
const storageServiceMock = {
  saveFromUrl: vi.fn<PreviewStorageService["saveFromUrl"]>(),
  getViewUrl: vi.fn<PreviewStorageService["getViewUrl"]>(),
  getOwnedMediaViewUrl: vi.fn<PreviewStorageService["getOwnedMediaViewUrl"]>(),
  getPreviewImageViewUrl:
    vi.fn<PreviewStorageService["getPreviewImageViewUrl"]>(),
  uploadBuffer: vi.fn<PreviewStorageService["uploadBuffer"]>(),
  uploadStream: vi.fn<PreviewStorageService["uploadStream"]>(),
} satisfies PreviewStorageService;

function createApp() {
  const imageGenerationService = {
    generatePreview: vi
      .fn<ImageGenerationService["generatePreview"]>()
      .mockResolvedValue({
        imageUrl: "https://provider.example.com/generated.webp",
        metadata: {
          model: "replicate-flux-schnell",
          aspectRatio: "16:9",
          duration: 1,
          generatedAt: "2026-10-03T00:00:00Z",
        },
      }),
    getImageUrl: vi.fn<ImageGenerationService["getImageUrl"]>(),
  } satisfies Pick<ImageGenerationService, "generatePreview" | "getImageUrl">;
  const videoGenerationService = {
    getAvailabilitySnapshot: vi
      .fn<VideoGenerationService["getAvailabilitySnapshot"]>()
      .mockReturnValue({
        models: [],
        availableModelIds: [],
        unknownModelIds: [],
      }),
    getVideoUrl: vi.fn<VideoGenerationService["getVideoUrl"]>(),
  } satisfies Pick<
    VideoGenerationService,
    "getAvailabilitySnapshot" | "getVideoUrl"
  >;
  const userCreditService = {
    reserveCredits: vi
      .fn<RouteCreditService["reserveCredits"]>()
      .mockResolvedValue(false),
    refundCredits: vi
      .fn<RouteCreditService["refundCredits"]>()
      .mockResolvedValue(false),
    getBalance: vi.fn<RouteCreditService["getBalance"]>().mockResolvedValue(0),
    checkAndReserveInTransaction: vi
      .fn<RouteCreditService["checkAndReserveInTransaction"]>()
      .mockResolvedValue({ ok: false, reason: "insufficient_credits" }),
  } satisfies RouteCreditService;
  const services = {
    // This route contract fixture checks the public methods used by the
    // handler; concrete generation services are outside its coverage.
    imageGenerationService:
      imageGenerationService as unknown as ImageGenerationService,
    storyboardPreviewService: null,
    videoGenerationService:
      videoGenerationService as unknown as VideoGenerationService,
    videoJobStore: null,
    videoContentAccessService: null,
    userCreditService,
    storageService: storageServiceMock,
    keyframeService: null,
    faceSwapService: null,
    assetService: null,
    requestIdempotencyService:
      new InMemoryIdempotencyService() as unknown as RequestIdempotencyService,
  } satisfies PreviewRoutesServices;
  const app = express();
  app.use(express.json());
  app.use("/api/preview", apiAuthMiddleware, createPreviewRoutes(services));
  return {
    app,
    imageGenerationService,
    videoGenerationService,
    userCreditService,
  };
}

describe("Picture route contracts (legacy preview prefix)", () => {
  let previousAllowedApiKeys: string | undefined;
  beforeEach(() => {
    previousAllowedApiKeys = process.env.ALLOWED_API_KEYS;
    process.env.ALLOWED_API_KEYS = TEST_API_KEY;
    vi.clearAllMocks();
    storageServiceMock.saveFromUrl.mockImplementation(
      async (userId): ReturnType<PreviewStorageService["saveFromUrl"]> => ({
        storagePath: `users/${userId}/previews/images/generated.webp`,
        viewUrl: "https://storage.example.com/generated.webp",
        expiresAt: "2099-01-01T00:00:00Z",
        sizeBytes: 1234,
      }),
    );
  });
  afterEach(() => {
    if (previousAllowedApiKeys === undefined)
      delete process.env.ALLOWED_API_KEYS;
    else process.env.ALLOWED_API_KEYS = previousAllowedApiKeys;
  });
  it("generates a picture for an authenticated idempotent free request", async () => {
    const { app, imageGenerationService, userCreditService } = createApp();
    const response = await request(app)
      .post("/api/preview/generate")
      .set("x-api-key", TEST_API_KEY)
      .set("Idempotency-Key", IDEMPOTENCY_KEY)
      .send({ prompt: "A dramatic skyline in rain", aspectRatio: "16:9" });
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.imageUrl).toBe(
      "https://storage.example.com/generated.webp",
    );
    expect(userCreditService.reserveCredits).not.toHaveBeenCalled();
    expect(userCreditService.refundCredits).not.toHaveBeenCalled();
    expect(userCreditService.getBalance).not.toHaveBeenCalled();
    expect(imageGenerationService.generatePreview).toHaveBeenCalledWith(
      "A dramatic skyline in rain",
      expect.objectContaining({ aspectRatio: "16:9", userId: TEST_USER_ID }),
    );
    expect(storageServiceMock.saveFromUrl).toHaveBeenCalledWith(
      TEST_USER_ID,
      "https://provider.example.com/generated.webp",
      "preview-image",
      expect.objectContaining({
        model: "replicate-flux-schnell",
        aspectRatio: "16:9",
      }),
    );
  });
  it("replays a completed request without another provider call or storage copy", async () => {
    const { app, imageGenerationService } = createApp();
    const send = () =>
      request(app)
        .post("/api/preview/generate")
        .set("x-api-key", TEST_API_KEY)
        .set("Idempotency-Key", IDEMPOTENCY_KEY)
        .send({ prompt: "A dramatic skyline in rain", aspectRatio: "16:9" });
    const first = await send();
    const replay = await send();
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(first.body);
    expect(imageGenerationService.generatePreview).toHaveBeenCalledTimes(1);
    expect(storageServiceMock.saveFromUrl).toHaveBeenCalledTimes(1);
  });
  it("rejects a missing idempotency key before provider dispatch", async () => {
    const { app, imageGenerationService } = createApp();
    const response = await request(app)
      .post("/api/preview/generate")
      .set("x-api-key", TEST_API_KEY)
      .send({ prompt: "A skyline" });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    expect(imageGenerationService.generatePreview).not.toHaveBeenCalled();
    expect(storageServiceMock.saveFromUrl).not.toHaveBeenCalled();
  });
  it("returns validation failures for invalid picture payloads", async () => {
    const { app, imageGenerationService, userCreditService } = createApp();
    const response = await request(app)
      .post("/api/preview/generate")
      .set("x-api-key", TEST_API_KEY)
      .set("Idempotency-Key", IDEMPOTENCY_KEY)
      .send({ prompt: "" });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Prompt");
    expect(imageGenerationService.generatePreview).not.toHaveBeenCalled();
    expect(userCreditService.reserveCredits).not.toHaveBeenCalled();
  });
  it("enforces auth middleware", async () => {
    const { app } = createApp();
    const noAuthResponse = await request(app)
      .post("/api/preview/generate")
      .set("Idempotency-Key", IDEMPOTENCY_KEY)
      .send({ prompt: "No auth prompt" });
    expect(noAuthResponse.status).toBe(401);
    expect(noAuthResponse.body.error).toBe("Authentication required");
  });
});
