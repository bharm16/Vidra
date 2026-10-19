import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createOwedPictureAttachmentsHandler,
  createRetryPictureAttachmentHandler,
} from "../handlers/pictureAttachments";
import {
  attachTakeWithOwedTracking,
  type OwedTakeAttachment,
  type OwedTakeAttachmentInput,
  type OwedTakeAttachmentStore,
} from "@services/sessions/attachTakeWithOwedTracking";
import { buildCompletedTakeRecord } from "@services/sessions/takeRecord";
import type { TakeAttachment } from "@shared/schemas/attachment.schemas";
import type { SessionRecord } from "@server/domain/session/types";
import type { SessionService } from "@services/sessions/SessionService";

/**
 * ADR-0022 decision 6 (issue #133) — the quick-picture recovery path.
 *
 * A generated take is not admitted, so it has no idempotency snapshot to resume
 * from. A quick picture whose session write failed left a durable owed record
 * (`attachTakeWithOwedTracking`), and these doors are how a reloaded client
 * finds and repairs it. The quick-picture generate route is retired; previously
 * owed takes remain recoverable.
 *
 * This proves the three recovery guarantees against real handlers with plain
 * injected doubles (no internal module mocked):
 *  - a failed attach is durable and discoverable, never a silent loss;
 *  - repair re-attaches the SAME take with no regeneration and no re-store;
 *  - a destination that was deleted is reported truthfully, never as saved.
 */

const OWNER = "user-1";
const SESSION = "session-1";
const VERSION = "v1";

/** An in-memory owed-attachment ledger — the Firestore store's port double. */
function makeOwedStore(): OwedTakeAttachmentStore & {
  readonly docs: Map<string, OwedTakeAttachment>;
} {
  const docs = new Map<string, OwedTakeAttachment>();
  return {
    docs,
    async recordOwedPending(input: OwedTakeAttachmentInput): Promise<void> {
      docs.set(input.generationId, {
        userId: input.userId,
        generationId: input.generationId,
        sessionId: input.sessionId,
        promptVersionId: input.promptVersionId,
        state: "pending",
        record: input.record,
      });
    },
    async settleOwed(
      input: OwedTakeAttachmentInput,
      attachment: TakeAttachment,
    ): Promise<void> {
      if (attachment.state === "attached") {
        docs.delete(input.generationId);
        return;
      }
      docs.set(input.generationId, {
        userId: input.userId,
        generationId: input.generationId,
        sessionId: input.sessionId,
        promptVersionId: input.promptVersionId,
        state: "failed",
        ...(attachment.reason ? { reason: attachment.reason } : {}),
        record: input.record,
      });
    },
    async listOwedForSession(userId, sessionId): Promise<OwedTakeAttachment[]> {
      return [...docs.values()].filter(
        (d) => d.userId === userId && d.sessionId === sessionId,
      );
    },
    async getOwned(
      userId,
      generationId,
    ): Promise<OwedTakeAttachment | undefined> {
      const doc = docs.get(generationId);
      return doc && doc.userId === userId ? doc : undefined;
    },
  };
}

/**
 * A session append double the whole app shares. `appendGenerationToVersion` is
 * de-duplicating by take id in production; here it records the calls and can be
 * toggled to fail (a Firestore blip) or to throw not-found (a deleted session).
 */
function makeSessionService() {
  const appended: Record<string, unknown>[] = [];
  const state = { failNext: false, notFound: false };
  const session: SessionRecord = {
    id: SESSION,
    userId: OWNER,
    status: "active",
    createdAt: new Date("2026-10-03T00:00:00Z"),
    updatedAt: new Date("2026-10-03T00:00:00Z"),
    prompt: {
      input: "a quiet harbour",
      output: "a quiet harbour",
      versions: [
        {
          versionId: VERSION,
          signature: "harbour-version",
          prompt: "a quiet harbour",
          timestamp: "2026-10-03T00:00:00Z",
        },
      ],
    },
  };
  return {
    state,
    appended,
    appendGenerationToVersion: vi.fn(
      async (
        _userId: string,
        _sessionId: string,
        _versionId: string,
        record: Record<string, unknown>,
      ) => {
        if (state.notFound) {
          const err = new Error(`Session not found: ${_sessionId}`);
          err.name = "SessionNotFoundError";
          throw err;
        }
        if (state.failNext) throw new Error("firestore unavailable");
        const id = typeof record.id === "string" ? record.id : "";
        if (!appended.some((r) => r.id === id)) appended.push(record);
        return session;
      },
    ),
    requireOwnedSession: vi.fn(
      async (userId: string, sessionId: string): Promise<SessionRecord> => {
        if (state.notFound || sessionId !== SESSION) {
          const error = new Error(`Session not found: ${sessionId}`);
          error.name = "SessionNotFoundError";
          throw error;
        }
        if (userId !== OWNER) throw new Error("Session access denied");
        return session;
      },
    ),
  } satisfies Pick<
    SessionService,
    "appendGenerationToVersion" | "requireOwnedSession"
  > & {
    state: typeof state;
    appended: typeof appended;
  };
}

function createApp(deps: {
  owedTakeAttachmentStore: OwedTakeAttachmentStore;
  sessionService: ReturnType<typeof makeSessionService>;
}): express.Express {
  const app = express();
  app.use((req, _res, next) => {
    (req as express.Request & { user?: { uid?: string } }).user = {
      uid: OWNER,
    };
    next();
  });
  app.use(express.json());

  const services = {
    sessionService: deps.sessionService,
    owedTakeAttachmentStore: deps.owedTakeAttachmentStore,
  } as never;

  app.get(
    "/pictures/owed-attachments",
    createOwedPictureAttachmentsHandler(services),
  );
  app.post(
    "/pictures/owed-attachments/:generationId/retry",
    createRetryPictureAttachmentHandler(services),
  );
  return app;
}

/** A quick picture whose session write is attempted with owed tracking. */
const makeQuickPicture = (
  store: OwedTakeAttachmentStore,
  sessionService: ReturnType<typeof makeSessionService>,
): Promise<TakeAttachment> =>
  attachTakeWithOwedTracking({
    store,
    sessionService,
    input: {
      userId: OWNER,
      generationId: "quick-picture-1",
      sessionId: SESSION,
      promptVersionId: VERSION,
      record: buildCompletedTakeRecord({
        id: "quick-picture-1",
        model: "flux-schnell",
        mediaType: "image",
        prompt: "a quiet harbour",
        promptVersionId: VERSION,
        mediaUrls: ["https://cdn.example.com/pic.png"],
        thumbnailUrl: "https://cdn.example.com/pic.png",
        ancestorGenerationId: null,
      }),
    },
    logLabel: "Quick picture",
  });

describe("regression: quick-picture attachment recovery (issue #133)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("a lost/failed quick-picture attach is durable and not presented as attached", async () => {
    const owedStore = makeOwedStore();
    const sessionService = makeSessionService();
    sessionService.state.failNext = true;

    const attachment = await makeQuickPicture(owedStore, sessionService);

    // The session does not have the take.
    expect(attachment.state).toBe("failed");
    expect(sessionService.appended).toEqual([]);
    // The debt is durable: a reloaded client can find it.
    expect(owedStore.docs.size).toBe(1);
    const owed = [...owedStore.docs.values()][0]!;
    expect(owed.state).toBe("failed");
    expect(owed.record.id).toBe(attachment.generationId);
  });

  it("finds the owed take after reload and repairs it without regeneration", async () => {
    const owedStore = makeOwedStore();
    const sessionService = makeSessionService();
    const app = createApp({
      owedTakeAttachmentStore: owedStore,
      sessionService,
    });

    // The picture exists, its session write does not.
    sessionService.state.failNext = true;
    const { generationId } = await makeQuickPicture(owedStore, sessionService);

    // Reload: the client discovers what the session is owed.
    const found = await request(app)
      .get("/pictures/owed-attachments")
      .query({ sessionId: SESSION });
    expect(found.status).toBe(200);
    expect(found.body.data.attachments).toHaveLength(1);
    expect(found.body.data.attachments[0].generationId).toBe(generationId);
    expect(found.body.data.attachments[0].record.id).toBe(generationId);

    // Repair: the append is healthy now, so the retry re-attaches the SAME take.
    sessionService.state.failNext = false;
    const repaired = await request(app).post(
      `/pictures/owed-attachments/${generationId}/retry`,
    );
    expect(repaired.status).toBe(200);
    expect(repaired.body.attachment.state).toBe("attached");
    expect(repaired.body.attachment.generationId).toBe(generationId);

    // The take is in the session under its original identity, exactly once.
    expect(sessionService.appended.map((r) => r.id)).toEqual([generationId]);

    // The debt is settled — a second reload finds nothing owed.
    const afterRepair = await request(app)
      .get("/pictures/owed-attachments")
      .query({ sessionId: SESSION });
    expect(afterRepair.body.data.attachments).toHaveLength(0);
  });

  it("reports a retry whose destination session was deleted, truthfully", async () => {
    const owedStore = makeOwedStore();
    const sessionService = makeSessionService();
    const app = createApp({
      owedTakeAttachmentStore: owedStore,
      sessionService,
    });

    sessionService.state.failNext = true;
    const { generationId } = await makeQuickPicture(owedStore, sessionService);

    // The destination session is deleted before the creator retries.
    sessionService.state.failNext = false;
    sessionService.state.notFound = true;
    const retried = await request(app).post(
      `/pictures/owed-attachments/${generationId}/retry`,
    );

    expect(retried.status).toBe(200);
    expect(retried.body.attachment.state).toBe("failed");
    expect(retried.body.attachment.reason).toContain(SESSION);
    // Still owed, still truthful — never flipped to "saved".
    expect(owedStore.docs.get(generationId)?.state).toBe("failed");
  });

  it("404s a retry for a take nothing is owed", async () => {
    const owedStore = makeOwedStore();
    const app = createApp({
      owedTakeAttachmentStore: owedStore,
      sessionService: makeSessionService(),
    });

    const res = await request(app).post(
      "/pictures/owed-attachments/unknown-gen/retry",
    );
    expect(res.status).toBe(404);
  });
});
