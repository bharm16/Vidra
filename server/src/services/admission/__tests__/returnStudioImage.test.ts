import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  returnStudioImage,
  type ReturnStudioImageDependencies,
} from "../returnStudioImage";
import { SessionService } from "@services/sessions/SessionService";
import type { SessionRecord } from "@services/sessions/types";
import { SessionGenerationRecordSchema } from "@shared/schemas/session.schemas";
import { StudioUseInSessionResultSchema } from "@shared/schemas/studio.schemas";
import { StudioService } from "@services/studio/StudioService";
import { StudioModelRegistry } from "@services/studio/StudioModelRegistry";
import { StudioCapExceededError } from "@services/studio/storage/FirestoreStudioProjectStore";
import type { StudioProjectStore } from "@services/studio/storage/StudioProjectStore";
import type {
  StudioCallRecord,
  StudioDecision,
  StudioProjectRecord,
  StudioTurnRecord,
  StudioTurnStatus,
} from "@services/studio/types";
import type { AdmissionIdempotencyPort } from "../admitPictureTake";
import { attachCompletedJobToSession } from "@services/video-generation/jobs/attachJobToSession";
import type { VideoJobRecord } from "@services/video-generation/jobs/types";

/**
 * "Use this in the session" — ADR-0022 decisions 2, 3 and 4, issue #89.
 *
 * The one rule this suite exists to pin: the returning picture's ancestry
 * comes from the PRODUCING TURN and that turn's ACTUAL inputs, never from the
 * project's origin link. An unrelated generation inside a bridged project must
 * come back with no picture ancestor and no `refine` edge; only a turn that
 * really consumed the bridged picture earns one.
 *
 * Seam: the real `StudioService` over an in-memory store double, the real
 * `SessionService` over another, and the real `admitPictureTake` between them.
 * The doubles are the process-external boundaries only — Firestore, GCS, the
 * Replicate runner, the idempotency store and `fetch`. No `vi.mock` of an
 * internal module, and the turn records the bridge reads are the ones a real
 * turn actually wrote.
 */

const OWNER = "user-1";
const STRANGER = "someone-else";
const NOW_MS = new Date("2026-09-17T12:00:00Z").getTime();

/** The session picture the project is born from. */
const SOURCE = {
  sessionId: "session-1",
  promptVersionId: "v1",
  generationId: "take-1",
  storagePath: "users/user-1/previews/images/1758100000000-abcdef01.webp",
  // Minted by the session-side resolver (issue #109); the bridge copies from it.
  viewUrl: "https://signed.example.com/source-picture?exp=1h",
  assetId: "1758100000000-abcdef01.webp",
};

const SESSION_WORDS = "a brass desk lamp on an oak table, dusk light";

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

// ---------------------------------------------------------------- studio side

class FakeStudioStore implements StudioProjectStore {
  projects = new Map<string, StudioProjectRecord>();
  turns = new Map<string, StudioTurnRecord>();

  async createProject(record: StudioProjectRecord): Promise<boolean> {
    if (this.projects.has(record.id)) return false;
    this.projects.set(record.id, { ...record });
    return true;
  }
  async getProject(projectId: string): Promise<StudioProjectRecord | null> {
    return this.projects.get(projectId) ?? null;
  }
  async listProjects(userId: string): Promise<StudioProjectRecord[]> {
    return [...this.projects.values()].filter(
      (project) => project.userId === userId,
    );
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
  async reserveTurn(params: {
    turn: StudioTurnRecord;
    day: string;
    capCents: number;
  }): Promise<void> {
    if (params.turn.reservedCents > params.capCents) {
      throw new StudioCapExceededError(
        0,
        params.turn.reservedCents,
        params.capCents,
      );
    }
    this.turns.set(params.turn.id, { ...params.turn });
  }
  async saveTurn(turn: StudioTurnRecord): Promise<void> {
    this.turns.set(turn.id, { ...turn });
  }
  async refundCents(): Promise<void> {}
  // This fixture RUNS real generate/edit turns to produce the images the
  // return leg reads, so settlement must actually finalize the turn (#126).
  async checkpointCall(
    _projectId: string,
    turnId: string,
    call: StudioCallRecord,
    updatedAtMs: number,
  ): Promise<void> {
    const current = this.turns.get(turnId);
    if (!current || current.status !== "running") return;
    const calls = [...current.calls];
    calls[call.index] = call;
    this.turns.set(turnId, { ...current, calls, updatedAtMs });
  }
  async settleTurn(params: {
    turnId: string;
    status: StudioTurnStatus;
    calls: readonly StudioCallRecord[];
    refundCents: number;
    updatedAtMs: number;
  }): Promise<{ applied: boolean }> {
    const current = this.turns.get(params.turnId);
    if (!current || current.status !== "running") return { applied: false };
    this.turns.set(params.turnId, {
      ...current,
      status: params.status,
      calls: [...params.calls],
      refundedCents: params.refundCents,
      updatedAtMs: params.updatedAtMs,
    });
    return { applied: true };
  }
  async deleteProject(projectId: string): Promise<void> {
    this.projects.delete(projectId);
  }
}

// --------------------------------------------------------------- session side

/** Stands in for Firestore. */
function createSessionStore() {
  const sessions = new Map<string, SessionRecord>();
  let createIfAbsentGate: (() => Promise<void>) | undefined;
  return {
    sessions,
    setCreateIfAbsentGate: (gate: (() => Promise<void>) | undefined) => {
      createIfAbsentGate = gate;
    },
    get: vi.fn(async (id: string) => sessions.get(id) ?? null),
    save: vi.fn(async (next: SessionRecord) => {
      sessions.set(next.id, next);
    }),
    // Firestore's transactional create-if-absent, modelled as an atomic
    // compare-and-set: existence check and write share one synchronous section,
    // so two presses racing the same deterministic id yield one create.
    createIfAbsent: vi.fn(
      async (
        session: SessionRecord,
      ): Promise<{ created: boolean; session: SessionRecord }> => {
        if (createIfAbsentGate) await createIfAbsentGate();
        const existing = sessions.get(session.id);
        if (existing) return { created: false, session: existing };
        sessions.set(session.id, session);
        return { created: true, session };
      },
    ),
    mutate: vi.fn(
      async (
        sessionId: string,
        mutator: (record: SessionRecord) => SessionRecord,
      ): Promise<SessionRecord | null> => {
        const current = sessions.get(sessionId);
        if (!current) return null;
        const next = mutator(current);
        sessions.set(sessionId, next);
        return next;
      },
    ),
    delete: vi.fn(async (sessionId: string) => {
      sessions.delete(sessionId);
    }),
    findByPromptUuid: vi.fn(
      async (userId: string, promptUuid: string) =>
        [...sessions.values()].find(
          (record) =>
            record.userId === userId && record.promptUuid === promptUuid,
        ) ?? null,
    ),
  };
}

/** Stands in for GCS. */
function createMediaStore() {
  const calls: Array<{ contentType: string; userId: string }> = [];
  return {
    calls,
    storeFromBuffer: async (
      _buffer: Buffer,
      contentType: string,
      userId: string,
    ) => {
      calls.push({ contentType, userId });
      const id = `returned-asset-${calls.length}`;
      return {
        id,
        storagePath: `users/${userId}/previews/images/${id}.png`,
        url: `https://storage.example.com/${id}?sig=returned`,
      };
    },
  };
}

type IdempotencyDouble = AdmissionIdempotencyPort & {
  /** Make `markCompleted` throw from its Nth call on (0-based). Call 0 is the
   * pre-append `pending` snapshot; call 1 is the completion rewrite AFTER the
   * take has attached — the window issue #130's safety criterion turns on. */
  failMarkCompletedFrom: (callIndex: number) => void;
};

/** Stands in for the Firestore-backed `RequestIdempotencyService`. */
function createIdempotency(): IdempotencyDouble {
  const records = new Map<
    string,
    {
      payloadHash: string;
      status: "pending" | "completed" | "failed";
      snapshot?: { statusCode: number; body: Record<string, unknown> };
    }
  >();
  let markCompletedCalls = 0;
  let failMarkCompletedFrom = Number.POSITIVE_INFINITY;
  return {
    failMarkCompletedFrom: (callIndex: number) => {
      failMarkCompletedFrom = callIndex;
    },
    claimRequest: async ({ userId, route, key, payload }) => {
      const recordId = `${userId}|${route}|${key}`;
      const payloadHash = JSON.stringify(payload);
      const existing = records.get(recordId);
      if (!existing) {
        records.set(recordId, { payloadHash, status: "pending" });
        return { state: "claimed", recordId };
      }
      if (existing.payloadHash !== payloadHash) {
        return { state: "conflict", recordId };
      }
      if (existing.status === "completed" && existing.snapshot) {
        return { state: "replay", recordId, snapshot: existing.snapshot };
      }
      if (existing.status === "pending") {
        return { state: "in_progress", recordId };
      }
      records.set(recordId, { payloadHash, status: "pending" });
      return { state: "claimed", recordId };
    },
    markCompleted: async ({ recordId, snapshot }) => {
      if (markCompletedCalls++ >= failMarkCompletedFrom) {
        throw new Error("idempotency completion write failed");
      }
      const existing = records.get(recordId);
      if (existing) {
        records.set(recordId, { ...existing, status: "completed", snapshot });
      }
    },
    markFailed: async (recordId) => {
      const existing = records.get(recordId);
      if (existing) records.set(recordId, { ...existing, status: "failed" });
    },
  };
}

// ------------------------------------------------------------------- harness

interface Harness {
  deps: ReturnStudioImageDependencies;
  studio: StudioService;
  studioStore: FakeStudioStore;
  sessions: ReturnType<typeof createSessionStore>;
  sessionService: SessionService;
  mediaStore: ReturnType<typeof createMediaStore>;
  idempotency: IdempotencyDouble;
  decide: ReturnType<typeof vi.fn>;
  /** Content type the bridge's byte read will report. */
  setStoredMedia: (contentType: string) => void;
}

/** Releases every waiter once `parties` of them have arrived — the barrier the
 * concurrency test uses to hold both presses at the create step together. */
function createBarrier(parties: number): { wait: () => Promise<void> } {
  let arrived = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    wait: async () => {
      arrived += 1;
      if (arrived >= parties) release();
      await gate;
    },
  };
}

function setup(): Harness {
  const studioStore = new FakeStudioStore();
  const sessions = createSessionStore();
  const mediaStore = createMediaStore();
  const idempotency = createIdempotency();
  const sessionService = new SessionService(sessions as never);

  let idCounter = 0;
  let copyCounter = 0;
  let generatedCounter = 0;

  const runner = {
    run: vi.fn(async () => ({
      imageUrl: `https://replicate.delivery/out-${++generatedCounter}.png`,
      durationMs: 800,
    })),
  };

  const storage = {
    saveFromUrl: vi.fn(async () => ({
      storagePath: `users/${OWNER}/previews/images/studio-${++copyCounter}.png`,
    })),
    getViewUrl: vi.fn(async (_userId: string, path: string) => ({
      viewUrl: `https://signed.example.com/${path}?exp=1h`,
      expiresAt: "2026-09-17T13:00:00Z",
      storagePath: path,
    })),
  };

  const decide = vi.fn(async () => ({ action: "diagnose" }) as StudioDecision);

  const studio = new StudioService({
    store: studioStore,
    registry: new StudioModelRegistry(),
    runner,
    storage,
    policy: { decideTurn: decide },
    dailyCapCents: 5000,
    now: () => new Date(NOW_MS),
    idFactory: () => `id-${++idCounter}`,
  });

  let storedContentType = "image/png";

  return {
    deps: {
      studio,
      sessionService,
      mediaStore,
      idempotency,
    },
    studio,
    studioStore,
    sessions,
    sessionService,
    mediaStore,
    idempotency,
    decide,
    setStoredMedia: (contentType: string) => {
      storedContentType = contentType;
      globalThis.fetch = vi.fn(
        async () =>
          new Response(PNG_BYTES, {
            status: 200,
            headers: {
              "content-type": storedContentType,
              "content-length": String(PNG_BYTES.length),
            },
          }),
      ) as never;
    },
  };
}

/**
 * The session the bridged picture came from, as the page left it. Written
 * straight into the store double so it carries the id the project's origin
 * names — the session already exists by the time anyone opens the studio.
 */
function seedSession(
  sessions: ReturnType<typeof createSessionStore>,
  overrides: { userId?: string } = {},
): SessionRecord {
  const record: SessionRecord = {
    id: SOURCE.sessionId,
    userId: overrides.userId ?? OWNER,
    name: SESSION_WORDS,
    status: "active",
    createdAt: new Date(NOW_MS - 3_600_000),
    updatedAt: new Date(NOW_MS - 3_600_000),
    promptUuid: "prompt-uuid-1",
    prompt: {
      uuid: "prompt-uuid-1",
      title: SESSION_WORDS,
      input: SESSION_WORDS,
      output: SESSION_WORDS,
      versions: [
        {
          versionId: SOURCE.promptVersionId,
          label: "v1",
          signature: "sig-1",
          prompt: SESSION_WORDS,
          timestamp: "2026-09-17T11:00:00Z",
          generations: [
            {
              id: SOURCE.generationId,
              mediaType: "image",
              status: "completed",
              prompt: SESSION_WORDS,
              mediaUrls: ["https://storage.example.com/take-1"],
              mediaAssetIds: [SOURCE.assetId],
              storagePath: SOURCE.storagePath,
              promptVersionId: SOURCE.promptVersionId,
              ancestorGenerationId: null,
              origin: "generated",
            },
          ],
        },
      ],
    },
  };
  sessions.sessions.set(record.id, record);
  return record;
}

function takesOf(session: SessionRecord, versionId: string) {
  return (
    session.prompt?.versions?.find((entry) => entry.versionId === versionId)
      ?.generations ?? []
  );
}

/** Run one turn and return the image ids it produced, in call order. */
async function runTurn(
  studio: StudioService,
  decide: ReturnType<typeof vi.fn>,
  projectId: string,
  message: string,
  decision: StudioDecision,
): Promise<{ turnId: string; imageIds: string[] }> {
  decide.mockResolvedValueOnce(decision);
  const { turnId, completion } = await studio.runTurn(
    OWNER,
    projectId,
    message,
  );
  await completion;
  const turn = await studio.getTurn(OWNER, projectId, turnId);
  return {
    turnId,
    imageIds: turn.calls.flatMap((call) =>
      call.status === "succeeded" && call.image ? [call.image.id] : [],
    ),
  };
}

const editDecision = (
  instruction: string,
  sourceImageIds: string[],
): StudioDecision => ({
  action: "edit",
  instruction,
  sourceImageIds,
  suggestions: ["a", "b", "c"],
});

const generateDecision = (basePrompt: string): StudioDecision => ({
  action: "generate",
  basePrompt,
  variants: [basePrompt, basePrompt, basePrompt, basePrompt],
  capability: "general",
  suggestions: ["a", "b", "c"],
});

describe("returnStudioImage (ADR-0022 decisions 2/3/4, issue #89)", () => {
  let fixture: Harness;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fixture = setup();
    fixture.setStoredMedia("image/png");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  async function bridgedProject(): Promise<StudioProjectRecord> {
    seedSession(fixture.sessions);
    return fixture.studio.createProjectFromSessionPicture(OWNER, SOURCE);
  }

  it("returns an edit of the bridged picture with origin studio, the source take as its ancestor, and the producing turn and image recorded", async () => {
    const project = await bridgedProject();
    const { turnId, imageIds } = await runTurn(
      fixture.studio,
      fixture.decide,
      project.id,
      "warm the light",
      editDecision("warm the light", [project.origin!.bridgedImageId]),
    );

    const result = await returnStudioImage(fixture.deps, {
      userId: OWNER,
      projectId: project.id,
      imageId: imageIds[0]!,
    });

    expect(result.state).toBe("returned");
    if (result.state !== "returned") return;
    // The wire shape is the contract, not an ad-hoc object.
    StudioUseInSessionResultSchema.parse(result.result);
    expect(result.result.sessionId).toBe(SOURCE.sessionId);
    expect(result.result.promptVersionId).toBe(SOURCE.promptVersionId);
    expect(result.result.ancestorGenerationId).toBe(SOURCE.generationId);
    expect(result.result.createdSession).toBe(false);

    // A refresh renders it from server records alone: everything the space
    // needs is in the persisted take, validated by the wire contract.
    const session = fixture.sessions.sessions.get(SOURCE.sessionId)!;
    const returned = takesOf(session, SOURCE.promptVersionId).find(
      (take) => take.id === result.result.generationId,
    )!;
    const record = SessionGenerationRecordSchema.parse(returned);
    expect(record.origin).toBe("studio");
    // The refine edge: a picture whose display ancestor is another picture.
    expect(record.ancestorGenerationId).toBe(SOURCE.generationId);
    expect(record.productionProvenance).toEqual({
      state: "known",
      instruction: "warm the light",
      model: "nano-banana-2",
      studio: { projectId: project.id, turnId, imageId: imageIds[0] },
    });
    // The bridged picture is recorded as a take input — which is what makes
    // the display ancestor a recorded choice rather than a guess.
    expect(record.sourceInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "take",
          generationId: SOURCE.generationId,
          storagePath: SOURCE.storagePath,
        }),
      ]),
    );
  });

  it("gives an unrelated generation in the same project no picture ancestor and no refine edge", async () => {
    const project = await bridgedProject();
    const { imageIds } = await runTurn(
      fixture.studio,
      fixture.decide,
      project.id,
      "a completely different subject",
      generateDecision("a paper crane on a windowsill"),
    );

    const result = await returnStudioImage(fixture.deps, {
      userId: OWNER,
      projectId: project.id,
      imageId: imageIds[0]!,
    });

    expect(result.state).toBe("returned");
    if (result.state !== "returned") return;
    expect(result.result.ancestorGenerationId).toBeNull();

    const session = fixture.sessions.sessions.get(SOURCE.sessionId)!;
    const returned = takesOf(session, SOURCE.promptVersionId).find(
      (take) => take.id === result.result.generationId,
    )!;
    expect(returned.ancestorGenerationId).toBeNull();
    // A generate has no image inputs at all, so the only source input is the
    // returned picture itself — never the project's bridged take.
    expect(
      (returned.sourceInputs as Array<{ kind: string }>).some(
        (input) => input.kind === "take",
      ),
    ).toBe(false);
  });

  it("records every input of a multi-input edit while exposing exactly one display ancestor", async () => {
    const project = await bridgedProject();
    const seeded = await runTurn(
      fixture.studio,
      fixture.decide,
      project.id,
      "a reference plate",
      generateDecision("a reference plate"),
    );
    const edited = await runTurn(
      fixture.studio,
      fixture.decide,
      project.id,
      "combine them",
      editDecision("combine them", [
        project.origin!.bridgedImageId,
        seeded.imageIds[0]!,
        seeded.imageIds[1]!,
      ]),
    );

    const result = await returnStudioImage(fixture.deps, {
      userId: OWNER,
      projectId: project.id,
      imageId: edited.imageIds[0]!,
    });

    expect(result.state).toBe("returned");
    if (result.state !== "returned") return;

    const session = fixture.sessions.sessions.get(SOURCE.sessionId)!;
    const returned = takesOf(session, SOURCE.promptVersionId).find(
      (take) => take.id === result.result.generationId,
    )!;
    const inputs = returned.sourceInputs as Array<{
      kind: string;
      generationId?: string;
      storagePath?: string;
    }>;

    // Three inputs the turn consumed, plus the returned picture itself.
    expect(inputs).toHaveLength(4);
    expect(
      inputs.filter((input) => input.kind === "studio-image"),
    ).toHaveLength(3);
    // Exactly one take input, and it is the display ancestor.
    const takeInputs = inputs.filter((input) => input.kind === "take");
    expect(takeInputs).toHaveLength(1);
    expect(returned.ancestorGenerationId).toBe(takeInputs[0]!.generationId);
    expect(returned.ancestorGenerationId).toBe(SOURCE.generationId);
  });

  it("starts a new session, with the producing prompt as its words, for a project with no origin session", async () => {
    const project = await fixture.studio.createProject(OWNER, "Standalone");
    const { imageIds } = await runTurn(
      fixture.studio,
      fixture.decide,
      project.id,
      "a paper crane",
      generateDecision("a paper crane on a windowsill"),
    );

    const result = await returnStudioImage(fixture.deps, {
      userId: OWNER,
      projectId: project.id,
      imageId: imageIds[0]!,
    });

    expect(result.state).toBe("returned");
    if (result.state !== "returned") return;
    expect(result.result.createdSession).toBe(true);

    const session = fixture.sessions.sessions.get(result.result.sessionId)!;
    expect(session.userId).toBe(OWNER);
    const versions = session.prompt?.versions ?? [];
    expect(versions).toHaveLength(1);
    expect(versions[0]!.versionId).toBe(result.result.promptVersionId);
    expect(versions[0]!.prompt).toBe("a paper crane on a windowsill");
    expect(takesOf(session, result.result.promptVersionId)).toHaveLength(1);
  });

  it("refuses with a recoverable error when the origin session is gone, and never silently recreates it", async () => {
    const project = await bridgedProject();
    const { imageIds } = await runTurn(
      fixture.studio,
      fixture.decide,
      project.id,
      "warm the light",
      editDecision("warm the light", [project.origin!.bridgedImageId]),
    );

    fixture.sessions.sessions.delete(SOURCE.sessionId);

    const refused = await returnStudioImage(fixture.deps, {
      userId: OWNER,
      projectId: project.id,
      imageId: imageIds[0]!,
    });

    expect(refused.state).toBe("origin-session-missing");
    if (refused.state !== "origin-session-missing") return;
    expect(refused.sessionId).toBe(SOURCE.sessionId);
    // Nothing was created behind the creator's back.
    expect(fixture.sessions.sessions.size).toBe(0);
    expect(fixture.mediaStore.calls).toHaveLength(0);

    // The creator's explicit answer starts one.
    const chosen = await returnStudioImage(fixture.deps, {
      userId: OWNER,
      projectId: project.id,
      imageId: imageIds[0]!,
      onMissingOriginSession: "new-session",
    });

    expect(chosen.state).toBe("returned");
    if (chosen.state !== "returned") return;
    expect(chosen.result.createdSession).toBe(true);
    expect(chosen.result.sessionId).not.toBe(SOURCE.sessionId);
    // The bridged picture is not a take of THIS session, so no refine edge.
    expect(chosen.result.ancestorGenerationId).toBeNull();
  });

  it("is idempotent: pressing twice yields one take, and leaves the source take and the project untouched", async () => {
    const project = await bridgedProject();
    const { imageIds } = await runTurn(
      fixture.studio,
      fixture.decide,
      project.id,
      "warm the light",
      editDecision("warm the light", [project.origin!.bridgedImageId]),
    );
    const projectBefore = JSON.stringify(
      await fixture.studioStore.getProject(project.id),
    );
    const sourceBefore = JSON.stringify(
      takesOf(
        fixture.sessions.sessions.get(SOURCE.sessionId)!,
        SOURCE.promptVersionId,
      ).find((take) => take.id === SOURCE.generationId),
    );

    const first = await returnStudioImage(fixture.deps, {
      userId: OWNER,
      projectId: project.id,
      imageId: imageIds[0]!,
    });
    const second = await returnStudioImage(fixture.deps, {
      userId: OWNER,
      projectId: project.id,
      imageId: imageIds[0]!,
    });

    expect(first.state).toBe("returned");
    expect(second.state).toBe("returned");
    if (first.state !== "returned" || second.state !== "returned") return;
    expect(second.result.generationId).toBe(first.result.generationId);

    const session = fixture.sessions.sessions.get(SOURCE.sessionId)!;
    const takes = takesOf(session, SOURCE.promptVersionId);
    expect(takes.filter((take) => take.origin === "studio")).toHaveLength(1);
    // The media is stored once — a replay re-stores nothing.
    expect(fixture.mediaStore.calls).toHaveLength(1);

    // Both survivors are exactly as they were.
    expect(
      JSON.stringify(takes.find((take) => take.id === SOURCE.generationId)),
    ).toBe(sourceBefore);
    expect(
      JSON.stringify(await fixture.studioStore.getProject(project.id)),
    ).toBe(projectBefore);
  });

  it("arms the returned raster as the session's first frame, carrying the take identity", async () => {
    const project = await bridgedProject();
    const { imageIds } = await runTurn(
      fixture.studio,
      fixture.decide,
      project.id,
      "warm the light",
      editDecision("warm the light", [project.origin!.bridgedImageId]),
    );

    const result = await returnStudioImage(fixture.deps, {
      userId: OWNER,
      projectId: project.id,
      imageId: imageIds[0]!,
    });
    expect(result.state).toBe("returned");
    if (result.state !== "returned") return;

    const session = fixture.sessions.sessions.get(SOURCE.sessionId)!;
    const armed = session.prompt?.keyframes?.[0];
    expect(armed).toMatchObject({
      generationId: result.result.generationId,
      url: result.result.imageUrl,
      source: "generation",
    });
  });

  it("links a clip made from the returned frame to that take", async () => {
    const project = await bridgedProject();
    const { imageIds } = await runTurn(
      fixture.studio,
      fixture.decide,
      project.id,
      "warm the light",
      editDecision("warm the light", [project.origin!.bridgedImageId]),
    );
    const result = await returnStudioImage(fixture.deps, {
      userId: OWNER,
      projectId: project.id,
      imageId: imageIds[0]!,
    });
    expect(result.state).toBe("returned");
    if (result.state !== "returned") return;

    // "Make it move" threads the armed frame's generationId as the job's
    // sourceGenerationId; the clip's attachment writes it as its ancestor.
    const armed = fixture.sessions.sessions.get(SOURCE.sessionId)!.prompt
      ?.keyframes?.[0];
    const job = {
      id: "job-1",
      userId: OWNER,
      sessionId: SOURCE.sessionId,
      promptVersionId: SOURCE.promptVersionId,
      sourceGenerationId: armed!.generationId,
      request: { prompt: SESSION_WORDS, options: { model: "wan-2.5" } },
      result: { videoUrl: "https://storage.example.com/clip.mp4" },
    } as unknown as VideoJobRecord;

    await attachCompletedJobToSession({
      job,
      jobStore: {},
      sessionService: fixture.sessionService,
      log: { warn: vi.fn() },
      logPrefix: "test",
    });

    const clip = takesOf(
      fixture.sessions.sessions.get(SOURCE.sessionId)!,
      SOURCE.promptVersionId,
    ).find((take) => take.id === "job-1")!;
    expect(clip.ancestorGenerationId).toBe(result.result.generationId);
  });

  it("refuses media a first frame cannot be armed from, explaining why, and stores nothing", async () => {
    const project = await bridgedProject();
    const { imageIds } = await runTurn(
      fixture.studio,
      fixture.decide,
      project.id,
      "vectorize it",
      editDecision("vectorize it", [project.origin!.bridgedImageId]),
    );
    fixture.setStoredMedia("image/svg+xml");

    const result = await returnStudioImage(fixture.deps, {
      userId: OWNER,
      projectId: project.id,
      imageId: imageIds[0]!,
    });

    expect(result.state).toBe("unusable-media");
    if (result.state !== "unusable-media") return;
    expect(result.reason).toContain("image/svg+xml");
    expect(fixture.mediaStore.calls).toHaveLength(0);
    const session = fixture.sessions.sessions.get(SOURCE.sessionId)!;
    expect(
      takesOf(session, SOURCE.promptVersionId).filter(
        (take) => take.origin === "studio",
      ),
    ).toHaveLength(0);
  });

  it("refuses to bridge into a session the creator does not own, storing nothing", async () => {
    // The project is the creator's; its origin names a session that is not.
    seedSession(fixture.sessions, { userId: STRANGER });
    const project = await fixture.studio.createProjectFromSessionPicture(
      OWNER,
      SOURCE,
    );
    const { imageIds } = await runTurn(
      fixture.studio,
      fixture.decide,
      project.id,
      "warm the light",
      editDecision("warm the light", [project.origin!.bridgedImageId]),
    );

    const result = await returnStudioImage(fixture.deps, {
      userId: OWNER,
      projectId: project.id,
      imageId: imageIds[0]!,
    });

    expect(result.state).toBe("refused");
    expect(fixture.mediaStore.calls).toHaveLength(0);
    const session = fixture.sessions.sessions.get(SOURCE.sessionId)!;
    expect(takesOf(session, SOURCE.promptVersionId)).toHaveLength(1);
  });

  it("refuses an image the project never produced", async () => {
    const project = await bridgedProject();

    const result = await returnStudioImage(fixture.deps, {
      userId: OWNER,
      projectId: project.id,
      // The bridged picture is an attachment, not something the studio made.
      imageId: project.origin!.bridgedImageId,
    });

    expect(result.state).toBe("not-found");
  });

  it("creates one session and one take when two presses of the same image race at the create step", async () => {
    // A standalone project mints a session on return — the path where two
    // presses could each mint their own before issue #130.
    const project = await fixture.studio.createProject(OWNER, "Standalone");
    const { imageIds } = await runTurn(
      fixture.studio,
      fixture.decide,
      project.id,
      "a paper crane",
      generateDecision("a paper crane on a windowsill"),
    );

    const barrier = createBarrier(2);
    fixture.sessions.setCreateIfAbsentGate(() => barrier.wait());

    const press = () =>
      returnStudioImage(fixture.deps, {
        userId: OWNER,
        projectId: project.id,
        imageId: imageIds[0]!,
      });
    const [first, second] = await Promise.all([press(), press()]);

    // One session, one take — never two rows for one image.
    expect(fixture.sessions.sessions.size).toBe(1);
    const session = [...fixture.sessions.sessions.values()][0]!;
    const versionId = session.prompt?.versions?.[0]?.versionId;
    expect(versionId).toBeDefined();
    expect(takesOf(session, versionId!)).toHaveLength(1);
    // The picture is stored once — the loser replays or backs off.
    expect(fixture.mediaStore.calls).toHaveLength(1);
    expect([first.state, second.state]).toContain("returned");
    for (const state of [first.state, second.state]) {
      expect(["returned", "in_progress"]).toContain(state);
    }
  });

  it("keeps the minted session AND its take when the completion write fails after the take has attached", async () => {
    const project = await fixture.studio.createProject(OWNER, "Standalone");
    const { imageIds } = await runTurn(
      fixture.studio,
      fixture.decide,
      project.id,
      "a paper crane",
      generateDecision("a paper crane on a windowsill"),
    );

    // Land the pending snapshot (call 0), fail the completion rewrite (call 1)
    // — the write that runs AFTER the take is already in its session.
    // Compensation must never delete committed work (issue #130).
    fixture.idempotency.failMarkCompletedFrom(1);

    const result = await returnStudioImage(fixture.deps, {
      userId: OWNER,
      projectId: project.id,
      imageId: imageIds[0]!,
    });

    expect(result.state).toBe("unavailable");

    // The session this return minted, and the take that attached, survive.
    expect(fixture.sessions.sessions.size).toBe(1);
    const session = [...fixture.sessions.sessions.values()][0]!;
    const versionId = session.prompt?.versions?.[0]?.versionId;
    const takes = takesOf(session, versionId!);
    expect(takes).toHaveLength(1);
    expect(takes[0]!.origin).toBe("studio");
    const attachedTakeId = takes[0]!.id;

    // The picture is durable: one store, never rolled back.
    expect(fixture.mediaStore.calls).toHaveLength(1);

    // Resumable: a retry once the store recovers replays the SAME take.
    fixture.idempotency.failMarkCompletedFrom(Number.POSITIVE_INFINITY);
    const retry = await returnStudioImage(fixture.deps, {
      userId: OWNER,
      projectId: project.id,
      imageId: imageIds[0]!,
    });

    expect(retry.state).toBe("returned");
    if (retry.state !== "returned") return;
    expect(retry.result.generationId).toBe(attachedTakeId);
    expect(fixture.sessions.sessions.size).toBe(1);
    const after = [...fixture.sessions.sessions.values()][0]!;
    expect(takesOf(after, versionId!)).toHaveLength(1);
  });
});
