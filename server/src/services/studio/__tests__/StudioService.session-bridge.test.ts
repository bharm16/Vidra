import { describe, it, expect, vi } from "vitest";
import { StudioProjectOriginSchema } from "@shared/schemas/studio.schemas";
import {
  StudioService,
  studioProjectIdForSessionPicture,
  type SessionPictureSource,
} from "../StudioService";
import { StudioModelRegistry } from "../StudioModelRegistry";
import { StudioCapExceededError } from "../storage/FirestoreStudioProjectStore";
import type { StudioProjectStore } from "../storage/StudioProjectStore";
import type {
  StudioDecision,
  StudioProjectRecord,
  StudioTurnRecord,
} from "../types";

/**
 * The studio bridge, session → studio (issue #88, ADR-0022 decision 4).
 *
 * A picture node offers "Refine in the studio"; choosing it births a project
 * that RECORDS where the picture came from, OWNS a durable copy of its media,
 * and opens with that picture selected so an edit turn works on it at once.
 * The return path (#89) is a separate ticket.
 */

class FakeStore implements StudioProjectStore {
  projects = new Map<string, StudioProjectRecord>();
  turns = new Map<string, StudioTurnRecord>();
  reserved = new Map<string, number>();

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
  async listTurns(projectId: string): Promise<StudioTurnRecord[]> {
    return [...this.turns.values()]
      .filter((turn) => turn.projectId === projectId)
      .sort((a, b) => a.createdAtMs - b.createdAtMs);
  }
  async getTurn(
    _projectId: string,
    turnId: string,
  ): Promise<StudioTurnRecord | null> {
    return this.turns.get(turnId) ?? null;
  }
  async reserveTurn(params: {
    turn: StudioTurnRecord;
    day: string;
    capCents: number;
  }): Promise<void> {
    const key = `${params.turn.userId}_${params.day}`;
    const reserved = this.reserved.get(key) ?? 0;
    if (reserved + params.turn.reservedCents > params.capCents) {
      throw new StudioCapExceededError(
        reserved,
        params.turn.reservedCents,
        params.capCents,
      );
    }
    this.reserved.set(key, reserved + params.turn.reservedCents);
    this.turns.set(params.turn.id, { ...params.turn });
  }
  async saveTurn(turn: StudioTurnRecord): Promise<void> {
    this.turns.set(turn.id, { ...turn });
  }
  async refundCents(): Promise<void> {}
  async finalizeTurn(
    _projectId: string,
    turnId: string,
    patch: Partial<StudioTurnRecord>,
  ): Promise<void> {
    const current = this.turns.get(turnId);
    if (current) this.turns.set(turnId, { ...current, ...patch });
  }
  async deleteProject(projectId: string): Promise<void> {
    this.projects.delete(projectId);
  }
}

const NOW_MS = new Date("2026-09-17T12:00:00Z").getTime();

/**
 * The take as the session-side lookup resolved it (issue #109): a path the
 * session owns, plus the read URL the shared resolver already minted for it.
 * The studio copies from that URL — it never re-resolves the source store.
 */
const SOURCE: SessionPictureSource = {
  sessionId: "session-1",
  promptVersionId: "v1",
  generationId: "take-1",
  storagePath: "users/user-1/previews/images/1758100000000-abcdef01.webp",
  viewUrl: "https://signed.example.com/source-picture?exp=1h",
  assetId: "1758100000000-abcdef01.webp",
};

function makeService(overrides?: {
  decide?: (context: { userMessage: string }) => Promise<StudioDecision>;
}) {
  const store = new FakeStore();
  let idCounter = 0;
  let copyCounter = 0;

  const runner = {
    run: vi.fn().mockResolvedValue({
      imageUrl: "https://replicate.delivery/edited.webp",
      durationMs: 900,
    }),
  };

  const storage = {
    // The copy: the studio project gets its OWN object, so nothing the
    // session does later can reach the project's media.
    saveFromUrl: vi.fn().mockImplementation(async () => ({
      storagePath: `users/user-1/previews/images/copy-${++copyCounter}.webp`,
    })),
    getViewUrl: vi.fn().mockImplementation((_userId: string, path: string) =>
      Promise.resolve({
        viewUrl: `https://signed.example.com/${path}?exp=1h`,
        expiresAt: "2026-09-17T13:00:00Z",
        storagePath: path,
      }),
    ),
  };

  const decideTurn = vi
    .fn()
    .mockImplementation(
      overrides?.decide ?? (async () => ({ action: "diagnose" })),
    );

  const service = new StudioService({
    store,
    registry: new StudioModelRegistry(),
    runner,
    storage,
    policy: { decideTurn },
    dailyCapCents: 500,
    now: () => new Date(NOW_MS),
    idFactory: () => `id-${++idCounter}`,
  });

  return { service, store, storage, runner, decideTurn };
}

describe("StudioService.createProjectFromSessionPicture", () => {
  it("opens a project with the bridged picture selected", async () => {
    const { service } = makeService();

    const project = await service.createProjectFromSessionPicture(
      "user-1",
      SOURCE,
    );

    const bridged = project.attachments?.[0];
    expect(bridged).toBeDefined();
    expect(project.selectedImageId).toBe(bridged?.id);
    expect(project.origin?.bridgedImageId).toBe(bridged?.id);
  });

  it("records origin session, words-version and take identity, in the wire shape", async () => {
    const { service } = makeService();

    const project = await service.createProjectFromSessionPicture(
      "user-1",
      SOURCE,
    );

    // Schema-validated on the wire — one origin shape (#86's TakeSourceInput),
    // not a competing one invented here.
    const origin = StudioProjectOriginSchema.parse(project.origin);
    expect(origin).toEqual({
      sessionId: "session-1",
      promptVersionId: "v1",
      sourceInput: {
        kind: "take",
        generationId: "take-1",
        assetId: "1758100000000-abcdef01.webp",
        storagePath: SOURCE.storagePath,
      },
      bridgedImageId: project.attachments?.[0]?.id,
      capturedAtMs: NOW_MS,
    });
  });

  it("owns a durable copy of the media rather than the session's object or a signed URL", async () => {
    const { service, storage } = makeService();

    const project = await service.createProjectFromSessionPicture(
      "user-1",
      SOURCE,
    );

    // The source URL is the one the resolver already minted — the studio does
    // not re-resolve which store holds the source (issue #109) — copied into an
    // object this project owns, tagged with where it came from.
    expect(storage.saveFromUrl).toHaveBeenCalledWith(
      "user-1",
      SOURCE.viewUrl,
      "preview-image",
      expect.objectContaining({
        studioProjectId: project.id,
        originSessionId: "session-1",
        originGenerationId: "take-1",
      }),
    );
    const bridged = project.attachments?.[0];
    expect(bridged?.storagePath).toBe(
      "users/user-1/previews/images/copy-1.webp",
    );
    expect(bridged?.storagePath).not.toBe(SOURCE.storagePath);
    // Nothing volatile is persisted: no URL, signed or otherwise.
    expect(JSON.stringify(project)).not.toContain("https://");
  });

  it("still resolves the picture after the originating session changes", async () => {
    const { service, storage } = makeService();
    const project = await service.createProjectFromSessionPicture(
      "user-1",
      SOURCE,
    );
    const bridgedPath = project.attachments?.[0]?.storagePath;

    // The session moves on: a new words-version, the take removed, the
    // session's own object gone. The studio never reads any of it again.
    storage.getViewUrl.mockImplementation((_userId: string, path: string) => {
      if (path === SOURCE.storagePath) {
        return Promise.reject(new Error("source object is gone"));
      }
      return Promise.resolve({
        viewUrl: `https://signed.example.com/${path}?exp=1h`,
        expiresAt: "2026-09-18T13:00:00Z",
        storagePath: path,
      });
    });

    const reopened = await service.getProjectView("user-1", project.id);

    expect(reopened.origin?.sessionId).toBe("session-1");
    expect(reopened.originImageUrl).toBe(
      `https://signed.example.com/${bridgedPath}?exp=1h`,
    );
  });

  it("yields one project for two invocations on the same take", async () => {
    const { service, store, storage } = makeService();

    const first = await service.createProjectFromSessionPicture(
      "user-1",
      SOURCE,
    );
    const second = await service.createProjectFromSessionPicture(
      "user-1",
      SOURCE,
    );

    expect(second.id).toBe(first.id);
    expect(store.projects.size).toBe(1);
    // The retry re-stores nothing: the bytes were already made durable.
    expect(storage.saveFromUrl).toHaveBeenCalledTimes(1);
    expect(second.attachments).toHaveLength(1);
    expect(second.origin?.capturedAtMs).toBe(first.origin?.capturedAtMs);
  });

  it("gives a different take its own project", async () => {
    const { service, store } = makeService();

    await service.createProjectFromSessionPicture("user-1", SOURCE);
    await service.createProjectFromSessionPicture("user-1", {
      ...SOURCE,
      generationId: "take-2",
      storagePath: "users/user-1/previews/images/other.webp",
    });

    expect(store.projects.size).toBe(2);
  });

  it("derives one project id per creator + session + take", () => {
    const id = studioProjectIdForSessionPicture(
      "user-1",
      "session-1",
      "take-1",
    );

    expect(id).toBe(
      studioProjectIdForSessionPicture("user-1", "session-1", "take-1"),
    );
    expect(id).not.toBe(
      studioProjectIdForSessionPicture("user-2", "session-1", "take-1"),
    );
    expect(id).not.toBe(
      studioProjectIdForSessionPicture("user-1", "session-1", "take-2"),
    );
  });

  it("refuses a storage path outside the creator's own prefix, and stores nothing", async () => {
    const { service, store, storage } = makeService();

    await expect(
      service.createProjectFromSessionPicture("user-1", {
        ...SOURCE,
        storagePath: "users/xuser-1y/previews/images/foreign.webp",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(store.projects.size).toBe(0);
    expect(storage.saveFromUrl).not.toHaveBeenCalled();
  });

  it("refuses an image-previews path owned by another creator, and stores nothing", async () => {
    // The production image store's namespace, anchored to a DIFFERENT owner
    // (issue #109): the both-store ownership check must refuse it just as it
    // refuses a foreign `users/` path — the owner segment is not the caller's.
    const { service, store, storage } = makeService();

    await expect(
      service.createProjectFromSessionPicture("user-1", {
        ...SOURCE,
        storagePath: "image-previews/someone-else/1f2e3d4c5b6a",
        assetId: "1f2e3d4c5b6a",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(store.projects.size).toBe(0);
    expect(storage.saveFromUrl).not.toHaveBeenCalled();
  });

  it("runs an edit turn against the bridged picture, sourcing the project's own copy", async () => {
    const { service, runner, decideTurn } = makeService();
    const project = await service.createProjectFromSessionPicture(
      "user-1",
      SOURCE,
    );
    const bridgedId = project.origin?.bridgedImageId ?? "";
    const bridgedPath = project.attachments?.[0]?.storagePath ?? "";

    decideTurn.mockResolvedValue({
      action: "edit",
      instruction: "remove the chair",
      sourceImageIds: [bridgedId],
      suggestions: ["Warmer light", "Tighter crop", "Cooler grade"],
    } satisfies StudioDecision);

    const result = await service.runTurn(
      "user-1",
      project.id,
      "remove the chair",
    );
    await result.completion;

    // The bridged picture is offerable as a source, and is what ran.
    expect(decideTurn.mock.calls[0]?.[0]?.projectImageIds).toContain(bridgedId);
    // ...and edit/transform are available on the FIRST turn — no preliminary
    // generation needed — because the project already holds that source image
    // before any turn exists (ADR-0022 decision 4, issue #110).
    const firstTurnActions = decideTurn.mock.calls[0]?.[0]?.allowedActions;
    expect(firstTurnActions).toContain("edit");
    expect(firstTurnActions).toContain("transform");
    expect(runner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          image_input: [`https://signed.example.com/${bridgedPath}?exp=1h`],
        }),
      }),
    );

    const turn = await service.getTurn("user-1", project.id, result.turnId);
    expect(turn.status).toBe("complete");
    expect(turn.calls[0]?.status).toBe("succeeded");
    // The call record names the bridged image as the turn's source input.
    expect(turn.decision).toMatchObject({
      action: "edit",
      sourceImageIds: [bridgedId],
    });
  });

  it("hides a bridged project from another creator", async () => {
    const { service } = makeService();
    const project = await service.createProjectFromSessionPicture(
      "user-1",
      SOURCE,
    );

    await expect(
      service.getProjectView("user-2", project.id),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
