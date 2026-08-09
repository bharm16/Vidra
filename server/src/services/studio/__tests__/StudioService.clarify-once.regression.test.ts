import { describe, it, expect, vi } from "vitest";
import { StudioService } from "../StudioService";
import { StudioModelRegistry } from "../StudioModelRegistry";
import { StudioPolicyEngine } from "../StudioPolicyEngine";
import type { FirestoreStudioProjectStore } from "../storage/FirestoreStudioProjectStore";
import type { StudioDecision, StudioTurnRecord } from "../types";
import type { ResolvedExecution } from "@services/ai-model/types";

/** Routing answer for the port stub; Studio does not vary provider by test. */
const STUB_EXECUTION: ResolvedExecution = {
  client: "openai",
  provider: "openai",
  model: "stub-model",
  viaFallback: false,
};

/**
 * Regression (found live 2026-07-24, M3 verification): answering a clarify
 * card produced a SECOND clarify card. Behavior 1 (plan: "Product
 * behavior"): clarifying questions may precede the first generation only —
 * follow-up messages never re-trigger them.
 *
 * Invariant: for any project whose history is non-empty, runTurn never
 * persists a clarify decision — even when the conversation LLM proposes
 * one. Enforcement is structural (allowedActions excludes "clarify" after
 * the first turn), so this must hold through the REAL policy engine with
 * only the LLM mocked.
 */

const CLARIFY_JSON = JSON.stringify({
  action: "clarify",
  questions: [
    {
      text: "What type of subject should the logo represent?",
      quickPicks: ["Animal", "Abstract", "Text-based"],
    },
  ],
} satisfies StudioDecision);

const GENERATE_JSON = JSON.stringify({
  action: "generate",
  basePrompt: "Icon-based logo, modern, geometric",
  variants: ["v1", "v2", "v3", "v4"],
  capability: "design",
  suggestions: ["s1", "s2", "s3"],
} satisfies StudioDecision);

class FakeStore {
  turns = new Map<string, StudioTurnRecord>();
  projects = new Map<string, Record<string, unknown>>();

  async getProject(projectId: string) {
    return this.projects.get(projectId) ?? null;
  }

  async updateProject(
    projectId: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const current = this.projects.get(projectId);
    if (current) this.projects.set(projectId, { ...current, ...patch });
  }

  async listTurns(projectId: string): Promise<StudioTurnRecord[]> {
    return [...this.turns.values()]
      .filter((turn) => turn.projectId === projectId)
      .sort((a, b) => a.createdAtMs - b.createdAtMs);
  }

  async getTurn(_projectId: string, turnId: string) {
    return this.turns.get(turnId) ?? null;
  }

  async reserveTurn(params: { turn: StudioTurnRecord }): Promise<void> {
    this.turns.set(params.turn.id, { ...params.turn });
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

  async saveTurn(turn: StudioTurnRecord): Promise<void> {
    this.turns.set(turn.id, { ...turn });
  }
}

function makeService(llmResponses: string[]) {
  const store = new FakeStore();
  store.projects.set("p1", {
    id: "p1",
    userId: "u1",
    title: "Untitled",
    createdAtMs: 1,
    updatedAtMs: 1,
  });

  const execute = vi.fn();
  for (const text of llmResponses) {
    execute.mockResolvedValueOnce({ text });
  }

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
    // REAL policy engine — only the LLM behind it is mocked.
    policy: new StudioPolicyEngine({
      ai: { execute, resolveExecution: () => STUB_EXECUTION },
    }),
    dailyCapCents: 500,
    now: () => new Date("2026-07-24T12:00:00Z"),
    idFactory: () => `id-${++idCounter}`,
  });

  return { service, store, execute };
}

describe("regression: clarify is a first-message-only action", () => {
  it("a project's first turn may clarify", async () => {
    const { service } = makeService([CLARIFY_JSON]);

    const result = await service.runTurn("u1", "p1", "make me a logo");

    expect(result.decision.action).toBe("clarify");
  });

  it("a follow-up turn never persists a clarify, even when the LLM proposes one", async () => {
    const { service, store } = makeService([
      // Turn 1: vague message → clarify (legitimate).
      CLARIFY_JSON,
      // Turn 2: the LLM tries to clarify AGAIN (the live bug)...
      CLARIFY_JSON,
      // ...and must be pushed to a generate on the corrective retry.
      GENERATE_JSON,
    ]);

    await service.runTurn("u1", "p1", "make me a logo");
    const second = await service.runTurn("u1", "p1", "Icon-based logo");
    await second.completion;

    expect(second.decision.action).toBe("generate");
    const persisted = await store.listTurns("p1");
    expect(persisted).toHaveLength(2);
    expect(persisted.map((turn) => turn.decision.action)).toEqual([
      "clarify",
      "generate",
    ]);
  });
});
