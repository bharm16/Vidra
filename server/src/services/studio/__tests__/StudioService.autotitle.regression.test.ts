import { describe, it, expect, vi } from "vitest";
import { StudioService } from "../StudioService";
import { StudioModelRegistry } from "../StudioModelRegistry";
import type { FirestoreStudioProjectStore } from "../storage/FirestoreStudioProjectStore";
import type { StudioDecision, StudioTurnRecord } from "../types";

/**
 * Regression (found live 2026-07-24, M3 verification): the LLM omitted the
 * optional `title` on a generate and the project stayed "Untitled" forever
 * — behavior 8 (auto-title from the first request) held at M1/M2 because
 * the hardcoded policy always set one.
 *
 * Invariant: for any project still titled "Untitled", a completed
 * generation turn leaves it with a real title, whether or not the LLM
 * provided one.
 */

function makeGenerate(withTitle: boolean): StudioDecision {
  return {
    action: "generate",
    basePrompt:
      "A minimal geometric fox logo for a coffee brand called Ember & Oak, flat vector style",
    variants: ["v1", "v2", "v3", "v4"],
    capability: "design",
    suggestions: ["s1", "s2", "s3"],
    ...(withTitle ? { title: "Ember & Oak Fox Logo" } : {}),
  };
}

function makeService(decision: StudioDecision) {
  const projects = new Map<string, Record<string, unknown>>();
  const turns = new Map<string, StudioTurnRecord>();
  projects.set("p1", {
    id: "p1",
    userId: "u1",
    title: "Untitled",
    createdAtMs: 1,
    updatedAtMs: 1,
  });

  const store = {
    getProject: async (id: string) => projects.get(id) ?? null,
    updateProject: async (id: string, patch: Record<string, unknown>) => {
      const current = projects.get(id);
      if (current) projects.set(id, { ...current, ...patch });
    },
    listTurns: async () => [...turns.values()],
    getTurn: async (_p: string, id: string) => turns.get(id) ?? null,
    reserveTurn: async (params: { turn: StudioTurnRecord }) => {
      turns.set(params.turn.id, { ...params.turn });
    },
    refundCents: async () => {},
    finalizeTurn: async (
      _p: string,
      id: string,
      patch: Partial<StudioTurnRecord>,
    ) => {
      const current = turns.get(id);
      if (current) turns.set(id, { ...current, ...patch });
    },
    saveTurn: async (turn: StudioTurnRecord) => {
      turns.set(turn.id, { ...turn });
    },
  };

  let idCounter = 0;
  const service = new StudioService({
    store: store as unknown as FirestoreStudioProjectStore,
    registry: new StudioModelRegistry(),
    runner: {
      run: vi.fn().mockResolvedValue({
        imageUrl: "https://replicate.delivery/out.webp",
        durationMs: 1,
      }),
    },
    storage: {
      saveFromUrl: vi
        .fn()
        .mockResolvedValue({ storagePath: "users/u1/x.webp" }),
      getViewUrl: vi.fn().mockResolvedValue({
        viewUrl: "https://signed.example.com/x",
        expiresAt: "2026-07-25T00:00:00Z",
        storagePath: "users/u1/x.webp",
      }),
    },
    policy: { decideTurn: vi.fn().mockResolvedValue(decision) },
    dailyCapCents: 500,
    now: () => new Date("2026-07-24T12:00:00Z"),
    idFactory: () => `id-${++idCounter}`,
  });

  return { service, projects };
}

describe("regression: an Untitled project is always titled by a completed generation", () => {
  it("uses the LLM's title when it provides one", async () => {
    const { service, projects } = makeService(makeGenerate(true));

    const result = await service.runTurn("u1", "p1", "a fox logo");
    await result.completion;

    expect(projects.get("p1")?.title).toBe("Ember & Oak Fox Logo");
  });

  it("falls back to a basePrompt-derived title when the LLM omits it", async () => {
    const { service, projects } = makeService(makeGenerate(false));

    const result = await service.runTurn("u1", "p1", "a fox logo");
    await result.completion;

    const title = projects.get("p1")?.title as string;
    expect(title).not.toBe("Untitled");
    expect(title.length).toBeGreaterThan(0);
    expect(title.length).toBeLessThanOrEqual(60);
  });
});
