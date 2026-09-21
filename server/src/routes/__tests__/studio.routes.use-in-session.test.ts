import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import supertest from "supertest";
import { createStudioRouter } from "../studio.routes";
import { StudioService } from "@services/studio/StudioService";
import { StudioModelRegistry } from "@services/studio/StudioModelRegistry";
import type { StudioProjectStore } from "@services/studio/storage/StudioProjectStore";
import type {
  StudioProjectRecord,
  StudioTurnRecord,
} from "@services/studio/types";
import { SessionService } from "@services/sessions/SessionService";
import type { SessionStore } from "@services/sessions/SessionStore";
import { createSessionPictureLookup } from "@services/sessions/sessionPictureLookup";
import type { SessionRecord } from "@server/domain/session/types";
import type { AdmissionIdempotencyPort } from "@services/admission/admitPictureTake";
import { StudioUseInSessionResultSchema } from "@shared/schemas/studio.schemas";

/**
 * "Use this in the session" at the wire (issue #89, ADR-0022 decision 4).
 *
 * What the bridge DOES is pinned in `returnStudioImage.test.ts`. This suite
 * pins only the translation the route owns: which status each outcome gets,
 * and the one case where the status code is not the discriminator — a missing
 * origin session is a choice the creator has to make, so it travels as a
 * `reason` the client can act on rather than as a generic 409.
 */

const NOW_MS = new Date("2026-09-17T12:00:00Z").getTime();
const OWNER = "user-1";
const PROJECT_ID = "project-1";
const IMAGE_ID = "img-1";
const IMAGE_PATH = "users/user-1/previews/images/edited.png";

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

function sessionFixture(userId: string): SessionRecord {
  return {
    id: "session-1",
    userId,
    status: "active",
    createdAt: new Date(NOW_MS),
    updatedAt: new Date(NOW_MS),
    prompt: {
      input: "a lighthouse",
      output: "a lighthouse at dusk, wide shot",
      versions: [
        {
          versionId: "v1",
          signature: "sig-1",
          prompt: "a lighthouse at dusk, wide shot",
          timestamp: "2026-09-17T11:00:00Z",
          // The picture the project was bridged FROM is a live take in this
          // session — which is exactly why admission (issue #122) can draw a
          // refine edge to it. The route test used to leave this empty and lean
          // on the boundary accepting an ancestor that was not a node here.
          generations: [
            {
              id: "take-1",
              mediaType: "image",
              status: "completed",
              prompt: "a lighthouse at dusk, wide shot",
              promptVersionId: "v1",
              mediaUrls: ["https://storage.example.com/take-1"],
              mediaAssetIds: ["take-1.webp"],
              storagePath: "users/user-1/previews/images/take-1.webp",
              ancestorGenerationId: null,
              origin: "generated",
            },
          ],
        },
      ],
    },
  };
}

function projectFixture(): StudioProjectRecord {
  return {
    id: PROJECT_ID,
    userId: OWNER,
    title: "Lighthouse",
    attachments: [
      {
        id: "att-1",
        storagePath: "users/user-1/previews/images/bridged.webp",
        filename: "Session picture",
        createdAtMs: NOW_MS,
      },
    ],
    origin: {
      sessionId: "session-1",
      promptVersionId: "v1",
      sourceInput: {
        kind: "take",
        generationId: "take-1",
        storagePath: "users/user-1/previews/images/take-1.webp",
      },
      bridgedImageId: "att-1",
      capturedAtMs: NOW_MS,
    },
    createdAtMs: NOW_MS,
    updatedAtMs: NOW_MS,
  };
}

function turnFixture(): StudioTurnRecord {
  return {
    id: "turn-1",
    projectId: PROJECT_ID,
    userId: OWNER,
    status: "complete",
    userMessage: "warm the light",
    decision: {
      action: "edit",
      instruction: "warm the light",
      sourceImageIds: ["att-1"],
      suggestions: ["a", "b", "c"],
    },
    resolvedModel: "nano-banana-2",
    sourceImages: [
      { id: "att-1", storagePath: "users/user-1/previews/images/bridged.webp" },
    ],
    calls: [
      {
        index: 0,
        status: "succeeded",
        image: {
          id: IMAGE_ID,
          storagePath: IMAGE_PATH,
          sourcePrompt: "warm the light",
          model: "nano-banana-2",
        },
      },
    ],
    reservedCents: 7,
    refundedCents: 0,
    createdAtMs: NOW_MS,
    updatedAtMs: NOW_MS,
  };
}

class FakeStudioStore implements StudioProjectStore {
  projects = new Map<string, StudioProjectRecord>();
  turns = new Map<string, StudioTurnRecord>();

  async createProject(record: StudioProjectRecord): Promise<boolean> {
    if (this.projects.has(record.id)) return false;
    this.projects.set(record.id, record);
    return true;
  }
  async getProject(projectId: string): Promise<StudioProjectRecord | null> {
    return this.projects.get(projectId) ?? null;
  }
  async listProjects(): Promise<StudioProjectRecord[]> {
    return [...this.projects.values()];
  }
  async updateProject(
    projectId: string,
    patch: Partial<StudioProjectRecord>,
  ): Promise<void> {
    const current = this.projects.get(projectId);
    if (current) this.projects.set(projectId, { ...current, ...patch });
  }
  async listTurns(projectId: string): Promise<StudioTurnRecord[]> {
    return [...this.turns.values()].filter(
      (turn) => turn.projectId === projectId,
    );
  }
  async getTurn(
    _projectId: string,
    turnId: string,
  ): Promise<StudioTurnRecord | null> {
    return this.turns.get(turnId) ?? null;
  }
  async findTurnByProducedImageId(
    projectId: string,
    imageId: string,
  ): Promise<StudioTurnRecord | null> {
    return (
      [...this.turns.values()].find(
        (turn) =>
          turn.projectId === projectId &&
          turn.calls.some(
            (call) => call.status === "succeeded" && call.image?.id === imageId,
          ),
      ) ?? null
    );
  }
  async reserveTurn(): Promise<void> {}
  async saveTurn(): Promise<void> {}
  async refundCents(): Promise<void> {}
  async finalizeTurn(): Promise<void> {}
  // The return leg reads produced images by identity; it never settles a turn,
  // so these are inert stubs present to satisfy the store port (#126).
  async checkpointCall(): Promise<void> {}
  async settleTurn(): Promise<{ applied: boolean }> {
    return { applied: false };
  }
  async deleteProject(projectId: string): Promise<void> {
    this.projects.delete(projectId);
  }
}

function idempotency(): AdmissionIdempotencyPort {
  return {
    claimRequest: async ({ userId, route, key }) => ({
      state: "claimed",
      recordId: `${userId}|${route}|${key}`,
    }),
    markCompleted: async () => {},
    markFailed: async () => {},
  };
}

/**
 * The Firestore-backed idempotency, modelled: claims track a payload hash and
 * a settled snapshot, a completed record with the same hash REPLAYS, and the
 * snapshot is readable without claiming (the recovery read, issue #135).
 */
function statefulIdempotency(): AdmissionIdempotencyPort & {
  /** Overwrite the settled snapshot for one key — seeds receipts for GET. */
  seedSnapshot: (input: {
    userId: string;
    route: string;
    key: string;
    snapshot: { statusCode: number; body: Record<string, unknown> };
  }) => void;
} {
  const records = new Map<
    string,
    {
      payloadHash: string;
      status: "pending" | "completed" | "failed";
      snapshot?: { statusCode: number; body: Record<string, unknown> };
    }
  >();
  return {
    seedSnapshot: ({ userId, route, key, snapshot }) => {
      records.set(`${userId}|${route}|${key}`, {
        payloadHash: "",
        status: "completed",
        snapshot,
      });
    },
    claimRequest: async ({ userId, route, key, payload }) => {
      const recordId = `${userId}|${route}|${key}`;
      const payloadHash = JSON.stringify(payload);
      const existing = records.get(recordId);
      if (!existing) {
        records.set(recordId, { payloadHash, status: "pending" });
        return { state: "claimed", recordId };
      }
      if (existing.payloadHash && existing.payloadHash !== payloadHash) {
        return { state: "conflict", recordId };
      }
      if (existing.status === "completed" && existing.snapshot) {
        return { state: "replay", recordId, snapshot: existing.snapshot };
      }
      records.set(recordId, { payloadHash, status: "pending" });
      return { state: "claimed", recordId };
    },
    markCompleted: async ({ recordId, snapshot }) => {
      const existing = records.get(recordId);
      records.set(recordId, {
        payloadHash: existing?.payloadHash ?? "",
        status: "completed",
        snapshot,
      });
    },
    markFailed: async (recordId) => {
      const existing = records.get(recordId);
      if (existing) records.set(recordId, { ...existing, status: "failed" });
    },
    getResponseSnapshot: async ({ userId, route, key }) => {
      return records.get(`${userId}|${route}|${key}`)?.snapshot ?? null;
    },
  };
}

function harness(options?: {
  sessionOwner?: string;
  withoutSession?: boolean;
  wireReturnDoor?: boolean;
  /** The first append write throws — the attachment fails, the picture does not. */
  failFirstAppend?: boolean;
  idempotency?: AdmissionIdempotencyPort;
}) {
  const session = sessionFixture(options?.sessionOwner ?? OWNER);
  const sessions = new Map<string, SessionRecord>(
    options?.withoutSession ? [] : [[session.id, session]],
  );
  let appendWrites = 0;
  const sessionStore = {
    get: vi.fn(async (id: string) => sessions.get(id) ?? null),
    save: vi.fn(async (next: SessionRecord) => {
      sessions.set(next.id, next);
    }),
    mutate: vi.fn(
      async (
        id: string,
        mutator: (record: SessionRecord) => SessionRecord,
      ): Promise<SessionRecord | null> => {
        if (options?.failFirstAppend) {
          appendWrites += 1;
          if (appendWrites === 1) {
            throw new Error("session write failed");
          }
        }
        const current = sessions.get(id);
        if (!current) return null;
        const next = mutator(current);
        sessions.set(id, next);
        return next;
      },
    ),
    delete: vi.fn(async (id: string) => {
      sessions.delete(id);
    }),
    findByPromptUuid: vi.fn(async () => null),
    // The atomic mint the studio-return bridge uses when it starts a new
    // session (issue #130): create-if-absent on the deterministic id.
    createIfAbsent: vi.fn(async (next: SessionRecord) => {
      const existing = sessions.get(next.id);
      if (existing) return { created: false, session: existing };
      sessions.set(next.id, next);
      return { created: true, session: next };
    }),
  };
  const sessionService = new SessionService(
    sessionStore as unknown as SessionStore,
  );

  const studioStore = new FakeStudioStore();
  studioStore.projects.set(PROJECT_ID, projectFixture());
  studioStore.turns.set("turn-1", turnFixture());

  const studioService = new StudioService({
    store: studioStore,
    registry: new StudioModelRegistry(),
    runner: { run: vi.fn() },
    storage: {
      saveFromUrl: vi.fn(),
      getViewUrl: vi.fn(async (_userId: string, path: string) => ({
        viewUrl: `https://signed.example.com/${path}?exp=1h`,
        expiresAt: "2026-09-17T13:00:00Z",
        storagePath: path,
      })),
    },
    policy: { decideTurn: vi.fn() },
    dailyCapCents: 500,
    now: () => new Date(NOW_MS),
    idFactory: () => "id-1",
  });

  const wired = options?.wireReturnDoor ?? true;
  const app = express();
  app.use(express.json());
  app.use(
    "/api/studio",
    (req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { user?: unknown }).user = { uid: OWNER };
      next();
    },
    createStudioRouter(
      studioService,
      // This suite exercises only the return leg; the outbound bridge's
      // resolver is never reached, so a stub that resolves nothing suffices.
      createSessionPictureLookup(sessionService, {
        resolveOwnedPicture: () => Promise.resolve(null),
      }),
      wired
        ? {
            sessionService,
            mediaStore: {
              storeFromBuffer: async (
                _buffer: Buffer,
                _contentType: string,
                userId: string,
              ) => ({
                id: "returned-1",
                storagePath: `users/${userId}/previews/images/returned-1.png`,
                url: "https://storage.example.com/returned-1",
              }),
            },
            idempotency: options?.idempotency ?? idempotency(),
          }
        : { sessionService: null, mediaStore: null, idempotency: null },
    ),
  );

  return { app, sessions };
}

const PATH = `/api/studio/projects/${PROJECT_ID}/images/${IMAGE_ID}/use-in-session`;

describe("POST /api/studio/projects/:projectId/images/:imageId/use-in-session", () => {
  const originalFetch = globalThis.fetch;

  function serveStoredImage(contentType: string): void {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(PNG_BYTES, {
          status: 200,
          headers: {
            "content-type": contentType,
            "content-length": String(PNG_BYTES.length),
          },
        }),
    ) as never;
  }

  beforeEach(() => {
    serveStoredImage("image/png");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns 201 with the admitted take, its picture ancestor, and an attached fact", async () => {
    const { app } = harness();

    const res = await supertest(app).post(PATH).send({});

    expect(res.status).toBe(201);
    const result = StudioUseInSessionResultSchema.parse(res.body.data);
    expect(result.sessionId).toBe("session-1");
    expect(result.promptVersionId).toBe("v1");
    expect(result.ancestorGenerationId).toBe("take-1");
    expect(result.createdSession).toBe(false);
    // The attachment fact (issue #135): a 201 says the take is in its session
    // only when the attachment actually resolved.
    expect(result.attachment?.state).toBe("attached");
  });

  it("carries the failed attachment with its record, and a retry attaches the SAME take (issue #135)", async () => {
    const idempotencyDouble = statefulIdempotency();
    const { app, sessions } = harness({
      failFirstAppend: true,
      idempotency: idempotencyDouble,
    });

    const first = await supertest(app).post(PATH).send({});

    // Still a 201 — the PICTURE was admitted and is durable; what failed is
    // the session write, and that is exactly what the response now says.
    expect(first.status).toBe(201);
    const firstResult = StudioUseInSessionResultSchema.parse(first.body.data);
    expect(firstResult.attachment?.state).toBe("failed");
    expect(firstResult.attachment?.reason).toBe("session write failed");
    expect(firstResult.attachment?.record).toMatchObject({
      id: firstResult.generationId,
    });
    // The session really does not have the take.
    const sessionAfterFailure = sessions.get("session-1");
    const versionsAfterFailure =
      sessionAfterFailure?.prompt?.versions ?? [];
    expect(
      versionsAfterFailure
        .find((version) => version.versionId === "v1")
        ?.generations?.some(
          (take) =>
            typeof take === "object" &&
            take !== null &&
            (take as { id?: unknown }).id === firstResult.generationId,
        ),
    ).toBe(false);

    // The retry: pressing again is the replay, and the receipt (#128)
    // RESUMES it — the same identity, the same record, no second admission.
    const retry = await supertest(app).post(PATH).send({});

    expect(retry.status).toBe(201);
    const retryResult = StudioUseInSessionResultSchema.parse(retry.body.data);
    expect(retryResult.attachment?.state).toBe("attached");
    expect(retryResult.generationId).toBe(firstResult.generationId);

    // Exactly ONE take under that identity — the retry repaired the failed
    // write instead of minting a second take for the same picture.
    const session = sessions.get("session-1");
    const generations =
      session?.prompt?.versions?.find(
        (version) => version.versionId === "v1",
      )?.generations ?? [];
    const matching = generations.filter(
      (take) =>
        typeof take === "object" &&
        take !== null &&
        (take as { id?: unknown }).id === firstResult.generationId,
    );
    expect(matching).toHaveLength(1);
  });

  it("answers a gone origin session with 409 and a reason the client can act on", async () => {
    const { app } = harness({ withoutSession: true });

    const res = await supertest(app).post(PATH).send({});

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      success: false,
      reason: "origin-session-missing",
      sessionId: "session-1",
    });
  });

  it("asks for confirmed words (409) when starting a new session, without offering an edit's instruction (issue #131)", async () => {
    const { app } = harness({ withoutSession: true });

    const res = await supertest(app)
      .post(PATH)
      .send({ onMissingOriginSession: "new-session" });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      success: false,
      reason: "needs-confirmed-words",
    });
    // The producing text of an edit is an instruction, never offered as words.
    expect(res.body.suggestion).toBeUndefined();
  });

  it("starts a new session with the creator's confirmed words", async () => {
    const { app } = harness({ withoutSession: true });

    const res = await supertest(app).post(PATH).send({
      onMissingOriginSession: "new-session",
      confirmedWords: "a lighthouse in warm light",
    });

    expect(res.status).toBe(201);
    expect(res.body.data.createdSession).toBe(true);
    expect(res.body.data.sessionId).not.toBe("session-1");
  });

  it("refuses a foreign destination as absence", async () => {
    const { app } = harness({ sessionOwner: "someone-else" });

    const res = await supertest(app).post(PATH).send({});

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("That session is not available.");
  });

  it("explains 422 when the stored image cannot be armed as a frame", async () => {
    const { app } = harness();
    serveStoredImage("image/svg+xml");

    const res = await supertest(app).post(PATH).send({});

    expect(res.status).toBe(422);
    expect(res.body.error).toContain("image/svg+xml");
    expect(res.body.error).toContain("PNG, JPEG or WebP");
  });

  it("404s an image the project never produced", async () => {
    const { app } = harness();

    const res = await supertest(app)
      .post(`/api/studio/projects/${PROJECT_ID}/images/att-1/use-in-session`)
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("That picture is not available.");
  });

  it("says so with a 503 when the return door has no session dependencies", async () => {
    const { app } = harness({ wireReturnDoor: false });

    const res = await supertest(app).post(PATH).send({});

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
  });
});

/**
 * Recovery after refresh (ADR-0022 decision 6, issue #135): the reloaded
 * workspace asks the server's receipts which of the project's pictures is
 * still owed its session row. The truth is read, never inferred, and an
 * attached (or absent) receipt reads as nothing owed.
 */
describe("GET /api/studio/projects/:projectId/unresolved-returns", () => {
  const GET_PATH = `/api/studio/projects/${PROJECT_ID}/unresolved-returns`;

  function admittedReceiptBody(
    generationId: string,
    attachmentState: "failed" | "pending" | "attached",
  ): Record<string, unknown> {
    return {
      generationId,
      sessionId: "session-1",
      promptVersionId: "v1",
      origin: "studio",
      imageUrl: "https://storage.example.com/returned",
      assetId: "asset-1",
      storagePath: "users/user-1/previews/images/returned.png",
      record: { id: generationId, mediaType: "image", origin: "studio" },
      attachment: {
        state: attachmentState,
        generationId,
        sessionId: "session-1",
        promptVersionId: "v1",
        ...(attachmentState === "failed" ? { reason: "session write failed" } : {}),
        record: { id: generationId, mediaType: "image", origin: "studio" },
      },
    };
  }

  it("lists the project's pictures whose return is still owed its session row", async () => {
    const idempotencyDouble = statefulIdempotency();
    idempotencyDouble.seedSnapshot({
      userId: OWNER,
      route: "picture-admission",
      key: `studio-return:${PROJECT_ID}:${IMAGE_ID}`,
      snapshot: {
        statusCode: 201,
        body: admittedReceiptBody("take-owed", "failed"),
      },
    });
    const { app } = harness({ idempotency: idempotencyDouble });

    const res = await supertest(app).get(GET_PATH);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.returns).toEqual([
      {
        imageId: IMAGE_ID,
        attachment: expect.objectContaining({
          state: "failed",
          generationId: "take-owed",
          sessionId: "session-1",
          promptVersionId: "v1",
          reason: "session write failed",
        }),
      },
    ]);
  });

  it("answers nothing for an attached receipt — the session is the source of truth", async () => {
    const idempotencyDouble = statefulIdempotency();
    idempotencyDouble.seedSnapshot({
      userId: OWNER,
      route: "picture-admission",
      key: `studio-return:${PROJECT_ID}:${IMAGE_ID}`,
      snapshot: {
        statusCode: 201,
        body: admittedReceiptBody("take-attached", "attached"),
      },
    });
    const { app } = harness({ idempotency: idempotencyDouble });

    const res = await supertest(app).get(GET_PATH);

    expect(res.status).toBe(200);
    expect(res.body.data.returns).toEqual([]);
  });

  it("answers an empty list for a project with no receipts", async () => {
    const { app } = harness({ idempotency: statefulIdempotency() });

    const res = await supertest(app).get(GET_PATH);

    expect(res.status).toBe(200);
    expect(res.body.data.returns).toEqual([]);
  });

  it("says so with a 503 when the idempotency port cannot read receipts", async () => {
    const { app } = harness();

    const res = await supertest(app).get(GET_PATH);

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
  });
});
