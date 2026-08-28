import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRefundKey } from "@services/credits/refundGuard";
import { createImageGenerateHandler } from "@routes/preview/handlers/imageGenerate";
import { runSupertestOrSkip } from "./test-helpers/supertestSafeRequest";
import type { RouteCreditService } from "@services/credits/ports";

/** RouteCreditService stub — no `as never`: the routes seam is a structural port. */
function stubCreditService(
  overrides: Partial<RouteCreditService> = {},
): RouteCreditService {
  return {
    reserveCredits: vi.fn(async () => true),
    refundCredits: vi.fn(async () => true),
    getBalance: vi.fn(async () => 0),
    checkAndReserveInTransaction: vi.fn(async () => ({ ok: true as const })),
    ...overrides,
  };
}

const createApp = (
  handler: express.RequestHandler,
  requestId = "req-image-1",
  userId: string | null = "user-1",
) => {
  const app = express();
  app.use((req, _res, next) => {
    (req as express.Request & { id?: string }).id = requestId;
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
  app.post("/preview/generate", handler);
  return app;
};

describe("imageGenerate refunds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reserves credits, runs generation, and does not refund on success", async () => {
    const reserveCreditsMock = vi.fn(async () => true);
    const refundCreditsMock = vi.fn(async () => true);
    const generatePreviewMock = vi.fn(async () => ({
      imageUrl: "https://images.example.com/generated.webp",
      metadata: {
        model: "test-model",
        aspectRatio: "16:9",
      },
    }));

    const handler = createImageGenerateHandler({
      imageGenerationService: {
        generatePreview: generatePreviewMock,
      } as never,
      userCreditService: stubCreditService({
        reserveCredits: reserveCreditsMock,
        refundCredits: refundCreditsMock,
      }),
      assetService: null as never,
    });

    const app = createApp(handler, "req-img-success-1");

    const response = await runSupertestOrSkip(() =>
      request(app).post("/preview/generate").send({
        prompt: "A dramatic portrait",
      }),
    );
    if (!response) return;

    expect(response.status).toBe(200);
    expect(reserveCreditsMock).toHaveBeenCalledWith("user-1", 1);
    expect(generatePreviewMock).toHaveBeenCalledTimes(1);
    expect(refundCreditsMock).not.toHaveBeenCalled();
  });

  it("rejects generation when reservation fails and never starts provider", async () => {
    const reserveCreditsMock = vi.fn(async () => false);
    const refundCreditsMock = vi.fn(async () => true);
    const generatePreviewMock = vi.fn();

    const handler = createImageGenerateHandler({
      imageGenerationService: {
        generatePreview: generatePreviewMock,
      } as never,
      userCreditService: stubCreditService({
        reserveCredits: reserveCreditsMock,
        refundCredits: refundCreditsMock,
      }),
      assetService: null as never,
    });
    const app = createApp(handler, "req-img-insufficient-1");
    const response = await runSupertestOrSkip(() =>
      request(app)
        .post("/preview/generate")
        .send({ prompt: "A dramatic portrait" }),
    );
    if (!response) return;

    expect(response.status).toBe(402);
    expect(response.body).toMatchObject({
      error: "Insufficient credits",
      code: "INSUFFICIENT_CREDITS",
      requestId: "req-img-insufficient-1",
    });
    expect(reserveCreditsMock).toHaveBeenCalledWith("user-1", 1);
    expect(generatePreviewMock).not.toHaveBeenCalled();
    expect(refundCreditsMock).not.toHaveBeenCalled();
  });

  it("refunds reserved preview credit with deterministic key when generation fails", async () => {
    const refundCreditsMock = vi.fn(async () => true);

    const handler = createImageGenerateHandler({
      imageGenerationService: {
        generatePreview: vi.fn(async () => {
          throw new Error("provider down");
        }),
      } as never,
      userCreditService: {
        reserveCredits: vi.fn(async () => true),
        refundCredits: refundCreditsMock,
      } as never,
      assetService: null as never,
    });

    const app = createApp(handler, "req-img-1");

    const response = await runSupertestOrSkip(() =>
      request(app).post("/preview/generate").send({
        prompt: "A dramatic portrait",
      }),
    );
    if (!response) return;

    const expectedRefundKey = buildRefundKey([
      "preview-image",
      "req-img-1",
      "user-1",
      "generation",
    ]);

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({
      error: "Image generation failed",
      code: "GENERATION_FAILED",
      requestId: "req-img-1",
    });
    expect(refundCreditsMock).toHaveBeenCalledWith(
      "user-1",
      1,
      expect.objectContaining({
        refundKey: expectedRefundKey,
        reason: "preview image generation failed",
      }),
    );
  });

  it("returns 401 when authentication is missing", async () => {
    const reserveCreditsMock = vi.fn(async () => true);
    const generatePreviewMock = vi.fn();

    const handler = createImageGenerateHandler({
      imageGenerationService: {
        generatePreview: generatePreviewMock,
      } as never,
      userCreditService: {
        reserveCredits: reserveCreditsMock,
        refundCredits: vi.fn(async () => true),
      } as never,
      assetService: null as never,
    });

    const app = createApp(handler, "req-img-auth-1", null);
    const response = await runSupertestOrSkip(() =>
      request(app)
        .post("/preview/generate")
        .send({ prompt: "A dramatic portrait" }),
    );
    if (!response) return;

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      error: "Authentication required",
      code: "AUTH_REQUIRED",
      requestId: "req-img-auth-1",
    });
    expect(reserveCreditsMock).not.toHaveBeenCalled();
    expect(generatePreviewMock).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "provider type",
      body: { prompt: "A dramatic portrait", provider: 123 },
      message: "provider must be a string",
    },
    {
      name: "unsupported provider",
      body: { prompt: "A dramatic portrait", provider: "unknown-provider" },
      message: "Unsupported provider: unknown-provider",
    },
    {
      name: "speedMode",
      body: { prompt: "A dramatic portrait", speedMode: "warp-speed" },
      message:
        "speedMode must be one of: Lightly Juiced, Juiced, Extra Juiced, Real Time",
    },
    {
      name: "seed",
      body: { prompt: "A dramatic portrait", seed: "42" },
      message: "seed must be a finite number",
    },
    {
      name: "outputQuality",
      body: { prompt: "A dramatic portrait", outputQuality: "high" },
      message: "outputQuality must be a finite number",
    },
    {
      name: "aspectRatio",
      body: { prompt: "A dramatic portrait", aspectRatio: 169 },
      message: "aspectRatio must be a string",
    },
    {
      name: "inputImageUrl",
      body: { prompt: "A dramatic portrait", inputImageUrl: "   " },
      message: "inputImageUrl must be a non-empty string",
    },
  ])("returns 400 for invalid $name", async ({ body, message }) => {
    const reserveCreditsMock = vi.fn(async () => true);
    const generatePreviewMock = vi.fn();

    const handler = createImageGenerateHandler({
      imageGenerationService: {
        generatePreview: generatePreviewMock,
      } as never,
      userCreditService: {
        reserveCredits: reserveCreditsMock,
        refundCredits: vi.fn(async () => true),
      } as never,
      assetService: null as never,
    });

    const app = createApp(handler, "req-img-invalid-1");
    const response = await runSupertestOrSkip(() =>
      request(app).post("/preview/generate").send(body),
    );
    if (!response) return;

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: message,
      code: "INVALID_REQUEST",
      requestId: "req-img-invalid-1",
    });
    expect(reserveCreditsMock).not.toHaveBeenCalled();
    expect(generatePreviewMock).not.toHaveBeenCalled();
  });

  it("returns 400 when kontext provider is used without inputImageUrl", async () => {
    const reserveCreditsMock = vi.fn(async () => true);
    const generatePreviewMock = vi.fn();
    const handler = createImageGenerateHandler({
      imageGenerationService: {
        generatePreview: generatePreviewMock,
      } as never,
      userCreditService: {
        reserveCredits: reserveCreditsMock,
        refundCredits: vi.fn(async () => true),
      } as never,
      assetService: null as never,
    });

    const app = createApp(handler, "req-img-kontext-1");
    const response = await runSupertestOrSkip(() =>
      request(app).post("/preview/generate").send({
        prompt: "A dramatic portrait",
        provider: "kontext",
      }),
    );
    if (!response) return;

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error:
        "inputImageUrl is required when using the replicate-flux-kontext-fast provider",
      code: "INVALID_REQUEST",
      requestId: "req-img-kontext-1",
    });
    expect(reserveCreditsMock).not.toHaveBeenCalled();
    expect(generatePreviewMock).not.toHaveBeenCalled();
  });

  it("returns 503 when image generation service is missing", async () => {
    const reserveCreditsMock = vi.fn(async () => true);
    const handler = createImageGenerateHandler({
      imageGenerationService: null as never,
      userCreditService: {
        reserveCredits: reserveCreditsMock,
        refundCredits: vi.fn(async () => true),
      } as never,
      assetService: null as never,
    });

    const app = createApp(handler, "req-img-missing-service-1");
    const response = await runSupertestOrSkip(() =>
      request(app)
        .post("/preview/generate")
        .send({ prompt: "A dramatic portrait" }),
    );
    if (!response) return;

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      error: "Image generation service is not available",
      code: "SERVICE_UNAVAILABLE",
      requestId: "req-img-missing-service-1",
    });
    expect(reserveCreditsMock).not.toHaveBeenCalled();
  });

  it("returns 503 when credit service is missing", async () => {
    const generatePreviewMock = vi.fn();
    const handler = createImageGenerateHandler({
      imageGenerationService: {
        generatePreview: generatePreviewMock,
      } as never,
      userCreditService: null,
      assetService: null as never,
    });

    const app = createApp(handler, "req-img-missing-credits-1");
    const response = await runSupertestOrSkip(() =>
      request(app)
        .post("/preview/generate")
        .send({ prompt: "A dramatic portrait" }),
    );
    if (!response) return;

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      error: "Image generation service is not available",
      code: "SERVICE_UNAVAILABLE",
      requestId: "req-img-missing-credits-1",
    });
    expect(generatePreviewMock).not.toHaveBeenCalled();
  });

  it("maps statusCode 503 generation errors to SERVICE_UNAVAILABLE", async () => {
    const reserveCreditsMock = vi.fn(async () => true);
    const refundCreditsMock = vi.fn(async () => true);
    const generationError = Object.assign(new Error("provider unavailable"), {
      statusCode: 503,
    });
    const handler = createImageGenerateHandler({
      imageGenerationService: {
        generatePreview: vi.fn(async () => {
          throw generationError;
        }),
      } as never,
      userCreditService: stubCreditService({
        reserveCredits: reserveCreditsMock,
        refundCredits: refundCreditsMock,
      }),
      assetService: null as never,
    });

    const app = createApp(handler, "req-img-503-1");
    const response = await runSupertestOrSkip(() =>
      request(app)
        .post("/preview/generate")
        .send({ prompt: "A dramatic portrait" }),
    );
    if (!response) return;

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      error: "Image generation failed",
      code: "SERVICE_UNAVAILABLE",
      requestId: "req-img-503-1",
    });
    expect(reserveCreditsMock).toHaveBeenCalledWith("user-1", 1);
    expect(refundCreditsMock).toHaveBeenCalledWith(
      "user-1",
      1,
      expect.objectContaining({
        reason: "preview image generation failed",
      }),
    );
  });
});
