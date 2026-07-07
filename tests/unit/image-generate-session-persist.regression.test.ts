import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createImageGenerateHandler } from "@routes/preview/handlers/imageGenerate";
import { runSupertestOrSkip } from "./test-helpers/supertestSafeRequest";

// M5 / D4 (ADR-0013): a quick picture becomes a persisted generation record
// when the client supplies sessionId + promptVersionId, so it can be a node in
// the space. Without them it stays anonymous (backward compatible).

const createApp = (handler: express.RequestHandler) => {
  const app = express();
  app.use((req, _res, next) => {
    const r = req as express.Request & {
      id?: string;
      user?: { uid?: string };
    };
    r.id = "req-persist-1";
    r.user = { uid: "user-1" };
    next();
  });
  app.use(express.json());
  app.post("/preview/generate", handler);
  return app;
};

const makeServices = (appendGenerationToVersion: ReturnType<typeof vi.fn>) => ({
  imageGenerationService: {
    generatePreview: vi.fn(async () => ({
      imageUrl: "https://images.example.com/pic.webp",
      metadata: { model: "flux-schnell", aspectRatio: "16:9" },
    })),
  } as never,
  userCreditService: {
    reserveCredits: vi.fn(async () => true),
    refundCredits: vi.fn(async () => true),
    getBalance: vi.fn(async () => 5),
  } as never,
  assetService: null as never,
  sessionService: { appendGenerationToVersion } as never,
});

describe("imageGenerate session persistence (M5 D4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists a picture generation record and returns generationId when a session is supplied", async () => {
    const appendGenerationToVersion = vi.fn(
      async (
        _userId: string,
        _sessionId: string,
        _promptVersionId: string,
        _record: Record<string, unknown>,
      ): Promise<void> => undefined,
    );
    const app = createApp(
      createImageGenerateHandler(makeServices(appendGenerationToVersion)),
    );

    const res = await runSupertestOrSkip(() =>
      request(app).post("/preview/generate").send({
        prompt: "a cat on a couch",
        sessionId: "session-1",
        promptVersionId: "v1",
      }),
    );
    if (!res) return;

    expect(appendGenerationToVersion).toHaveBeenCalledTimes(1);
    const [userId, sessionId, promptVersionId, record] =
      appendGenerationToVersion.mock.calls[0]!;
    expect(userId).toBe("user-1");
    expect(sessionId).toBe("session-1");
    expect(promptVersionId).toBe("v1");
    expect(record).toMatchObject({
      mediaType: "image",
      status: "completed",
      prompt: "a cat on a couch",
      promptVersionId: "v1",
      mediaUrls: ["https://images.example.com/pic.webp"],
    });
    expect(typeof record.id).toBe("string");
    expect(res.body?.data?.generationId).toBe(record.id);
  });

  it("does not persist (and returns no generationId) for an anonymous quick picture", async () => {
    const appendGenerationToVersion = vi.fn(
      async (
        _userId: string,
        _sessionId: string,
        _promptVersionId: string,
        _record: Record<string, unknown>,
      ): Promise<void> => undefined,
    );
    const app = createApp(
      createImageGenerateHandler(makeServices(appendGenerationToVersion)),
    );

    const res = await runSupertestOrSkip(() =>
      request(app).post("/preview/generate").send({ prompt: "a cat" }),
    );
    if (!res) return;

    expect(appendGenerationToVersion).not.toHaveBeenCalled();
    expect(res.body?.data?.generationId).toBeUndefined();
  });
});
