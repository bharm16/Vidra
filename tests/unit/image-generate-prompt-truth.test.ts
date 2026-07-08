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
    const generatePreviewMock = vi.fn(
      async (_prompt: string, _options: Record<string, unknown>) => ({
        imageUrl: "https://images.example.com/generated.webp",
        metadata: { model: "test-model", aspectRatio: "16:9" },
      }),
    );

    const handler = createImageGenerateHandler({
      imageGenerationService: {
        generatePreview: generatePreviewMock,
      } as never,
      userCreditService: {
        reserveCredits: vi.fn(async () => true),
        refundCredits: vi.fn(async () => true),
      } as never,
      assetService: null as never,
    });

    const app = createApp(handler);

    // A video-shaped prompt is exactly what the old Gemini transformer would
    // have LLM-rewritten. ADR-0010 truth: the picture model receives it
    // verbatim — the rewrite path no longer exists.
    const videoShapedPrompt = "A runner at dawn, camera pans left, 6 seconds";
    const response = await runSupertestOrSkip(() =>
      request(app)
        .post("/preview/generate")
        .send({ prompt: videoShapedPrompt }),
    );
    if (!response) return;

    expect(generatePreviewMock).toHaveBeenCalledTimes(1);
    expect(generatePreviewMock.mock.calls[0]?.[0]).toBe(videoShapedPrompt);
  });
});
