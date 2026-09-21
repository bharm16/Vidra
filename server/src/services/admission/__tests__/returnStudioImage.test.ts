import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  readUnresolvedReturnAttachment,
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
    // Honors the storage type the studio chose, so a vector producer lands a
    // real `.svg` path under the vector lane and a raster producer a `.png`
    // (issue #118). The bridge's own vector guard keys off exactly this path.
    saveFromUrl: vi.fn(
      async (
        _userId: string,
        _sourceUrl: string,
        type: "preview-image" | "preview-vector",
      ) => ({
        storagePath:
          type === "preview-vector"
            ? `users/${OWNER}/previews/vectors/vector-${++copyCounter}.svg`
            : `users/${OWNER}/previews/images/studio-${++copyCounter}.png`,
      }),
    ),
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

/** A prompt-less utility turn (S-30) — `vectorize` produces SVG output. */
const transformDecision = (
  operation: "remove_background" | "vectorize",
  sourceImageId: string,
): StudioDecision => ({
  action: "transform",
  operation,
  sourceImageId,
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

  it("asks for confirmed words before minting a session, prefilled from a generate's prompt, and files the take under the CONFIRMED words (issue #131)", async () => {
    const project = await fixture.studio.createProject(OWNER, "Standalone");
    const { imageIds } = await runTurn(
      fixture.studio,
      fixture.decide,
      project.id,
      "a paper crane",
      generateDecision("a paper crane on a windowsill"),
    );

    // First press: a new session is owed, so its associated words must be
    // confirmed. A from-scratch generate's prompt IS a standalone description,
    // so it prefills the suggestion — but nothing is minted or stored yet.
    const asked = await returnStudioImage(fixture.deps, {
      userId: OWNER,
      projectId: project.id,
      imageId: imageIds[0]!,
    });
    expect(asked.state).toBe("needs-confirmed-words");
    if (asked.state !== "needs-confirmed-words") return;
    expect(asked.suggestion).toBe("a paper crane on a windowsill");
    expect(fixture.sessions.sessions.size).toBe(0);
    expect(fixture.mediaStore.calls).toHaveLength(0);

    // The creator edits the suggestion and confirms; the CONFIRMED words — not
    // the producing prompt — become the session's words.
    const result = await returnStudioImage(fixture.deps, {
      userId: OWNER,
      projectId: project.id,
      imageId: imageIds[0]!,
      confirmedWords: "a paper crane on a marble windowsill",
    });

    expect(result.state).toBe("returned");
    if (result.state !== "returned") return;
    expect(result.result.createdSession).toBe(true);

    const session = fixture.sessions.sessions.get(result.result.sessionId)!;
    expect(session.userId).toBe(OWNER);
    expect(session.name).toBe("a paper crane on a marble windowsill");
    const versions = session.prompt?.versions ?? [];
    expect(versions).toHaveLength(1);
    expect(versions[0]!.versionId).toBe(result.result.promptVersionId);
    expect(versions[0]!.prompt).toBe("a paper crane on a marble windowsill");
    expect(takesOf(session, result.result.promptVersionId)).toHaveLength(1);
  });

  it("asks for confirmed words for an edited image WITHOUT offering the instruction, and keeps the instruction as production provenance (issue #131, ADR-0022 decision 2)", async () => {
    // A standalone project, then an EDIT — its producing text is an
    // instruction ("remove the chair"), which must never be restored as words.
    const project = await fixture.studio.createProject(OWNER, "Standalone");
    const seeded = await runTurn(
      fixture.studio,
      fixture.decide,
      project.id,
      "a chair in a room",
      generateDecision("a red chair in a sunlit room"),
    );
    const edited = await runTurn(
      fixture.studio,
      fixture.decide,
      project.id,
      "remove the chair",
      editDecision("remove the chair", [seeded.imageIds[0]!]),
    );

    const asked = await returnStudioImage(fixture.deps, {
      userId: OWNER,
      projectId: project.id,
      imageId: edited.imageIds[0]!,
    });
    expect(asked.state).toBe("needs-confirmed-words");
    if (asked.state !== "needs-confirmed-words") return;
    // The instruction is NEVER offered as the words.
    expect(asked.suggestion).toBeUndefined();
    expect(fixture.sessions.sessions.size).toBe(0);

    // The creator supplies their own words; the instruction becomes provenance.
    const result = await returnStudioImage(fixture.deps, {
      userId: OWNER,
      projectId: project.id,
      imageId: edited.imageIds[0]!,
      confirmedWords: "an empty sunlit room",
    });
    expect(result.state).toBe("returned");
    if (result.state !== "returned") return;

    const session = fixture.sessions.sessions.get(result.result.sessionId)!;
    expect(session.prompt?.versions?.[0]!.prompt).toBe("an empty sunlit room");
    const returned = takesOf(session, result.result.promptVersionId).find(
      (take) => take.id === result.result.generationId,
    )!;
    const record = SessionGenerationRecordSchema.parse(returned);
    // The take's own words are the confirmed words...
    expect(record.prompt).toBe("an empty sunlit room");
    // ...and the instruction lives ONLY as production provenance, never words.
    expect(record.productionProvenance).toMatchObject({
      state: "known",
      instruction: "remove the chair",
    });
  });

  it("requires the creator's words for a transform, whose producing text is an operation label, offering no suggestion (issue #131)", async () => {
    const project = await fixture.studio.createProject(OWNER, "Standalone");
    const seeded = await runTurn(
      fixture.studio,
      fixture.decide,
      project.id,
      "a fox logo",
      generateDecision("a minimalist fox logo"),
    );
    const transformed = await runTurn(
      fixture.studio,
      fixture.decide,
      project.id,
      "remove the background",
      transformDecision("remove_background", seeded.imageIds[0]!),
    );

    const asked = await returnStudioImage(fixture.deps, {
      userId: OWNER,
      projectId: project.id,
      imageId: transformed.imageIds[0]!,
    });
    expect(asked.state).toBe("needs-confirmed-words");
    if (asked.state !== "needs-confirmed-words") return;
    expect(asked.suggestion).toBeUndefined();
    expect(fixture.sessions.sessions.size).toBe(0);
  });

  it("requires the creator's words for a multi-input composition, never picking one source's prompt (issue #131, rule 2)", async () => {
    const project = await fixture.studio.createProject(OWNER, "Standalone");
    const seeded = await runTurn(
      fixture.studio,
      fixture.decide,
      project.id,
      "two plates",
      generateDecision("a reference plate"),
    );
    const composed = await runTurn(
      fixture.studio,
      fixture.decide,
      project.id,
      "combine them",
      editDecision("combine them", [seeded.imageIds[0]!, seeded.imageIds[1]!]),
    );

    const asked = await returnStudioImage(fixture.deps, {
      userId: OWNER,
      projectId: project.id,
      imageId: composed.imageIds[0]!,
    });
    expect(asked.state).toBe("needs-confirmed-words");
    if (asked.state !== "needs-confirmed-words") return;
    // No unique original prompt is picked from the several inputs.
    expect(asked.suggestion).toBeUndefined();
  });

  it("treats changed confirmed words as a distinct acceptance, never a silent replay of the first words (issue #131, #114)", async () => {
    const project = await fixture.studio.createProject(OWNER, "Standalone");
    const { imageIds } = await runTurn(
      fixture.studio,
      fixture.decide,
      project.id,
      "a paper crane",
      generateDecision("a paper crane on a windowsill"),
    );

    const first = await returnStudioImage(fixture.deps, {
      userId: OWNER,
      projectId: project.id,
      imageId: imageIds[0]!,
      confirmedWords: "a paper crane on a windowsill",
    });
    expect(first.state).toBe("returned");
    if (first.state !== "returned") return;

    // The SAME confirmed words replay the one take — a genuine retry is safe.
    const replay = await returnStudioImage(fixture.deps, {
      userId: OWNER,
      projectId: project.id,
      imageId: imageIds[0]!,
      confirmedWords: "a paper crane on a windowsill",
    });
    expect(replay.state).toBe("returned");
    if (replay.state !== "returned") return;
    expect(replay.result.generationId).toBe(first.result.generationId);

    // DIFFERENT confirmed words are a different acceptance: the changed
    // description is part of the acceptance identity (#114), so the second
    // press is refused as a conflict rather than silently replaying the first.
    const changed = await returnStudioImage(fixture.deps, {
      userId: OWNER,
      projectId: project.id,
      imageId: imageIds[0]!,
      confirmedWords: "a paper crane on a marble windowsill",
    });
    expect(changed.state).toBe("conflict");

    // One take, one stored picture — the changed press committed nothing.
    const session = [...fixture.sessions.sessions.values()][0]!;
    const versionId = session.prompt?.versions?.[0]?.versionId;
    expect(versionId).toBeDefined();
    expect(
      takesOf(session, versionId!).filter((take) => take.origin === "studio"),
    ).toHaveLength(1);
    expect(fixture.mediaStore.calls).toHaveLength(1);
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

    // Choosing a new session mints one, so its words must be confirmed too
    // (issue #131). This was an EDIT of the bridged picture, so no description
    // is offered — the creator's words are required.
    const asked = await returnStudioImage(fixture.deps, {
      userId: OWNER,
      projectId: project.id,
      imageId: imageIds[0]!,
      onMissingOriginSession: "new-session",
    });
    expect(asked.state).toBe("needs-confirmed-words");
    if (asked.state !== "needs-confirmed-words") return;
    expect(asked.suggestion).toBeUndefined();
    // Still nothing created behind the creator's back.
    expect(fixture.sessions.sessions.size).toBe(0);

    // The creator's explicit answer — both the new-session choice and the
    // words — starts one.
    const chosen = await returnStudioImage(fixture.deps, {
      userId: OWNER,
      projectId: project.id,
      imageId: imageIds[0]!,
      onMissingOriginSession: "new-session",
      confirmedWords: "a warmly lit study",
    });

    expect(chosen.state).toBe("returned");
    if (chosen.state !== "returned") return;
    expect(chosen.result.createdSession).toBe(true);
    expect(chosen.result.sessionId).not.toBe(SOURCE.sessionId);
    // The bridged picture is not a take of THIS session, so no refine edge.
    expect(chosen.result.ancestorGenerationId).toBeNull();
    // The new session carries the confirmed words, not the edit instruction.
    const created = fixture.sessions.sessions.get(chosen.result.sessionId)!;
    expect(created.prompt?.versions?.[0]!.prompt).toBe("a warmly lit study");
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

  /**
   * Issue #118, first-frame path: the chosen bridge behavior for a stored
   * vector is a clear refusal (the ADR permits refuse OR rasterize; refuse is
   * the shipped path). Distinct from the test above — that one exercises the
   * content-type gate on a raster-lane object; this exercises the realistic
   * shape, a vector persisted in its own lane, caught by the bridge's own
   * vector guard BEFORE any destination is resolved or byte is read. Nothing
   * is minted or stored, and the reason names the format rather than a MIME
   * string.
   */
  it("refuses a stored vector as a first frame with a clear message, minting and storing nothing", async () => {
    const project = await bridgedProject();
    const { imageIds } = await runTurn(
      fixture.studio,
      fixture.decide,
      project.id,
      "make it a vector",
      transformDecision("vectorize", project.origin!.bridgedImageId),
    );

    const sessionsBefore = fixture.sessions.sessions.size;
    const result = await returnStudioImage(fixture.deps, {
      userId: OWNER,
      projectId: project.id,
      imageId: imageIds[0]!,
    });

    expect(result.state).toBe("unusable-media");
    if (result.state !== "unusable-media") return;
    expect(result.reason).toContain("vector");
    expect(result.reason).toContain("cannot be animated here yet");
    // Refused before any write: no admission, no minted session, no bytes.
    expect(fixture.mediaStore.calls).toHaveLength(0);
    expect(fixture.sessions.sessions.size).toBe(sessionsBefore);
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

    // Both presses carry the SAME confirmed words, so they are the same
    // acceptance and converge on one session (issue #131 + #130).
    const press = () =>
      returnStudioImage(fixture.deps, {
        userId: OWNER,
        projectId: project.id,
        imageId: imageIds[0]!,
        confirmedWords: "a paper crane on a windowsill",
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
      confirmedWords: "a paper crane on a windowsill",
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
      confirmedWords: "a paper crane on a windowsill",
    });

    expect(retry.state).toBe("returned");
    if (retry.state !== "returned") return;
    expect(retry.result.generationId).toBe(attachedTakeId);
    expect(fixture.sessions.sessions.size).toBe(1);
    const after = [...fixture.sessions.sessions.values()][0]!;
    expect(takesOf(after, versionId!)).toHaveLength(1);
  });

  // ---------------------------------------------------- issue #132: the chain
  //
  // A return of an image the session has ALREADY admitted must resolve that
  // consumed source to the take it became, so edit → return → edit again →
  // return draws a refine edge per hop. The relationship is owned by the take
  // record the first return wrote (its provenance names the producing project
  // and image identities); the lookup is the session-side twin of the #121
  // identity-based produced-image retrieval.

  /** Hop 1 of the chain: edit the bridged picture, return it into the session. */
  async function returnEditOfBridgedPicture(projectId: string, bridgedImageId: string) {
    const { imageIds } = await runTurn(
      fixture.studio,
      fixture.decide,
      projectId,
      "warm the light",
      editDecision("warm the light", [bridgedImageId]),
    );
    const result = await returnStudioImage(fixture.deps, {
      userId: OWNER,
      projectId,
      imageId: imageIds[0]!,
    });
    expect(result.state).toBe("returned");
    if (result.state !== "returned") throw new Error("first hop failed");
    return { producedImageId: imageIds[0]!, returned: result.result };
  }

  it("continues the refine chain: an edit of an already-returned image resolves to the take it became (edit → return → edit → return draws two refine edges)", async () => {
    const project = await bridgedProject();
    const hop1 = await returnEditOfBridgedPicture(
      project.id,
      project.origin!.bridgedImageId,
    );

    // Hop 2: edit the RETURNED image and return that.
    const { imageIds } = await runTurn(
      fixture.studio,
      fixture.decide,
      project.id,
      "cool it back down",
      editDecision("cool it back down", [hop1.producedImageId]),
    );
    const hop2 = await returnStudioImage(fixture.deps, {
      userId: OWNER,
      projectId: project.id,
      imageId: imageIds[0]!,
    });

    expect(hop2.state).toBe("returned");
    if (hop2.state !== "returned") return;
    // The second hop's ancestor is the take the first return created — not
    // the bridged original, and not nothing.
    expect(hop2.result.ancestorGenerationId).toBe(hop1.returned.generationId);

    const session = fixture.sessions.sessions.get(SOURCE.sessionId)!;
    const takes = takesOf(session, SOURCE.promptVersionId);
    const take1 = takes.find((take) => take.id === hop1.returned.generationId)!;
    const take2 = takes.find((take) => take.id === hop2.result.generationId)!;
    // Two refine edges, each landing on the correct take.
    expect(take1.ancestorGenerationId).toBe(SOURCE.generationId);
    expect(take2.ancestorGenerationId).toBe(hop1.returned.generationId);
    const inputs = take2.sourceInputs as Array<{
      kind: string;
      generationId?: string;
      storagePath?: string;
    }>;
    // Exactly one take input — the first returned take, named by its own
    // durable handle from the session record, never re-pointed at studio media.
    const takeInputs = inputs.filter((input) => input.kind === "take");
    expect(takeInputs).toEqual([
      {
        kind: "take",
        generationId: hop1.returned.generationId,
        storagePath: take1.storagePath,
      },
    ]);
  });

  it("records a multi-input edit truthfully: the consumed image that was returned resolves to its take while the rest stay studio images", async () => {
    const project = await bridgedProject();
    const hop1 = await returnEditOfBridgedPicture(
      project.id,
      project.origin!.bridgedImageId,
    );
    const plates = await runTurn(
      fixture.studio,
      fixture.decide,
      project.id,
      "two reference plates",
      generateDecision("a reference plate"),
    );
    const combined = await runTurn(
      fixture.studio,
      fixture.decide,
      project.id,
      "combine them",
      editDecision("combine them", [
        plates.imageIds[0]!,
        hop1.producedImageId,
        plates.imageIds[1]!,
      ]),
    );

    const result = await returnStudioImage(fixture.deps, {
      userId: OWNER,
      projectId: project.id,
      imageId: combined.imageIds[0]!,
    });

    expect(result.state).toBe("returned");
    if (result.state !== "returned") return;
    // The one consumed take is the display ancestor, wherever it sits in the
    // turn's input order.
    expect(result.result.ancestorGenerationId).toBe(
      hop1.returned.generationId,
    );

    const session = fixture.sessions.sessions.get(SOURCE.sessionId)!;
    const returned = takesOf(session, SOURCE.promptVersionId).find(
      (take) => take.id === result.result.generationId,
    )!;
    const inputs = returned.sourceInputs as Array<{ kind: string }>;
    // Three consumed inputs plus the returned picture itself; exactly one is
    // a take of this session, and it is the display ancestor.
    expect(inputs).toHaveLength(4);
    expect(inputs.filter((input) => input.kind === "take")).toHaveLength(1);
    expect(inputs.filter((input) => input.kind === "studio-image")).toHaveLength(
      3,
    );
    expect(returned.ancestorGenerationId).toBe(hop1.returned.generationId);
  });

  it("keeps the bridged picture's display-ancestor precedence even when a previously returned image is also consumed", async () => {
    const project = await bridgedProject();
    const hop1 = await returnEditOfBridgedPicture(
      project.id,
      project.origin!.bridgedImageId,
    );
    const { imageIds } = await runTurn(
      fixture.studio,
      fixture.decide,
      project.id,
      "revisit the original",
      editDecision("revisit the original", [
        hop1.producedImageId,
        project.origin!.bridgedImageId,
      ]),
    );

    const result = await returnStudioImage(fixture.deps, {
      userId: OWNER,
      projectId: project.id,
      imageId: imageIds[0]!,
    });

    expect(result.state).toBe("returned");
    if (result.state !== "returned") return;
    // Both consumed images are takes of this session, and both are recorded;
    // the drawn one is the origin's recorded choice, the bridged picture.
    expect(result.result.ancestorGenerationId).toBe(SOURCE.generationId);
    const session = fixture.sessions.sessions.get(SOURCE.sessionId)!;
    const returned = takesOf(session, SOURCE.promptVersionId).find(
      (take) => take.id === result.result.generationId,
    )!;
    const takeInputs = (
      returned.sourceInputs as Array<{ kind: string; generationId?: string }>
    ).filter((input) => input.kind === "take");
    // Recorded in the turn's own input order: the returned image first, the
    // bridged picture second — regardless of which one is drawn.
    expect(takeInputs.map((input) => input.generationId)).toEqual([
      hop1.returned.generationId,
      SOURCE.generationId,
    ]);
  });

  it("still gives an unrelated generation no relationship after other images have been returned to the session", async () => {
    const project = await bridgedProject();
    await returnEditOfBridgedPicture(project.id, project.origin!.bridgedImageId);

    // A from-scratch generate consumes no image at all — a returned take
    // living beside it in the session gives it nothing.
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
    expect(
      (returned.sourceInputs as Array<{ kind: string }>).some(
        (input) => input.kind === "take",
      ),
    ).toBe(false);
  });

  it("records the truthful relationship when returning an edit of a returned image after the destination session was deleted — no stale mapping redirects it", async () => {
    const project = await bridgedProject();
    const hop1 = await returnEditOfBridgedPicture(
      project.id,
      project.origin!.bridgedImageId,
    );

    // The destination dies. Its takes die with it — the relationship lived in
    // the session record, so there is nothing left to redirect a later return.
    fixture.sessions.sessions.delete(SOURCE.sessionId);

    const { imageIds, turnId } = await runTurn(
      fixture.studio,
      fixture.decide,
      project.id,
      "cool it back down",
      editDecision("cool it back down", [hop1.producedImageId]),
    );
    const result = await returnStudioImage(fixture.deps, {
      userId: OWNER,
      projectId: project.id,
      imageId: imageIds[0]!,
      onMissingOriginSession: "new-session",
      confirmedWords: "a warmly lit study",
    });

    expect(result.state).toBe("returned");
    if (result.state !== "returned") return;
    expect(result.result.createdSession).toBe(true);
    expect(result.result.sessionId).not.toBe(SOURCE.sessionId);
    // No ancestor: the consumed image's take went down with the old session.
    expect(result.result.ancestorGenerationId).toBeNull();

    const created = fixture.sessions.sessions.get(result.result.sessionId)!;
    const returned = takesOf(created, result.result.promptVersionId).find(
      (take) => take.id === result.result.generationId,
    )!;
    expect(returned.ancestorGenerationId).toBeNull();
    const inputs = returned.sourceInputs as Array<{
      kind: string;
      storagePath?: string;
    }>;
    expect(
      inputs.some((input) => input.kind === "take"),
    ).toBe(false);
    // The consumed image is still recorded in full — by its durable studio
    // path — as an ordinary studio image.
    const sourceTurn = await fixture.studio.getTurn(OWNER, project.id, turnId);
    expect(inputs).toContainEqual({
      kind: "studio-image",
      storagePath: sourceTurn.sourceImages?.[0]?.storagePath,
    });
  });

  it("repairs an interrupted mapping write on replay: the resumed attach lands the same take with its recorded relationship", async () => {
    const project = await bridgedProject();
    const hop1 = await returnEditOfBridgedPicture(
      project.id,
      project.origin!.bridgedImageId,
    );
    const { imageIds } = await runTurn(
      fixture.studio,
      fixture.decide,
      project.id,
      "cool it back down",
      editDecision("cool it back down", [hop1.producedImageId]),
    );

    // Interrupt the mapping write: the admission's session append — the write
    // that carries the source inputs and display ancestor — fails once. The
    // media is durable, the receipt records the take as un-attached.
    const realMutate =
      fixture.sessions.mutate.getMockImplementation() ??
      ((): never => {
        throw new Error("mutate double has no implementation");
      });
    let mutateCalls = 0;
    fixture.sessions.mutate.mockImplementation(
      async (...args: Parameters<typeof realMutate>) => {
        mutateCalls += 1;
        if (mutateCalls === 1) throw new Error("session store write failed");
        return realMutate(...args);
      },
    );

    const interrupted = await returnStudioImage(fixture.deps, {
      userId: OWNER,
      projectId: project.id,
      imageId: imageIds[0]!,
    });
    expect(interrupted.state).toBe("returned");
    if (interrupted.state !== "returned") return;
    const sessionAfterInterrupt = fixture.sessions.sessions.get(
      SOURCE.sessionId,
    )!;
    expect(
      takesOf(sessionAfterInterrupt, SOURCE.promptVersionId).find(
        (take) => take.id === interrupted.result.generationId,
      ),
    ).toBeUndefined();

    // The replay repairs it: the receipt resumes the SAME take and re-attaches
    // the persisted record — the relationship rides the record, so the edge
    // arrives with it, and nothing is re-stored or minted twice.
    fixture.sessions.mutate.mockImplementation(realMutate);
    const repaired = await returnStudioImage(fixture.deps, {
      userId: OWNER,
      projectId: project.id,
      imageId: imageIds[0]!,
    });

    expect(repaired.state).toBe("returned");
    if (repaired.state !== "returned") return;
    expect(repaired.result.generationId).toBe(
      interrupted.result.generationId,
    );

    const session = fixture.sessions.sessions.get(SOURCE.sessionId)!;
    const takes = takesOf(session, SOURCE.promptVersionId);
    const repairedTake = takes.filter(
      (take) => take.id === repaired.result.generationId,
    );
    expect(repairedTake).toHaveLength(1);
    expect(repairedTake[0]!.ancestorGenerationId).toBe(
      hop1.returned.generationId,
    );
    expect(
      (
        repairedTake[0]!.sourceInputs as Array<{
          kind: string;
          generationId?: string;
        }>
      ).some(
        (input) =>
          input.kind === "take" &&
          input.generationId === hop1.returned.generationId,
      ),
    ).toBe(true);
    // The chain, whole: exactly two returned takes beyond the bridged
    // original, each the ancestor of the next.
    expect(
      takes.filter((take) => take.origin === "studio"),
    ).toHaveLength(2);
  });
});

/**
 * The discovery half of the attachment boundary (ADR-0022 decision 6, issue
 * #135): the recovery read reports a return's unresolved attachment from its
 * #128 receipt — and reports NOTHING when the receipt is absent, attached
 * (the session is now the source of truth), or does not validate. Strictly a
 * read: no claim is taken and no resume is triggered by discovery.
 */
describe("readUnresolvedReturnAttachment (issue #135)", () => {
  const KEY_INPUT = {
    userId: OWNER,
    projectId: "project-1",
    imageId: "img-1",
  };

  function idempotencyWith(
    snapshot: { statusCode: number; body: Record<string, unknown> } | null,
  ): AdmissionIdempotencyPort {
    return {
      claimRequest: async () => {
        throw new Error("discovery must never claim");
      },
      markCompleted: async () => {},
      markFailed: async () => {},
      getResponseSnapshot: async ({ userId, route, key }) => {
        expect(route).toBe("picture-admission");
        expect(userId).toBe(KEY_INPUT.userId);
        expect(key).toBe(`studio-return:${KEY_INPUT.projectId}:${KEY_INPUT.imageId}`);
        return snapshot;
      },
    };
  }

  function receiptBody(attachmentState: "failed" | "pending" | "attached") {
    return {
      generationId: "take-1",
      sessionId: "session-1",
      promptVersionId: "v1",
      origin: "studio",
      imageUrl: "https://storage.example.com/take-1",
      assetId: "asset-1",
      storagePath: "users/user-1/previews/images/take-1.png",
      record: { id: "take-1", mediaType: "image", origin: "studio" },
      attachment: {
        state: attachmentState,
        generationId: "take-1",
        sessionId: "session-1",
        promptVersionId: "v1",
        ...(attachmentState === "failed"
          ? { reason: "session write failed" }
          : {}),
        record: { id: "take-1", mediaType: "image", origin: "studio" },
      },
    };
  }

  it("reports the failed attachment a retry is owed", async () => {
    const attachment = await readUnresolvedReturnAttachment(
      idempotencyWith({ statusCode: 201, body: receiptBody("failed") }),
      KEY_INPUT,
    );
    expect(attachment).toMatchObject({
      state: "failed",
      generationId: "take-1",
      sessionId: "session-1",
      promptVersionId: "v1",
    });
  });

  it("reports a pending receipt too — the return is still owed", async () => {
    const attachment = await readUnresolvedReturnAttachment(
      idempotencyWith({ statusCode: 201, body: receiptBody("pending") }),
      KEY_INPUT,
    );
    expect(attachment?.state).toBe("pending");
  });

  it("reports nothing when the receipt says attached", async () => {
    const attachment = await readUnresolvedReturnAttachment(
      idempotencyWith({ statusCode: 201, body: receiptBody("attached") }),
      KEY_INPUT,
    );
    expect(attachment).toBeNull();
  });

  it("reports nothing when there is no receipt at all", async () => {
    const attachment = await readUnresolvedReturnAttachment(
      idempotencyWith(null),
      KEY_INPUT,
    );
    expect(attachment).toBeNull();
  });

  it("reports nothing when the receipt's attachment does not validate", async () => {
    const body = receiptBody("failed") as Record<string, unknown>;
    body.attachment = { state: "bananas" };
    const attachment = await readUnresolvedReturnAttachment(
      idempotencyWith({ statusCode: 201, body }),
      KEY_INPUT,
    );
    expect(attachment).toBeNull();
  });

  it("reports nothing when the port has no snapshot read", async () => {
    const attachment = await readUnresolvedReturnAttachment(
      {
        claimRequest: async () => {
          throw new Error("never");
        },
        markCompleted: async () => {},
        markFailed: async () => {},
      },
      KEY_INPUT,
    );
    expect(attachment).toBeNull();
  });
});
