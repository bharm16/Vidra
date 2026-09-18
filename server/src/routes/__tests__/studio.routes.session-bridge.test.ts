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
import { createOwnedPictureResolver } from "@services/owned-media";
import type { SessionRecord } from "@server/domain/session/types";

/**
 * "Refine in the studio", end to end at the wire (issue #88, ADR-0022
 * decision 4; ownership across both stores fixed in issue #109).
 *
 * Only process-external boundaries are faked: the two Firestore stores
 * (through their ports) and the two GCS storage ports — the user-scoped store
 * and the image-asset store. The route, the session lookup, the shared
 * owner-checked resolver, SessionService's ownership rule and StudioService are
 * all real, so what these tests assert about ownership, about every picture
 * origin, and about leaving the session alone is asserted about the code that
 * actually runs.
 */

const NOW_MS = new Date("2026-09-17T12:00:00Z").getTime();

/** How a session records the picture the creator wants to refine. */
interface TakeShape {
  origin: string;
  mediaAssetIds: string[];
  /** Present for every origin except `generated`, which carries only a basename. */
  storagePath?: string;
}

/** A generated take: an asset basename in the user-scoped store, no path. */
const GENERATED_TAKE: TakeShape = {
  origin: "generated",
  mediaAssetIds: ["1758100000000-abcdef01.webp"],
};

/** An admitted take: the production image store's `image-previews/` path. */
function admittedTake(origin: string, assetId: string): TakeShape {
  return {
    origin,
    storagePath: `image-previews/user-1/${assetId}`,
    mediaAssetIds: [assetId],
  };
}

function sessionFixture(userId: string, take: TakeShape): SessionRecord {
  const generation: Record<string, unknown> = {
    id: "take-1",
    mediaType: "image",
    status: "completed",
    prompt: "a lighthouse at dusk, wide shot",
    promptVersionId: "v1",
    mediaUrls: ["https://signed.example.com/expiring.webp?exp=1h"],
    mediaAssetIds: take.mediaAssetIds,
    ancestorGenerationId: null,
    origin: take.origin,
    ...(take.storagePath ? { storagePath: take.storagePath } : {}),
  };
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
          generations: [generation],
        },
      ],
    },
  } as SessionRecord;
}

class FakeStudioStore implements StudioProjectStore {
  projects = new Map<string, StudioProjectRecord>();

  async createProject(record: StudioProjectRecord): Promise<boolean> {
    if (this.projects.has(record.id)) return false;
    this.projects.set(record.id, { ...record });
    return true;
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
  async findTurnByProducedImageId(): Promise<StudioTurnRecord | null> {
    return null;
  }
  async reserveTurn(): Promise<void> {}
  async saveTurn(): Promise<void> {}
  async refundCents(): Promise<void> {}
  async finalizeTurn(): Promise<void> {}
  // Never runs a spend-bearing turn (create-from-session-picture only), so
  // these are inert; present to satisfy the store port (#126).
  async checkpointCall(): Promise<void> {}
  async settleTurn(): Promise<{ applied: boolean }> {
    return { applied: false };
  }
  async deleteProject(): Promise<void> {}
}

function harness(options?: {
  sessionOwner?: string;
  caller?: string;
  take?: TakeShape;
}) {
  const session = sessionFixture(
    options?.sessionOwner ?? "user-1",
    options?.take ?? GENERATED_TAKE,
  );
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
  // The user-scoped store (StorageService's surface): the studio's copy, plus
  // the two reads the resolver needs for a user-scoped source.
  const storage = {
    saveFromUrl: vi.fn().mockImplementation(async () => ({
      storagePath: `users/user-1/previews/images/copy-${++copies}.webp`,
    })),
    getViewUrl: vi.fn((_userId: string, path: string) =>
      Promise.resolve({
        viewUrl: `https://signed.example.com/${path}?exp=1h`,
        expiresAt: "2026-09-17T13:00:00Z",
        storagePath: path,
      }),
    ),
    getPreviewImageViewUrl: vi.fn((userId: string, basename: string) =>
      Promise.resolve(
        `https://signed.example.com/users/${userId}/previews/images/${basename}?exp=1h`,
      ),
    ),
  };
  // The image-asset store (ImageAssetStore's surface): owner-scoped reads for a
  // picture that lives under `image-previews/`.
  const imageAssets = {
    getPublicUrl: vi.fn((assetId: string, userId: string) =>
      Promise.resolve(
        `https://signed.example.com/image-previews/${userId}/${assetId}?exp=1h`,
      ),
    ),
  };
  const resolver = createOwnedPictureResolver({
    imageAssets,
    userStorage: storage,
  });

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
      createSessionPictureLookup(sessionService, resolver),
      // The return leg (#89) is exercised in its own suite; this one is about
      // the outbound bridge, so its door is simply not wired here.
      { sessionService: null, mediaStore: null, idempotency: null },
    ),
  );

  return { app, session, studioStore, storage, imageAssets, sessionStore };
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

  // ADR-0022 decision 4 / issue #109: every picture origin bridges, whether it
  // lives in the user-scoped store (generated) or the production image store
  // (upload, sketchpad, studio) — the two storage shapes the resolver spans.
  it.each([
    ["generated", GENERATED_TAKE],
    ["upload", admittedTake("upload", "upload-1f2e3d4c5b6a")],
    ["sketchpad", admittedTake("sketchpad", "sketch-9a8b7c6d5e4f")],
    ["studio", admittedTake("studio", "studio-0011223344ff")],
  ] as const)(
    "opens a project with the correct bridged attachment for a %s picture",
    async (_origin, take) => {
      const { app } = harness({ take });

      const res = await supertest(app)
        .post("/api/studio/projects/from-session-picture")
        .send(BODY);

      expect(res.status).toBe(201);
      const project = res.body.data;
      const origin = StudioProjectOriginSchema.parse(project.origin);
      // The bridged attachment is selected and resolvable from the project's
      // own copy — the same outcome regardless of which store the source is in.
      expect(project.selectedImageId).toBe(origin.bridgedImageId);
      expect(project.attachments).toHaveLength(1);
      expect(project.attachments[0].id).toBe(origin.bridgedImageId);
      expect(project.originImageUrl).toContain("copy-1.webp");
      // The durable source handle is recorded: an admitted take's own
      // `image-previews/` path, or — for a generated take that carried only a
      // basename — the user-scoped path the resolver reconstructed for it.
      const expectedSourcePath =
        take.storagePath ??
        `users/user-1/previews/images/${take.mediaAssetIds[0]}`;
      expect(origin.sourceInput.storagePath).toBe(expectedSourcePath);
      expect(origin.sourceInput.assetId).toBe(take.mediaAssetIds[0]);
    },
  );

  it("succeeds for a picture stored under the production image store's path", async () => {
    // The regression the ticket names: a real, admitted picture whose path is
    // `image-previews/<owner>/<assetId>` — which the old `users/<uid>/` bridge
    // check rejected.
    const { app, imageAssets } = harness({
      take: admittedTake("upload", "1f2e3d4c5b6a"),
    });

    const res = await supertest(app)
      .post("/api/studio/projects/from-session-picture")
      .send(BODY);

    expect(res.status).toBe(201);
    // Ownership was proven and the URL minted through the image-asset store,
    // keyed by the asset id — never by rewriting the path into `users/`.
    expect(imageAssets.getPublicUrl).toHaveBeenCalledWith(
      "1f2e3d4c5b6a",
      "user-1",
    );
    expect(res.body.data.origin.sourceInput.storagePath).toBe(
      "image-previews/user-1/1f2e3d4c5b6a",
    );
  });

  it("refuses a picture whose stored path belongs to another creator", async () => {
    // The negative path: the session is the caller's, but the take's recorded
    // path is anchored to a different owner. Ownership is not loosened to admit
    // it — the resolver refuses, and refusal reads as absence.
    const { app, studioStore } = harness({
      take: {
        origin: "upload",
        storagePath: "image-previews/someone-else/1f2e3d4c5b6a",
        mediaAssetIds: ["1f2e3d4c5b6a"],
      },
    });

    const res = await supertest(app)
      .post("/api/studio/projects/from-session-picture")
      .send(BODY);

    expect(res.status).toBe(404);
    expect(studioStore.projects.size).toBe(0);
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
