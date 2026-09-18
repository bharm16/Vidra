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
          generations: [],
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

  async createProject(record: StudioProjectRecord): Promise<void> {
    this.projects.set(record.id, record);
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
  async reserveTurn(): Promise<void> {}
  async saveTurn(): Promise<void> {}
  async refundCents(): Promise<void> {}
  async finalizeTurn(): Promise<void> {}
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

function harness(options?: {
  sessionOwner?: string;
  withoutSession?: boolean;
  wireReturnDoor?: boolean;
}) {
  const session = sessionFixture(options?.sessionOwner ?? OWNER);
  const sessions = new Map<string, SessionRecord>(
    options?.withoutSession ? [] : [[session.id, session]],
  );
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
            idempotency: idempotency(),
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

  it("returns 201 with the admitted take and its picture ancestor", async () => {
    const { app } = harness();

    const res = await supertest(app).post(PATH).send({});

    expect(res.status).toBe(201);
    const result = StudioUseInSessionResultSchema.parse(res.body.data);
    expect(result.sessionId).toBe("session-1");
    expect(result.promptVersionId).toBe("v1");
    expect(result.ancestorGenerationId).toBe("take-1");
    expect(result.createdSession).toBe(false);
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

  it("starts a new session only when the creator says so", async () => {
    const { app } = harness({ withoutSession: true });

    const res = await supertest(app)
      .post(PATH)
      .send({ onMissingOriginSession: "new-session" });

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
