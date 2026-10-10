import type { ImageGenerationService } from "@services/image-generation/ImageGenerationService";
import type { RequestIdempotencyService } from "@services/admission/idempotency/RequestIdempotencyService";
import { InMemoryIdempotencyService } from "../integration/helpers/cross-mode/boundaryDoubles";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createImageGenerateHandler } from "@routes/preview/handlers/imageGenerate";
import { runSupertestOrSkip } from "./test-helpers/supertestSafeRequest";

const createApp = (handler: express.RequestHandler) => {
  const app = express();
  app.use((req, _res, next) => {
    const r = req as express.Request & {
      id?: string;
      user?: { uid?: string };
    };
    r.id = "req-truth-1";
    r.user = { uid: "user-1" };
    next();
  });
  app.use(express.json());
  app.post("/preview/generate", handler);
  return app;
};

describe("imageGenerate prompt truth (M2b D3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends the golden-path draft prompt to the image service verbatim", async () => {
    const generatePreviewMock = vi.fn<
      ImageGenerationService["generatePreview"]
    >(async () => ({
      imageUrl: "https://images.example.com/generated.webp",
      metadata: {
        model: "test-model",
        aspectRatio: "16:9",
        duration: 1,
        generatedAt: "2026-10-03T00:00:00Z",
      },
    }));

    const imagePort = { generatePreview: generatePreviewMock } satisfies Pick<
      ImageGenerationService,
      "generatePreview"
    >;
    const handler = createImageGenerateHandler({
      imageGenerationService: imagePort as unknown as ImageGenerationService,
      requestIdempotencyService:
        new InMemoryIdempotencyService() as unknown as RequestIdempotencyService,
      userCreditService: null,
    });

    const app = createApp(handler);

    // A video-shaped prompt is exactly what the old Gemini transformer would
    // have LLM-rewritten. ADR-0010 truth: the picture model receives it
    // verbatim — the rewrite path no longer exists.
    const videoShapedPrompt = "A runner at dawn, camera pans left, 6 seconds";
    const response = await runSupertestOrSkip(() =>
      request(app)
        .post("/preview/generate")
        .set("Idempotency-Key", "prompt-truth-1")
        .send({ prompt: videoShapedPrompt }),
    );
    if (!response) return;

    expect(response.status).toBe(200);
    expect(generatePreviewMock).toHaveBeenCalledTimes(1);
    expect(generatePreviewMock.mock.calls[0]?.[0]).toBe(videoShapedPrompt);
  });
});
