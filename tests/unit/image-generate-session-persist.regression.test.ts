import type { ImageGenerationService } from "@services/image-generation/ImageGenerationService";
import type { RequestIdempotencyService } from "@services/admission/idempotency/RequestIdempotencyService";
import type { SessionService } from "@services/sessions/SessionService";
import type { SessionRecord } from "@services/sessions/types";
import type { CreditRefunder } from "@services/video-generation/refunds/ports";
import { InMemoryIdempotencyService } from "../integration/helpers/cross-mode/boundaryDoubles";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createImageGenerateHandler } from "@routes/preview/handlers/imageGenerate";
import { runSupertestOrSkip } from "./test-helpers/supertestSafeRequest";

// A generated picture's attachment is a separate fact: failed attachment keeps
// the owned media and immutable take identity. Free validation never reserves
// or refunds credits; an authenticated standalone picture has no attachment.
const SESSION_RECORD: SessionRecord = {
  id: "session-1",
  userId: "user-1",
  status: "active",
  hasContinuity: false,
  createdAt: new Date("2026-10-03T00:00:00Z"),
  updatedAt: new Date("2026-10-03T00:00:00Z"),
  prompt: {
    input: "a cat on a couch",
    output: "a cat on a couch",
    versions: [
      {
        versionId: "v1",
        signature: "sig-1",
        prompt: "a cat on a couch",
        timestamp: "2026-10-03T00:00:00Z",
      },
    ],
  },
};

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

const makeServices = (
  appendGenerationToVersion: SessionService["appendGenerationToVersion"],
) => {
  const imagePort = {
    generatePreview: vi
      .fn<ImageGenerationService["generatePreview"]>()
      .mockResolvedValue({
        imageUrl: "https://images.example.com/pic.webp",
        metadata: {
          model: "flux-schnell",
          aspectRatio: "16:9",
          duration: 1,
          generatedAt: "2026-10-03T00:00:00Z",
        },
      }),
  } satisfies Pick<ImageGenerationService, "generatePreview">;
  const sessionPort = {
    appendGenerationToVersion,
    requireOwnedSession: async (
      uid: string,
      sessionId: string,
    ): Promise<SessionRecord> => {
      if (uid !== SESSION_RECORD.userId || sessionId !== SESSION_RECORD.id)
        throw new Error("Session unavailable to this creator");
      return SESSION_RECORD;
    },
  } satisfies Pick<
    SessionService,
    "appendGenerationToVersion" | "requireOwnedSession"
  >;
  const credits = {
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
  return {
    imageGenerationService: imagePort as unknown as ImageGenerationService,
    userCreditService: credits,
    sessionService: sessionPort as SessionService,
    requestIdempotencyService:
      new InMemoryIdempotencyService() as unknown as RequestIdempotencyService,
  };
};

describe("imageGenerate session persistence (M5 D4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists a picture generation record and returns generationId when a session is supplied", async () => {
    const appendGenerationToVersion = vi.fn<
      SessionService["appendGenerationToVersion"]
    >(
      async (
        _userId: string,
        _sessionId: string,
        _promptVersionId: string,
        _record: Record<string, unknown>,
      ): Promise<SessionRecord> => SESSION_RECORD,
    );
    const app = createApp(
      createImageGenerateHandler(makeServices(appendGenerationToVersion)),
    );

    const res = await runSupertestOrSkip(() =>
      request(app)
        .post("/preview/generate")
        .set("Idempotency-Key", "picture-persist-1")
        .send({
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
    const appendGenerationToVersion = vi.fn<
      SessionService["appendGenerationToVersion"]
    >(async (): Promise<SessionRecord> => {
      throw new Error("firestore unavailable");
    });
    const services = makeServices(appendGenerationToVersion);
    const app = createApp(createImageGenerateHandler(services));

    const res = await runSupertestOrSkip(() =>
      request(app)
        .post("/preview/generate")
        .set("Idempotency-Key", "picture-persist-1")
        .send({
          prompt: "a cat on a couch",
          sessionId: "session-1",
          promptVersionId: "v1",
        }),
    );
    if (!res) return;

    // The picture was made. Free validation preserves it without credit activity.
    expect(res.status).toBe(200);
    expect(res.body?.data?.imageUrl).toBe(
      "https://images.example.com/pic.webp",
    );
    expect(services.userCreditService.refundCredits).not.toHaveBeenCalled();
    expect(services.userCreditService.reserveCredits).not.toHaveBeenCalled();

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
    const appendGenerationToVersion = vi.fn<
      SessionService["appendGenerationToVersion"]
    >(
      async (
        _userId: string,
        _sessionId: string,
        _promptVersionId: string,
        _record: Record<string, unknown>,
      ): Promise<SessionRecord> => {
        throw new Error("firestore unavailable");
      },
    );
    const app = createApp(
      createImageGenerateHandler(makeServices(appendGenerationToVersion)),
    );

    const res = await runSupertestOrSkip(() =>
      request(app)
        .post("/preview/generate")
        .set("Idempotency-Key", "picture-persist-1")
        .send({
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
    const appendGenerationToVersion = vi.fn<
      SessionService["appendGenerationToVersion"]
    >(async (): Promise<SessionRecord> => SESSION_RECORD);
    const app = createApp(
      createImageGenerateHandler(makeServices(appendGenerationToVersion)),
    );

    const res = await runSupertestOrSkip(() =>
      request(app)
        .post("/preview/generate")
        .set("Idempotency-Key", "picture-persist-1")
        .send({
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

  it("rejects a foreign destination before generation or attachment", async () => {
    const append = vi
      .fn<SessionService["appendGenerationToVersion"]>()
      .mockResolvedValue(SESSION_RECORD);
    const services = makeServices(append);
    const app = createApp(createImageGenerateHandler(services));
    const response = await request(app)
      .post("/preview/generate")
      .set("Idempotency-Key", "foreign-session-1")
      .send({
        prompt: "a cat",
        sessionId: "another-session",
        promptVersionId: "v1",
      });
    expect(response.status).toBe(404);
    expect(
      services.imageGenerationService.generatePreview,
    ).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it("does not persist (and returns no generationId) for an authenticated standalone quick picture", async () => {
    const appendGenerationToVersion = vi.fn<
      SessionService["appendGenerationToVersion"]
    >(
      async (
        _userId: string,
        _sessionId: string,
        _promptVersionId: string,
        _record: Record<string, unknown>,
      ): Promise<SessionRecord> => SESSION_RECORD,
    );
    const app = createApp(
      createImageGenerateHandler(makeServices(appendGenerationToVersion)),
    );

    const res = await runSupertestOrSkip(() =>
      request(app)
        .post("/preview/generate")
        .set("Idempotency-Key", "picture-persist-1")
        .send({ prompt: "a cat" }),
    );
    if (!res) return;

    expect(appendGenerationToVersion).not.toHaveBeenCalled();
    expect(res.body?.data?.generationId).toBeUndefined();
    // No session was named, so there is no attachment fact to report — an
    // standalone picture is not a failed attachment.
    expect(res.body?.data?.attachment).toBeUndefined();
  });
});
