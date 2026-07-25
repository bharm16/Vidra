import { describe, it, expect, vi, beforeEach } from "vitest";
import { StudioService, StudioNotFoundError } from "../StudioService";
import { StudioModelRegistry } from "../StudioModelRegistry";
import {
  StudioCapExceededError,
  type FirestoreStudioProjectStore,
} from "../storage/FirestoreStudioProjectStore";
import type { ReplicateStudioImageRunner } from "../providers/ReplicateStudioImageRunner";
import type { StudioTurnContext } from "../StudioPolicyEngine";
import type {
  StudioDecision,
  StudioProjectRecord,
  StudioTurnRecord,
} from "../types";

/**
 * Hand-rolled in-memory store honoring the reservation contract (cap check
 * before write, per-user-per-day counters). Injected structurally — the
 * service never knows it isn't Firestore.
 */
class FakeStore {
  projects = new Map<string, StudioProjectRecord>();
  turns = new Map<string, StudioTurnRecord>();
  reserved = new Map<string, number>();
  refunds: Array<{ userId: string; day: string; cents: number }> = [];

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

  async getTurn(
    _projectId: string,
    turnId: string,
  ): Promise<StudioTurnRecord | null> {
    return this.turns.get(turnId) ?? null;
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
    this.refunds.push({ userId, day, cents });
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
    this.turns.set(turn.id, { ...turn });
  }
}

/**
 * Default fake policy: the M1-era generate shape, so cost/settlement tests
 * exercise the execution path with a stable decision. Tests inject their
 * own decisions to drive the conversational branches.
 */
function m1StyleGenerate(message: string): StudioDecision {
  return {
    action: "generate",
    basePrompt: message,
    variants: [
      message,
      `${message} — alternative interpretation`,
      `${message} — minimal composition`,
      `${message} — bold composition`,
    ],
    capability: "design",
    suggestions: ["Refine the mark", "Try a darker palette", "Make it flat"],
    title: message.slice(0, 60),
  };
}

const DAY_MS = new Date("2026-07-24T12:00:00Z").getTime();

function makeService(overrides?: {
  runner?: Partial<ReplicateStudioImageRunner>;
  capCents?: number;
  decide?: (context: StudioTurnContext) => Promise<StudioDecision>;
}) {
  const store = new FakeStore();
  const registry = new StudioModelRegistry();
  let idCounter = 0;

  const runner = {
    isAvailable: () => true,
    run: vi.fn().mockResolvedValue({
      imageUrl: "https://replicate.delivery/out.webp",
      durationMs: 1000,
    }),
    ...overrides?.runner,
  } as unknown as ReplicateStudioImageRunner;

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
    store: store as unknown as FirestoreStudioProjectStore,
    registry,
    runner,
    storage,
    policy: { decideTurn },
    dailyCapCents: overrides?.capCents ?? 500,
    now: () => new Date(DAY_MS),
    idFactory: () => `id-${++idCounter}`,
  });

  return { service, store, runner, storage, decideTurn };
}

describe("StudioService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("projects", () => {
    it("creates and fetches a project for its owner", async () => {
      const { service } = makeService();
      const project = await service.createProject("user-1");
      expect(project.title).toBe("Untitled");

      const fetched = await service.getProject("user-1", project.id);
      expect(fetched.id).toBe(project.id);
    });

    it("hides another user's project as not-found", async () => {
      const { service } = makeService();
      const project = await service.createProject("user-1");

      await expect(
        service.getProject("user-2", project.id),
      ).rejects.toBeInstanceOf(StudioNotFoundError);
    });
  });

  describe("runTurn — reservation before fan-out", () => {
    it("reserves 4 × the resolved model's cost before any image call", async () => {
      const { service, store } = makeService();
      const project = await service.createProject("user-1");

      const result = await service.runTurn(
        "user-1",
        project.id,
        "a logo for Vidra",
      );

      // recraft-v4.1 (cheapest design-capable) at 4¢ × 4 calls.
      expect(await store.getReservedCents("user-1", "2026-07-24")).toBe(16);
      expect(result.decision.action).toBe("generate");
      await result.completion;
    });

    it("rejects the turn when the cap would be exceeded and never calls the runner", async () => {
      const { service, runner } = makeService({ capCents: 15 });
      const project = await service.createProject("user-1");

      await expect(
        service.runTurn("user-1", project.id, "a logo"),
      ).rejects.toBeInstanceOf(StudioCapExceededError);
      expect(runner.run).not.toHaveBeenCalled();
    });

    it("rejects empty messages with a 400", async () => {
      const { service } = makeService();
      const project = await service.createProject("user-1");

      await expect(
        service.runTurn("user-1", project.id, "   "),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe("runTurn — model resolution", () => {
    it("uses the pinned model when it resolves", async () => {
      const { service, store } = makeService();
      const project = await service.createProject("user-1");
      await store.updateProject(project.id, {
        pinnedModel: "recraft-v4.1-pro",
      });

      const result = await service.runTurn("user-1", project.id, "a logo");
      await result.completion;

      const turn = await service.getTurn("user-1", project.id, result.turnId);
      expect(turn.resolvedModel).toBe("recraft-v4.1-pro");
      // Pro tier reserves 25¢ × 4.
      expect(turn.reservedCents).toBe(100);
    });

    it("reverts a stale pin to Auto (cheapest capable)", async () => {
      const { service, store } = makeService();
      const project = await service.createProject("user-1");
      await store.updateProject(project.id, {
        pinnedModel: "recraft-v3" as never,
      });

      const result = await service.runTurn("user-1", project.id, "a logo");
      await result.completion;

      const turn = await service.getTurn("user-1", project.id, result.turnId);
      expect(turn.resolvedModel).toBe("recraft-v4.1");
    });
  });

  describe("runTurn — settlement", () => {
    it("completes a fully successful batch and stores 4 images", async () => {
      const { service, storage } = makeService();
      const project = await service.createProject("user-1");

      const result = await service.runTurn("user-1", project.id, "a logo");
      await result.completion;

      const turn = await service.getTurn("user-1", project.id, result.turnId);
      expect(turn.status).toBe("complete");
      expect(turn.calls.every((c) => c.status === "succeeded")).toBe(true);
      expect(turn.refundedCents).toBe(0);
      expect(storage.saveFromUrl).toHaveBeenCalledTimes(4);
      // Each stored image keeps the exact prompt that produced it.
      expect(turn.calls[1]?.image?.sourcePrompt).toContain(
        "alternative interpretation",
      );
    });

    it("marks a 3-of-4 batch partial and refunds exactly the failed call", async () => {
      const run = vi
        .fn()
        .mockResolvedValueOnce({
          imageUrl: "https://r.dev/1.webp",
          durationMs: 1,
        })
        .mockRejectedValueOnce(
          Object.assign(new Error("timed out"), { statusCode: 500 }),
        )
        .mockResolvedValueOnce({
          imageUrl: "https://r.dev/3.webp",
          durationMs: 1,
        })
        .mockResolvedValueOnce({
          imageUrl: "https://r.dev/4.webp",
          durationMs: 1,
        });
      const { service, store } = makeService({ runner: { run } as never });
      const project = await service.createProject("user-1");

      const result = await service.runTurn("user-1", project.id, "a logo");
      await result.completion;

      const turn = await service.getTurn("user-1", project.id, result.turnId);
      expect(turn.status).toBe("partial");
      expect(turn.calls[1]?.status).toBe("failed");
      expect(turn.calls[1]?.error).toContain("timed out");
      expect(turn.refundedCents).toBe(4);
      // Refund landed back on the day's counter: 16 reserved − 4 refunded.
      expect(await store.getReservedCents("user-1", "2026-07-24")).toBe(12);
    });

    it("marks an all-failed batch failed and refunds everything", async () => {
      const run = vi.fn().mockRejectedValue(new Error("Insufficient credit"));
      const { service, store } = makeService({ runner: { run } as never });
      const project = await service.createProject("user-1");

      const result = await service.runTurn("user-1", project.id, "a logo");
      await result.completion;

      const turn = await service.getTurn("user-1", project.id, result.turnId);
      expect(turn.status).toBe("failed");
      expect(turn.refundedCents).toBe(16);
      expect(await store.getReservedCents("user-1", "2026-07-24")).toBe(0);
    });

    it("decorates polled turns with fresh signed view URLs", async () => {
      const { service } = makeService();
      const project = await service.createProject("user-1");
      const result = await service.runTurn("user-1", project.id, "a logo");
      await result.completion;

      const view = await service.getTurnWithFreshUrls(
        "user-1",
        project.id,
        result.turnId,
      );
      expect(view.calls[0]?.image?.viewUrl).toContain(
        "https://signed.example.com/",
      );
    });

    it("titles an Untitled project from the first generation", async () => {
      const { service } = makeService();
      const project = await service.createProject("user-1");

      const result = await service.runTurn(
        "user-1",
        project.id,
        "a logo for Vidra, a video generation platform",
      );
      await result.completion;

      const fetched = await service.getProject("user-1", project.id);
      expect(fetched.title).toBe(
        "a logo for Vidra, a video generation platform",
      );
    });
  });

  describe("runTurn — conversational decisions (M3)", () => {
    const clarify: StudioDecision = {
      action: "clarify",
      questions: [
        {
          text: "What is the logo for?",
          quickPicks: ["A coffee brand", "A tech startup", "A band"],
        },
      ],
    };

    it("persists a clarify turn as terminal with zero cost and no image calls", async () => {
      const { service, store, runner } = makeService({
        decide: async () => clarify,
      });
      const project = await service.createProject("user-1");

      const result = await service.runTurn("user-1", project.id, "make a logo");
      await result.completion;

      expect(result.decision.action).toBe("clarify");
      const turn = await service.getTurn("user-1", project.id, result.turnId);
      expect(turn.status).toBe("complete");
      expect(turn.calls).toEqual([]);
      expect(turn.reservedCents).toBe(0);
      expect(turn.resolvedModel).toBeUndefined();
      expect(runner.run).not.toHaveBeenCalled();
      expect(await store.getReservedCents("user-1", "2026-07-24")).toBe(0);
    });

    it("lets an over-cap user keep conversing (cap only gates image spend)", async () => {
      const { service } = makeService({
        capCents: 0,
        decide: async () => clarify,
      });
      const project = await service.createProject("user-1");

      const result = await service.runTurn("user-1", project.id, "make a logo");
      expect(result.decision.action).toBe("clarify");
    });

    it("bumps the project's updatedAtMs so the list reorders", async () => {
      const { service, store } = makeService({ decide: async () => clarify });
      const project = await service.createProject("user-1");
      await store.updateProject(project.id, { updatedAtMs: 1 });

      await service.runTurn("user-1", project.id, "make a logo");

      const fetched = await service.getProject("user-1", project.id);
      expect(fetched.updatedAtMs).toBe(DAY_MS);
    });
  });

  describe("runTurn — policy context threading (M3)", () => {
    it("hands the policy the history, image ids, pin state, and allowed actions", async () => {
      const { service, store, decideTurn } = makeService();
      const project = await service.createProject("user-1");
      await store.updateProject(project.id, {
        pinnedModel: "recraft-v4.1-pro",
      });

      const first = await service.runTurn("user-1", project.id, "a fox logo");
      await first.completion;
      await service.runTurn("user-1", project.id, "make it more playful");

      const context = decideTurn.mock.calls[1]?.[0];
      expect(context?.history).toHaveLength(1);
      expect(context?.history[0]?.userMessage).toBe("a fox logo");
      // All 4 first-turn images are referenceable by the LLM.
      expect(context?.projectImageIds.size).toBe(4);
      expect(context?.pinnedModel?.slug).toBe("recraft-v4.1-pro");
      expect(context?.selectedImageId).toBeNull();
      expect(context?.allowedActions).toEqual([
        "clarify",
        "generate",
        "diagnose",
        "negotiate",
      ]);
    });

    it("passes a null pin (Auto) when the stored pin no longer resolves", async () => {
      const { service, store, decideTurn } = makeService();
      const project = await service.createProject("user-1");
      await store.updateProject(project.id, {
        pinnedModel: "recraft-v3" as never,
      });

      await service.runTurn("user-1", project.id, "a logo");

      expect(decideTurn.mock.calls[0]?.[0]?.pinnedModel).toBeNull();
    });
  });
});
