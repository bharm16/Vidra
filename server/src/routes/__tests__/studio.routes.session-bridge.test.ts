import { describe, it, expect, vi } from "vitest";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import supertest from "supertest";
import { StudioProjectOriginSchema } from "@shared/schemas/studio.schemas";
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

/**
 * "Refine in the studio", end to end at the wire (issue #88, ADR-0022
 * decision 4).
 *
 * Only process-external boundaries are faked: the two Firestore stores
 * (through their ports) and the GCS storage port. The route, the session
 * lookup, SessionService's ownership rule and StudioService are all real, so
 * what these tests assert about ownership and about leaving the session alone
 * is asserted about the code that actually runs.
 */

const NOW_MS = new Date("2026-09-17T12:00:00Z").getTime();

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
          generations: [
            {
              id: "take-1",
              mediaType: "image",
              status: "completed",
              prompt: "a lighthouse at dusk, wide shot",
              promptVersionId: "v1",
              mediaUrls: ["https://signed.example.com/expiring.webp?exp=1h"],
              mediaAssetIds: ["1758100000000-abcdef01.webp"],
              ancestorGenerationId: null,
              origin: "generated",
            },
          ],
        },
      ],
    },
  };
}

class FakeStudioStore implements StudioProjectStore {
  projects = new Map<string, StudioProjectRecord>();

  async createProject(record: StudioProjectRecord): Promise<void> {
    this.projects.set(record.id, { ...record });
  }
  async getProject(projectId: string): Promise<StudioProjectRecord | null> {
    return this.projects.get(projectId) ?? null;
  }
  async listProjects(userId: string): Promise<StudioProjectRecord[]> {
    return [...this.projects.values()].filter((p) => p.userId === userId);
  }
  async updateProject(
    projectId: string,
    patch: Partial<StudioProjectRecord>,
  ): Promise<void> {
    const current = this.projects.get(projectId);
    if (current) this.projects.set(projectId, { ...current, ...patch });
  }
  async listTurns(): Promise<StudioTurnRecord[]> {
    return [];
  }
  async getTurn(): Promise<StudioTurnRecord | null> {
    return null;
  }
  async reserveTurn(): Promise<void> {}
  async saveTurn(): Promise<void> {}
  async refundCents(): Promise<void> {}
  async finalizeTurn(): Promise<void> {}
  async deleteProject(): Promise<void> {}
}

function harness(options?: { sessionOwner?: string; caller?: string }) {
  const session = sessionFixture(options?.sessionOwner ?? "user-1");
  const sessionStore = {
    get: vi
      .fn()
      .mockImplementation(async (sessionId: string) =>
        sessionId === session.id ? session : null,
      ),
  };
  const sessionService = new SessionService(
    sessionStore as unknown as SessionStore,
  );

  const studioStore = new FakeStudioStore();
  let copies = 0;
  const storage = {
    saveFromUrl: vi.fn().mockImplementation(async () => ({
      storagePath: `users/user-1/previews/images/copy-${++copies}.webp`,
    })),
    getViewUrl: vi.fn().mockImplementation((_userId: string, path: string) =>
      Promise.resolve({
        viewUrl: `https://signed.example.com/${path}?exp=1h`,
        expiresAt: "2026-09-17T13:00:00Z",
        storagePath: path,
      }),
    ),
  };

  let idCounter = 0;
  const studioService = new StudioService({
    store: studioStore,
    registry: new StudioModelRegistry(),
    runner: { run: vi.fn() },
    storage,
    policy: { decideTurn: vi.fn() },
    dailyCapCents: 500,
    now: () => new Date(NOW_MS),
    idFactory: () => `id-${++idCounter}`,
  });

  const caller = options?.caller ?? "user-1";
  const app = express();
  app.use(express.json());
  app.use(
    "/api/studio",
    (req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { user?: unknown }).user = { uid: caller };
      next();
    },
    createStudioRouter(
      studioService,
      createSessionPictureLookup(sessionService),
      // The return leg (#89) is exercised in its own suite; this one is about
      // the outbound bridge, so its door is simply not wired here.
      { sessionService: null, mediaStore: null, idempotency: null },
    ),
  );

  return { app, session, studioStore, storage, sessionStore };
}

const BODY = { sessionId: "session-1", generationId: "take-1" };

describe("POST /api/studio/projects/from-session-picture", () => {
  it("opens a project with the picture selected and its origin recorded", async () => {
    const { app } = harness();

    const res = await supertest(app)
      .post("/api/studio/projects/from-session-picture")
      .send(BODY);

    expect(res.status).toBe(201);
    const project = res.body.data;
    const origin = StudioProjectOriginSchema.parse(project.origin);
    expect(origin.sessionId).toBe("session-1");
    expect(origin.promptVersionId).toBe("v1");
    expect(origin.sourceInput).toMatchObject({
      kind: "take",
      generationId: "take-1",
    });
    expect(project.selectedImageId).toBe(origin.bridgedImageId);
    // The picture is resolvable right away, from the project's own copy.
    expect(project.originImageUrl).toContain("copy-1.webp");
  });

  it("leaves the source take and its words exactly as they were", async () => {
    const { app, session } = harness();
    const before = JSON.stringify(session);

    await supertest(app)
      .post("/api/studio/projects/from-session-picture")
      .send(BODY);

    expect(JSON.stringify(session)).toBe(before);
  });

  it("still resolves the picture after the session's version changes", async () => {
    const { app, session, storage } = harness();
    const created = await supertest(app)
      .post("/api/studio/projects/from-session-picture")
      .send(BODY);
    const projectId = created.body.data.id;

    // The session moves on: a new words-version, the bridged take removed,
    // and the object it pointed at no longer signable.
    session.prompt = {
      ...session.prompt!,
      versions: [
        {
          versionId: "v2",
          signature: "sig-2",
          prompt: "a lighthouse at noon",
          timestamp: "2026-09-17T12:30:00Z",
          generations: [],
        },
      ],
    };
    storage.getViewUrl.mockImplementation((_userId: string, path: string) =>
      path.includes("1758100000000")
        ? Promise.reject(new Error("source object is gone"))
        : Promise.resolve({
            viewUrl: `https://signed.example.com/${path}?exp=1h`,
            expiresAt: "2026-09-18T13:00:00Z",
            storagePath: path,
          }),
    );

    const reopened = await supertest(app).get(
      `/api/studio/projects/${projectId}`,
    );

    expect(reopened.status).toBe(200);
    // The origin still says where it came from, and the picture still renders.
    expect(reopened.body.data.origin.promptVersionId).toBe("v1");
    expect(reopened.body.data.originImageUrl).toContain("copy-1.webp");
  });

  it("yields one project for two invocations on the same take", async () => {
    const { app, studioStore, storage } = harness();

    const first = await supertest(app)
      .post("/api/studio/projects/from-session-picture")
      .send(BODY);
    const second = await supertest(app)
      .post("/api/studio/projects/from-session-picture")
      .send(BODY);

    expect(second.body.data.id).toBe(first.body.data.id);
    expect(studioStore.projects.size).toBe(1);
    expect(storage.saveFromUrl).toHaveBeenCalledTimes(1);
  });

  it("refuses a take the creator does not own, and stores nothing", async () => {
    const { app, studioStore, storage } = harness({
      sessionOwner: "user-1",
      caller: "intruder",
    });

    const res = await supertest(app)
      .post("/api/studio/projects/from-session-picture")
      .send(BODY);

    expect(res.status).toBe(404);
    expect(studioStore.projects.size).toBe(0);
    expect(storage.saveFromUrl).not.toHaveBeenCalled();
  });

  it("refuses a generation this session does not hold", async () => {
    const { app, studioStore } = harness();

    const res = await supertest(app)
      .post("/api/studio/projects/from-session-picture")
      .send({ sessionId: "session-1", generationId: "not-a-take" });

    expect(res.status).toBe(404);
    expect(studioStore.projects.size).toBe(0);
  });

  it("does not read the literal path segment as a project id", async () => {
    const { app } = harness();

    const res = await supertest(app)
      .post("/api/studio/projects/from-session-picture")
      .send({ sessionId: "session-1" });

    // The route matched and rejected the body — not a 404 from :projectId.
    expect(res.status).toBe(400);
  });
});
