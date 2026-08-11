import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRefundKey } from "@services/credits/refundGuard";
import { createVideoGenerateHandler } from "@routes/preview/handlers/videoGenerate";
import { runSupertestOrSkip } from "./test-helpers/supertestSafeRequest";

const { scheduleInlineMock, normalizeGenerationParamsMock } = vi.hoisted(
  () => ({
    scheduleInlineMock: vi.fn(),
    normalizeGenerationParamsMock: vi.fn(),
  }),
);

vi.mock("@routes/preview/inlineProcessor", () => ({
  scheduleInlineVideoProcessing: scheduleInlineMock,
}));

vi.mock("@routes/optimize/normalizeGenerationParams", () => ({
  normalizeGenerationParams: normalizeGenerationParamsMock,
}));

type AppOptions = {
  requestId?: string;
  handler: ReturnType<typeof createVideoGenerateHandler>;
  userId?: string | null;
};

const createApp = ({
  requestId,
  handler,
  userId = "user-123",
}: AppOptions): express.Express => {
  const app = express();
  app.use((req, _res, next) => {
    if (requestId) {
      (req as express.Request & { id?: string }).id = requestId;
    }
    const requestWithUser = req as express.Request & {
      user?: { uid?: string } | undefined;
    };
    if (userId) {
      requestWithUser.user = { uid: userId };
    } else {
      delete requestWithUser.user;
    }
    next();
  });
  app.use(express.json());
  app.post("/preview/video/generate", handler);
  return app;
};

// Adapter: delegates the atomic method to the existing createJob + reserveCredits mocks
// so tests written against the legacy 2-step API keep their assertions intact.
const buildAtomicReservation = (
  createJob: ReturnType<typeof vi.fn>,
): ((
  input: Record<string, unknown>,
  deps: {
    creditService: {
      reserveCredits: (uid: string, cost: number) => Promise<boolean>;
    };
    cost: number;
  },
) => Promise<
  { reserved: true; job: unknown } | { reserved: false; reason: string }
>) => {
  return async (input, { creditService, cost }) => {
    const ok = await creditService.reserveCredits(input.userId as string, cost);
    if (!ok) {
      return { reserved: false, reason: "insufficient_credits" };
    }
    const job = await createJob(input);
    return { reserved: true, job };
  };
};

describe("videoGenerate contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    normalizeGenerationParamsMock.mockImplementation(
      ({ generationParams }: { generationParams: unknown }) => ({
        normalizedGenerationParams:
          generationParams && typeof generationParams === "object"
            ? (generationParams as Record<string, unknown>)
            : null,
      }),
    );
  });

  it("rejects anonymous users with 401", async () => {
    const handler = createVideoGenerateHandler({
      videoGenerationService: {
        getModelAvailability: () => ({
          available: true,
          resolvedModelId: "sora-2",
        }),
      } as never,
      videoJobStore: {
        createJob: vi.fn(),
      } as never,
      userCreditService: {
        reserveCredits: vi.fn(async () => true),
        refundCredits: vi.fn(async () => true),
      } as never,
      keyframeService: null as never,
      faceSwapService: null as never,
      assetService: null as never,
    });
    const app = createApp({ handler, userId: "anonymous" });

    const response = await runSupertestOrSkip(() =>
      request(app).post("/preview/video/generate").send({
        prompt: "A cinematic shot.",
        model: "sora-2",
      }),
    );
    if (!response) return;

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      error: "Authentication required",
      code: "AUTH_REQUIRED",
    });
  });

  it("rejects unsafe startImage URLs", async () => {
    const handler = createVideoGenerateHandler({
      videoGenerationService: {
        getModelAvailability: () => ({
          available: true,
          resolvedModelId: "sora-2",
        }),
      } as never,
      videoJobStore: {
        createJob: vi.fn(),
      } as never,
      userCreditService: {
        reserveCredits: vi.fn(async () => true),
        refundCredits: vi.fn(async () => true),
      } as never,
      keyframeService: null as never,
      faceSwapService: null as never,
      assetService: null as never,
    });
    const app = createApp({ handler });

    const response = await runSupertestOrSkip(() =>
      request(app).post("/preview/video/generate").send({
        prompt: "A cinematic shot.",
        model: "sora-2",
        startImage: "http://127.0.0.1/private.png",
      }),
    );
    if (!response) return;

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: "Invalid startImage URL",
      code: "INVALID_REQUEST",
    });
  });

  it("refunds keyframe credits when model becomes unavailable after preprocessing", async () => {
    const refundCreditsMock = vi.fn(async () => true);
    const handler = createVideoGenerateHandler({
      videoGenerationService: {
        getModelAvailability: () => ({
          available: false,
          statusCode: 503,
          message: "Requested model unavailable",
          reason: "provider-down",
          requiredKey: "OPENAI_API_KEY",
          resolvedModelId: "sora-2",
        }),
        getAvailabilitySnapshot: () => ({ availableModelIds: [] }),
      } as never,
      videoJobStore: {
        createJob: vi.fn(),
      } as never,
      userCreditService: {
        reserveCredits: vi.fn(async () => true),
        refundCredits: refundCreditsMock,
      } as never,
      keyframeService: {
        generateKeyframe: vi.fn(async () => ({
          imageUrl: "https://images.example.com/keyframe.webp",
          faceStrength: 0.7,
        })),
      } as never,
      faceSwapService: null as never,
      assetService: {
        getAssetForGeneration: vi.fn(async () => ({
          primaryImageUrl: "https://images.example.com/face.webp",
          negativePrompt: null,
          faceEmbedding: null,
        })),
      } as never,
    });
    const app = createApp({
      requestId: "req-model-unavailable",
      handler,
    });

    const response = await runSupertestOrSkip(() =>
      request(app).post("/preview/video/generate").send({
        prompt: "A cinematic shot.",
        model: "sora-2",
        characterAssetId: "char-123",
      }),
    );
    if (!response) return;

    const expectedKeyframeRefundKey = buildRefundKey([
      "preview-video",
      "req-model-unavailable",
      "user-123",
      "keyframe",
    ]);

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      error: "Video model not available",
      code: "SERVICE_UNAVAILABLE",
    });
    expect(refundCreditsMock).toHaveBeenCalledWith(
      "user-123",
      2,
      expect.objectContaining({
        refundKey: expectedKeyframeRefundKey,
        reason: "video model unavailable after keyframe reservation",
      }),
    );
  });

  it("refunds keyframe credits when generation param normalization fails after preprocessing", async () => {
    normalizeGenerationParamsMock.mockReturnValueOnce({
      normalizedGenerationParams: null,
      error: {
        status: 400,
        error: "Invalid generation params",
        details: "duration_s is not supported",
      },
    });

    const refundCreditsMock = vi.fn(async () => true);
    const handler = createVideoGenerateHandler({
      videoGenerationService: {
        getModelAvailability: () => ({
          available: true,
          resolvedModelId: "sora-2",
        }),
      } as never,
      videoJobStore: {
        createJob: vi.fn(),
      } as never,
      userCreditService: {
        reserveCredits: vi.fn(async () => true),
        refundCredits: refundCreditsMock,
      } as never,
      keyframeService: {
        generateKeyframe: vi.fn(async () => ({
          imageUrl: "https://images.example.com/keyframe.webp",
          faceStrength: 0.7,
        })),
      } as never,
      faceSwapService: null as never,
      assetService: {
        getAssetForGeneration: vi.fn(async () => ({
          primaryImageUrl: "https://images.example.com/face.webp",
          negativePrompt: null,
          faceEmbedding: null,
        })),
      } as never,
    });
    const app = createApp({
      requestId: "req-normalization-failure",
      handler,
    });

    const response = await runSupertestOrSkip(() =>
      request(app)
        .post("/preview/video/generate")
        .send({
          prompt: "A cinematic shot.",
          model: "sora-2",
          characterAssetId: "char-123",
          generationParams: { duration_s: 999 },
        }),
    );
    if (!response) return;

    const expectedKeyframeRefundKey = buildRefundKey([
      "preview-video",
      "req-normalization-failure",
      "user-123",
      "keyframe",
    ]);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: "Invalid generation params",
      code: "INVALID_REQUEST",
    });
    expect(refundCreditsMock).toHaveBeenCalledWith(
      "user-123",
      2,
      expect.objectContaining({
        refundKey: expectedKeyframeRefundKey,
        reason: "video request normalization failed after keyframe reservation",
      }),
    );
  });

  it("refunds keyframe credits when video credits are insufficient after preprocessing", async () => {
    const reserveCreditsMock = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const refundCreditsMock = vi.fn(async () => true);

    const handler = createVideoGenerateHandler({
      videoGenerationService: {
        getModelAvailability: () => ({
          available: true,
          resolvedModelId: "sora-2",
        }),
      } as never,
      videoJobStore: {
        createJob: vi.fn(),
        createJobWithReservation: buildAtomicReservation(vi.fn()),
      } as never,
      userCreditService: {
        reserveCredits: reserveCreditsMock,
        refundCredits: refundCreditsMock,
      } as never,
      keyframeService: {
        generateKeyframe: vi.fn(async () => ({
          imageUrl: "https://images.example.com/keyframe.webp",
          faceStrength: 0.7,
        })),
      } as never,
      faceSwapService: null as never,
      assetService: {
        getAssetForGeneration: vi.fn(async () => ({
          primaryImageUrl: "https://images.example.com/face.webp",
          negativePrompt: null,
          faceEmbedding: null,
        })),
      } as never,
    });
    const app = createApp({
      requestId: "req-insufficient-video-credits",
      handler,
    });

    const response = await runSupertestOrSkip(() =>
      request(app).post("/preview/video/generate").send({
        prompt: "A cinematic shot.",
        model: "sora-2",
        characterAssetId: "char-123",
      }),
    );
    if (!response) return;

    const expectedKeyframeRefundKey = buildRefundKey([
      "preview-video",
      "req-insufficient-video-credits",
      "user-123",
      "keyframe",
    ]);

    expect(response.status).toBe(402);
    expect(response.body).toMatchObject({
      error: "Insufficient credits",
      code: "INSUFFICIENT_CREDITS",
    });
    expect(refundCreditsMock).toHaveBeenCalledWith(
      "user-123",
      2,
      expect.objectContaining({
        refundKey: expectedKeyframeRefundKey,
        reason: "video credits insufficient after keyframe reservation",
      }),
    );
  });

  it("preserves success payload compatibility (data + legacy top-level fields)", async () => {
    const createJobMock = vi.fn(async (payload: Record<string, unknown>) => ({
      id: "job-success",
      status: "queued",
      ...payload,
    }));
    const handler = createVideoGenerateHandler({
      videoGenerationService: {
        getModelAvailability: () => ({
          available: true,
          resolvedModelId: "sora-2",
        }),
      } as never,
      videoJobStore: {
        createJob: createJobMock,
        createJobWithReservation: buildAtomicReservation(createJobMock),
      } as never,
      userCreditService: {
        reserveCredits: vi.fn(async () => true),
        refundCredits: vi.fn(async () => true),
      } as never,
      keyframeService: null as never,
      faceSwapService: null as never,
      assetService: null as never,
    });
    const app = createApp({
      requestId: "req-success-contract",
      handler,
    });

    const response = await runSupertestOrSkip(() =>
      request(app).post("/preview/video/generate").send({
        prompt: "A cinematic shot.",
        model: "sora-2",
      }),
    );
    if (!response) return;

    expect(response.status).toBe(202);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      jobId: "job-success",
      status: "queued",
    });
    expect(response.body.jobId).toBe(response.body.data.jobId);
    expect(response.body.status).toBe(response.body.data.status);
    expect(response.body.creditsReserved).toBe(
      response.body.data.creditsReserved,
    );
    expect(response.body.creditsDeducted).toBe(
      response.body.data.creditsDeducted,
    );
  });
});
