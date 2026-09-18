import { describe, it, expect, vi, beforeEach } from "vitest";
import { StudioService, studioTurnIdForSubmission } from "../StudioService";
import { StudioModelRegistry } from "../StudioModelRegistry";
import { StudioCapExceededError } from "../storage/FirestoreStudioProjectStore";
import type { StudioProjectStore } from "../storage/StudioProjectStore";
import type { StudioImageRunner } from "../providers/types";
import type { StudioTurnContext } from "../StudioPolicyEngine";
import type {
  StudioDecision,
  StudioProjectRecord,
  StudioTurnRecord,
} from "../types";

/**
 * Issue #115 — a turn submission carries a stable identity, and requests that
 * carry the same identity converge on one turn.
 *
 * Before this, the turn runner received a message and project context but no
 * submission identity: a lost response, the auth transport re-sending a POST
 * after sign-in, or a reload each produced a second paid LLM decision and a
 * second turn. The only guard was an in-memory in-flight flag per mount, which
 * a second tab or a transport-level retry sails straight past.
 *
 * Invariants proved here, one per acceptance criterion:
 *  1. A duplicate submission (same identity) returns the existing turn and runs
 *     NO second decision and NO second reservation.
 *  2. Two submissions with the same words but different identities are two
 *     turns — identity is per-submission, never per-text.
 *  3. The turn is decided against the selection captured at submit time, never
 *     a later change made in another tab.
 *  4. A message and a pin change within one project resolve in a defined order:
 *     the turn resolves against the pin its own submission captured; a pin
 *     change governs the NEXT submission, not the one already in flight.
 */

/** In-memory store honoring the reservation contract; injected structurally. */
class FakeStore implements StudioProjectStore {
  projects = new Map<string, StudioProjectRecord>();
  turns = new Map<string, StudioTurnRecord>();
  reserved = new Map<string, number>();
  reserveCalls = 0;

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

  async listTurns(projectId: string): Promise<StudioTurnRecord[]> {
    return [...this.turns.values()]
      .filter((turn) => turn.projectId === projectId)
      .sort((a, b) => a.createdAtMs - b.createdAtMs);
  }

  async reserveTurn(params: {
    turn: StudioTurnRecord;
    day: string;
    capCents: number;
  }): Promise<void> {
    this.reserveCalls += 1;
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

  async refundCents(userId: string, day: string, cents: number): Promise<void> {
    const key = `${userId}_${day}`;
    this.reserved.set(key, Math.max(0, (this.reserved.get(key) ?? 0) - cents));
  }

  async getReservedCents(userId: string, day: string): Promise<number> {
    return this.reserved.get(`${userId}_${day}`) ?? 0;
  }

  async finalizeTurn(
    _projectId: string,
    turnId: string,
    patch: Partial<StudioTurnRecord>,
  ): Promise<void> {
    const current = this.turns.get(turnId);
    if (current) this.turns.set(turnId, { ...current, ...patch });
  }

  async saveTurn(turn: StudioTurnRecord): Promise<void> {
    // Conversational turns bypass the reservation entirely (no reserveCalls).
    this.turns.set(turn.id, { ...turn });
  }

  async deleteProject(projectId: string): Promise<void> {
    this.projects.delete(projectId);
    for (const [id, turn] of this.turns) {
      if (turn.projectId === projectId) this.turns.delete(id);
    }
  }
}

function m1StyleGenerate(message: string): StudioDecision {
  return {
    action: "generate",
    basePrompt: message,
    variants: [
      message,
      `${message} — alternative`,
      `${message} — minimal`,
      `${message} — bold`,
    ],
    capability: "design",
    suggestions: ["Refine the mark", "Darker palette", "Make it flat"],
    title: message.slice(0, 60),
  };
}

const DAY = "2026-07-24";
const DAY_MS = new Date(`${DAY}T12:00:00Z`).getTime();

function makeService(overrides?: {
  decide?: (context: StudioTurnContext) => Promise<StudioDecision>;
}) {
  const store = new FakeStore();
  const registry = new StudioModelRegistry();
  let idCounter = 0;

  const runner = {
    run: vi.fn().mockResolvedValue({
      imageUrl: "https://replicate.delivery/out.webp",
      durationMs: 1,
    }),
  } as unknown as StudioImageRunner;

  const storage = {
    saveFromUrl: vi.fn().mockResolvedValue({
      storagePath: "users/user-1/previews/images/x.webp",
    }),
    getViewUrl: vi.fn().mockImplementation((_userId: string, path: string) =>
      Promise.resolve({
        viewUrl: `https://signed.example.com/${path}`,
        expiresAt: "2026-07-25T00:00:00Z",
        storagePath: path,
      }),
    ),
  };

  const decideTurn = vi
    .fn<(context: StudioTurnContext) => Promise<StudioDecision>>()
    .mockImplementation(
      overrides?.decide ??
        (async (context) => m1StyleGenerate(context.userMessage)),
    );

  const service = new StudioService({
    store,
    registry,
    runner,
    storage,
    policy: { decideTurn },
    dailyCapCents: 500,
    now: () => new Date(DAY_MS),
    idFactory: () => `id-${++idCounter}`,
  });

  return { service, store, runner, decideTurn };
}

describe("StudioService — submission identity (#115)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("derives the same turn id for the same (project, submission)", () => {
    const a = studioTurnIdForSubmission("p1", "sub-1");
    expect(a).toBe(studioTurnIdForSubmission("p1", "sub-1"));
    // But not across projects, nor across submissions.
    expect(a).not.toBe(studioTurnIdForSubmission("p2", "sub-1"));
    expect(a).not.toBe(studioTurnIdForSubmission("p1", "sub-2"));
  });

  it("a duplicate submission returns the existing turn — no second decision, no second reservation", async () => {
    const { service, store, decideTurn } = makeService();
    const project = await service.createProject("user-1");

    const first = await service.runTurn(
      "user-1",
      project.id,
      "a logo",
      undefined,
      undefined,
      { submissionId: "sub-1" },
    );
    await first.completion;

    const reservedAfterFirst = await store.getReservedCents("user-1", DAY);
    expect(decideTurn).toHaveBeenCalledTimes(1);
    expect(store.reserveCalls).toBe(1);
    expect(reservedAfterFirst).toBe(16); // recraft-v4.1 (4¢) × 4

    // The auth transport re-sends the SAME body after a 401 sign-in.
    const retry = await service.runTurn(
      "user-1",
      project.id,
      "a logo",
      undefined,
      undefined,
      { submissionId: "sub-1" },
    );
    await retry.completion;

    expect(retry.turnId).toBe(first.turnId);
    expect(retry.decision).toEqual(first.decision);
    // The negative path: neither the paid decision nor the reservation ran
    // again, and no second turn exists.
    expect(decideTurn).toHaveBeenCalledTimes(1);
    expect(store.reserveCalls).toBe(1);
    expect(await store.getReservedCents("user-1", DAY)).toBe(
      reservedAfterFirst,
    );
    expect(
      await service.listTurnsWithFreshUrls("user-1", project.id),
    ).toHaveLength(1);
  });

  it("a duplicate conversational submission returns the existing turn too", async () => {
    const clarify: StudioDecision = {
      action: "clarify",
      questions: [{ text: "What is it for?", quickPicks: ["A", "B"] }],
    };
    const { service, decideTurn } = makeService({
      decide: async () => clarify,
    });
    const project = await service.createProject("user-1");

    const first = await service.runTurn(
      "user-1",
      project.id,
      "make a logo",
      undefined,
      undefined,
      { submissionId: "sub-clarify" },
    );
    const retry = await service.runTurn(
      "user-1",
      project.id,
      "make a logo",
      undefined,
      undefined,
      { submissionId: "sub-clarify" },
    );

    expect(retry.turnId).toBe(first.turnId);
    expect(decideTurn).toHaveBeenCalledTimes(1);
    expect(
      await service.listTurnsWithFreshUrls("user-1", project.id),
    ).toHaveLength(1);
  });

  it("two submissions with the same words but different identities create two turns", async () => {
    const { service, decideTurn } = makeService();
    const project = await service.createProject("user-1");

    const a = await service.runTurn(
      "user-1",
      project.id,
      "a logo",
      undefined,
      undefined,
      { submissionId: "sub-a" },
    );
    await a.completion;
    const b = await service.runTurn(
      "user-1",
      project.id,
      "a logo",
      undefined,
      undefined,
      { submissionId: "sub-b" },
    );
    await b.completion;

    expect(a.turnId).not.toBe(b.turnId);
    expect(decideTurn).toHaveBeenCalledTimes(2);
    expect(
      await service.listTurnsWithFreshUrls("user-1", project.id),
    ).toHaveLength(2);
  });

  it("decides against the selection captured at submit time, not a later change in another tab", async () => {
    // The policy echoes whatever selection it is handed into an edit that
    // sources it — so the resulting turn's edit target IS what the submission
    // decided to edit.
    const { service, store, decideTurn } = makeService({
      decide: async (context) => ({
        action: "edit",
        instruction: "sharpen it",
        sourceImageIds: context.selectedImageId
          ? [context.selectedImageId]
          : [],
        suggestions: ["s1", "s2", "s3"],
      }),
    });
    const project = await service.createProject("user-1");
    await store.updateProject(project.id, {
      attachments: [
        {
          id: "att-a",
          storagePath: "users/user-1/previews/images/a.png",
          filename: "a.png",
          createdAtMs: 1,
        },
        {
          id: "att-b",
          storagePath: "users/user-1/previews/images/b.png",
          filename: "b.png",
          createdAtMs: 2,
        },
      ],
      // Another tab has since moved the persisted selection to B.
      selectedImageId: "att-b",
    });

    // The submission captured A at submit time.
    const result = await service.runTurn(
      "user-1",
      project.id,
      "edit this",
      undefined,
      undefined,
      { submissionId: "sub-1", selectedImageId: "att-a" },
    );
    await result.completion;

    // The policy saw the captured selection (A), never the project's now-current B.
    expect(decideTurn.mock.calls[0]?.[0]?.selectedImageId).toBe("att-a");
    // And the turn edited A — what the submission decided to edit.
    const turn = await service.getTurn("user-1", project.id, result.turnId);
    expect(turn.decision.action).toBe("edit");
    if (turn.decision.action === "edit") {
      expect(turn.decision.sourceImageIds).toEqual(["att-a"]);
    }
    expect(turn.sourceImages?.map((image) => image.id)).toEqual(["att-a"]);
  });

  it("an explicitly captured 'no selection' overrides a persisted selection", async () => {
    const { service, store, decideTurn } = makeService();
    const project = await service.createProject("user-1");
    await store.updateProject(project.id, {
      attachments: [
        {
          id: "att-b",
          storagePath: "users/user-1/previews/images/b.png",
          filename: "b.png",
          createdAtMs: 2,
        },
      ],
      selectedImageId: "att-b",
    });

    await service.runTurn(
      "user-1",
      project.id,
      "a logo",
      undefined,
      undefined,
      { submissionId: "sub-1", selectedImageId: null },
    );

    // null is an explicit "none" captured at submit time — it wins over the
    // project's persisted att-b (a field that is merely absent would fall back).
    expect(decideTurn.mock.calls[0]?.[0]?.selectedImageId).toBeNull();
  });

  it("resolves against the pin its own submission captured; a pin change governs only the next", async () => {
    const { service, store, decideTurn } = makeService();
    const project = await service.createProject("user-1");
    // The project pins Pro right now.
    await store.updateProject(project.id, { pinnedModel: "recraft-v4.1-pro" });

    // Submission A captured Auto (null) before another tab switched the pin.
    const a = await service.runTurn(
      "user-1",
      project.id,
      "a logo",
      undefined,
      undefined,
      { submissionId: "sub-a", pinnedModel: null },
    );
    await a.completion;
    const turnA = await service.getTurn("user-1", project.id, a.turnId);
    // A resolved against its own captured pin (Auto → cheapest), not Pro.
    expect(turnA.resolvedModel).toBe("recraft-v4.1");
    expect(decideTurn.mock.calls.at(-1)?.[0]?.pinnedModel).toBeNull();

    // The project's persisted pin is untouched by the turn and governs the NEXT
    // submission — the one that captures it (Pro).
    const b = await service.runTurn(
      "user-1",
      project.id,
      "another logo",
      undefined,
      undefined,
      { submissionId: "sub-b", pinnedModel: "recraft-v4.1-pro" },
    );
    await b.completion;
    const turnB = await service.getTurn("user-1", project.id, b.turnId);
    expect(turnB.resolvedModel).toBe("recraft-v4.1-pro");
  });

  it("without a submission each request is its own turn (the pre-#115 fallback)", async () => {
    const { service, decideTurn } = makeService();
    const project = await service.createProject("user-1");

    const a = await service.runTurn("user-1", project.id, "a logo");
    await a.completion;
    const b = await service.runTurn("user-1", project.id, "a logo");
    await b.completion;

    expect(a.turnId).not.toBe(b.turnId);
    expect(decideTurn).toHaveBeenCalledTimes(2);
  });
});
