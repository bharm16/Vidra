import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asyncHandler } from "@middleware/asyncHandler";
import { createImageGenerateHandler } from "@routes/preview/handlers/imageGenerate";
import type { CreditRefunder } from "@services/video-generation/refunds/ports";
import type { ImageGenerationService } from "@services/image-generation/ImageGenerationService";
import type { RequestIdempotencyService } from "@services/admission/idempotency/RequestIdempotencyService";
import { InMemoryIdempotencyService } from "../integration/helpers/cross-mode/boundaryDoubles";

const PICTURE = {
  imageUrl: "https://images.example.com/generated.webp",
  metadata: {
    model: "flux-schnell",
    aspectRatio: "16:9",
    duration: 1,
    generatedAt: "2026-10-03T00:00:00Z",
  },
} satisfies Awaited<ReturnType<ImageGenerationService["generatePreview"]>>;
function zeroCreditPort() {
  return {
    reserveCredits: vi
      .fn<(userId: string, cost: number) => Promise<boolean>>()
      .mockResolvedValue(false),
    refundCredits: vi
      .fn<CreditRefunder["refundCredits"]>()
      .mockResolvedValue(false),
    getBalance: vi
      .fn<(userId: string) => Promise<number>>()
      .mockResolvedValue(0),
    checkAndReserveInTransaction: vi
      .fn<
        (
          transaction: FirebaseFirestore.Transaction,
          userId: string,
          cost: number,
        ) => Promise<
          | { ok: true }
          | { ok: false; reason: "user_not_found" | "insufficient_credits" }
        >
      >()
      .mockResolvedValue({ ok: false, reason: "insufficient_credits" }),
  };
}
function setup(
  options: {
    authenticated?: boolean;
    credits?: ReturnType<typeof zeroCreditPort> | null;
    missingProvider?: boolean;
    missingIdempotency?: boolean;
  } = {},
) {
  const generate = vi
    .fn<ImageGenerationService["generatePreview"]>()
    .mockResolvedValue(PICTURE);
  const imagePort = { generatePreview: generate } satisfies Pick<
    ImageGenerationService,
    "generatePreview"
  >;
  const receipts = new InMemoryIdempotencyService();
  const credits =
    options.credits === undefined ? zeroCreditPort() : options.credits;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const authRequest = req as express.Request & {
      id?: string;
      user?: { uid: string };
    };
    authRequest.id = "req-image-1";
    if (options.authenticated !== false) authRequest.user = { uid: "user-1" };
    next();
  });
  app.post(
    "/preview/generate",
    asyncHandler(
      createImageGenerateHandler({
        imageGenerationService: options.missingProvider
          ? null
          : (imagePort as unknown as ImageGenerationService),
        userCreditService: credits,
        requestIdempotencyService: options.missingIdempotency
          ? null
          : (receipts as unknown as RequestIdempotencyService),
      }),
    ),
  );
  return { app, generate, credits, receipts };
}
function post(
  app: express.Express,
  body: Record<string, unknown> = { prompt: "A dramatic portrait" },
  key = "picture-request-1",
) {
  return request(app)
    .post("/preview/generate")
    .set("Idempotency-Key", key)
    .send(body);
}
function expectNoCreditCalls(
  credits: ReturnType<typeof zeroCreditPort> | null,
): void {
  if (!credits) return;
  expect(credits.reserveCredits).not.toHaveBeenCalled();
  expect(credits.refundCredits).not.toHaveBeenCalled();
  expect(credits.getBalance).not.toHaveBeenCalled();
  expect(credits.checkAndReserveInTransaction).not.toHaveBeenCalled();
}

describe("free image HTTP intake and failure handling (#124)", () => {
  beforeEach(() => vi.clearAllMocks());
  it("accepts zero-balance generation without reservations or refunds; lost response replays the same picture", async () => {
    const h = setup();
    const first = await post(h.app);
    const replay = await post(h.app);
    expect(first.status).toBe(200);
    expect(replay.body).toEqual(first.body);
    expect(h.generate).toHaveBeenCalledTimes(1);
    expectNoCreditCalls(h.credits);
  });
  it("runs without any credit service", async () => {
    const h = setup({ credits: null });
    expect((await post(h.app)).status).toBe(200);
    expect(h.generate).toHaveBeenCalledTimes(1);
  });
  it("reports provider failure without refunding and retains its claim against immediate duplicate dispatch", async () => {
    const h = setup();
    h.generate.mockRejectedValueOnce(new Error("provider down"));
    const failed = await post(h.app);
    const retry = await post(h.app);
    expect(failed.status).toBe(500);
    expect(failed.body).toMatchObject({
      error: "Image generation failed",
      code: "GENERATION_FAILED",
      requestId: "req-image-1",
    });
    expect(retry.status).toBe(409);
    expect(h.generate).toHaveBeenCalledTimes(1);
    expectNoCreditCalls(h.credits);
  });
  it("preserves controlled service-unavailable response without credit side effects", async () => {
    const h = setup();
    h.generate.mockRejectedValueOnce(
      Object.assign(new Error("provider unavailable"), { statusCode: 503 }),
    );
    const response = await post(h.app);
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      error: "Image generation failed",
      code: "SERVICE_UNAVAILABLE",
    });
    expectNoCreditCalls(h.credits);
  });
  it("requires authentication before provider dispatch", async () => {
    const h = setup({ authenticated: false });
    const response = await post(h.app);
    expect(response.status).toBe(401);
    expect(response.body.code).toBe("AUTH_REQUIRED");
    expect(h.generate).not.toHaveBeenCalled();
    expectNoCreditCalls(h.credits);
  });
  it("requires a durable idempotency key and store", async () => {
    const h = setup();
    expect(
      (
        await request(h.app)
          .post("/preview/generate")
          .send({ prompt: "A city" })
      ).status,
    ).toBe(400);
    expect(h.generate).not.toHaveBeenCalled();
    const unavailable = setup({ missingIdempotency: true });
    expect((await post(unavailable.app)).status).toBe(503);
    expect(unavailable.generate).not.toHaveBeenCalled();
  });
  it("refuses reused keys with different picture inputs", async () => {
    const h = setup();
    expect((await post(h.app)).status).toBe(200);
    expect((await post(h.app, { prompt: "A different portrait" })).status).toBe(
      409,
    );
    expect(h.generate).toHaveBeenCalledTimes(1);
    expectNoCreditCalls(h.credits);
  });
  it.each([
    {
      name: "provider type",
      body: { prompt: "A portrait", provider: 123 },
      message: "provider must be a string",
    },
    {
      name: "unsupported provider",
      body: { prompt: "A portrait", provider: "unknown-provider" },
      message: "Unsupported provider: unknown-provider",
    },
    {
      name: "speedMode",
      body: { prompt: "A portrait", speedMode: "warp-speed" },
      message:
        "speedMode must be one of: Lightly Juiced, Juiced, Extra Juiced, Real Time",
    },
    {
      name: "seed",
      body: { prompt: "A portrait", seed: "42" },
      message: "seed must be a finite number",
    },
    {
      name: "outputQuality",
      body: { prompt: "A portrait", outputQuality: "high" },
      message: "outputQuality must be a finite number",
    },
    {
      name: "aspectRatio",
      body: { prompt: "A portrait", aspectRatio: 169 },
      message: "aspectRatio must be a string",
    },
    {
      name: "inputImageUrl",
      body: { prompt: "A portrait", inputImageUrl: "  " },
      message: "inputImageUrl must be a non-empty string",
    },
  ])("refuses invalid $name before dispatch", async ({ body, message }) => {
    const h = setup();
    const response = await post(h.app, body);
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: message,
      code: "INVALID_REQUEST",
    });
    expect(h.generate).not.toHaveBeenCalled();
    expectNoCreditCalls(h.credits);
  });
  it("requires an input picture for the explicit Kontext provider", async () => {
    const h = setup();
    const response = await post(h.app, {
      prompt: "A portrait",
      provider: "kontext",
    });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_REQUEST");
    expect(h.generate).not.toHaveBeenCalled();
  });
  it("fails closed when the picture provider service is absent", async () => {
    const h = setup({ missingProvider: true });
    const response = await post(h.app);
    expect(response.status).toBe(503);
    expect(response.body.code).toBe("SERVICE_UNAVAILABLE");
    expectNoCreditCalls(h.credits);
  });
});
