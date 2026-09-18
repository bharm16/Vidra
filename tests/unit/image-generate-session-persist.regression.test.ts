import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createImageGenerateHandler } from "@routes/preview/handlers/imageGenerate";
import { runSupertestOrSkip } from "./test-helpers/supertestSafeRequest";

// M5 / D4 (ADR-0013): a quick picture becomes a persisted generation record
// when the client supplies sessionId + promptVersionId, so it can be a node in
// the space. Without them it stays anonymous (backward compatible).
//
// ADR-0022 decision 6 (the narrow freeze exception for session attachment):
// "the media was generated" and "the take reached its session" are two facts,
// not one. The append used to be a swallowed catch whose only signal was an
// ABSENT generationId — indistinguishable from the anonymous case above. The
// handler now answers both questions explicitly.
//
// The policy argument is already written down in this repo, one layer over:
// inlineProcessor.durable-copy.regression.test.ts pins the OPPOSITE treatment
// for the durable storage copy — a post-completion step that must fail loudly
// and refund rather than be best-effort. Attachment differs on exactly one
// point: the media IS durable and the creator's credit already bought it, so
// the honest outcome is "made but not saved, retry it", not a refund.

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

  it("regression: a rejecting session write returns an explicit failed attachment, keeps the media, and never refunds", async () => {
    const appendGenerationToVersion = vi.fn(
      async (): Promise<void> => {
        throw new Error("firestore unavailable");
      },
    );
    const services = makeServices(appendGenerationToVersion);
    const app = createApp(createImageGenerateHandler(services));

    const res = await runSupertestOrSkip(() =>
      request(app).post("/preview/generate").send({
        prompt: "a cat on a couch",
        sessionId: "session-1",
        promptVersionId: "v1",
      }),
    );
    if (!res) return;

    // The picture was made. The creator keeps it, and keeps paying for it.
    expect(res.status).toBe(200);
    expect(res.body?.data?.imageUrl).toBe("https://images.example.com/pic.webp");
    expect(
      (services.userCreditService as unknown as { refundCredits: ReturnType<typeof vi.fn> })
        .refundCredits,
    ).not.toHaveBeenCalled();

    // ...and the second fact is stated rather than swallowed.
    expect(res.body?.data?.attachment?.state).toBe("failed");
    expect(res.body?.data?.attachment?.sessionId).toBe("session-1");
    expect(res.body?.data?.attachment?.promptVersionId).toBe("v1");
    expect(typeof res.body?.data?.attachment?.generationId).toBe("string");
    // `generationId` at the top level has always meant "this take is in the
    // session". A failed attachment must not claim it.
    expect(res.body?.data?.generationId).toBeUndefined();
  });

  it("hands back the exact record that failed to attach, under the take identity already minted", async () => {
    const appendGenerationToVersion = vi.fn(
      async (
        _userId: string,
        _sessionId: string,
        _promptVersionId: string,
        _record: Record<string, unknown>,
      ): Promise<void> => {
        throw new Error("firestore unavailable");
      },
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

    // randomUUID() runs before the append, so the take identity survives the
    // failure: a retry re-sends THIS record rather than minting a new one.
    const attempted = appendGenerationToVersion.mock.calls[0]![3];
    expect(res.body?.data?.attachment?.record).toMatchObject({
      id: attempted.id,
      mediaType: "image",
      status: "completed",
      promptVersionId: "v1",
      mediaUrls: ["https://images.example.com/pic.webp"],
    });
    expect(res.body?.data?.attachment?.generationId).toBe(attempted.id);
  });

  it("states the attachment explicitly when the session write succeeds", async () => {
    const appendGenerationToVersion = vi.fn(
      async (): Promise<void> => undefined,
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

    expect(res.body?.data?.attachment?.state).toBe("attached");
    expect(res.body?.data?.attachment?.generationId).toBe(
      res.body?.data?.generationId,
    );
    // Nothing to retry, so nothing to hand back.
    expect(res.body?.data?.attachment?.record).toBeUndefined();
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
    // No session was named, so there is no attachment fact to report — an
    // anonymous picture is not a failed attachment.
    expect(res.body?.data?.attachment).toBeUndefined();
  });
});
