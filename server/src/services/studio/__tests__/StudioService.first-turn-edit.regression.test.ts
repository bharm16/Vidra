import { describe, it, expect, vi } from "vitest";
import { StudioService, type SessionPictureSource } from "../StudioService";
import { StudioModelRegistry } from "../StudioModelRegistry";
import { StudioPolicyEngine, StudioPolicyError } from "../StudioPolicyEngine";
import { StudioCapExceededError } from "../storage/FirestoreStudioProjectStore";
import type { StudioProjectStore } from "../storage/StudioProjectStore";
import type {
  StudioDecision,
  StudioProjectRecord,
  StudioTurnRecord,
} from "../types";
import type { ResolvedExecution } from "@services/ai-model/types";

/**
 * Regression (issue #110, ADR-0022 decision 4): the first turn can edit or
 * transform a picture the project ALREADY holds.
 *
 * The old rule picked the first turn's allowed actions from conversation
 * length alone and excluded edit/transform, so the REAL policy engine rejected
 * a first-turn edit with a corrective re-ask and failed the turn after two
 * attempts — even on a project bridged from a session picture, or one with an
 * uploaded attachment, which hold a selected editable image before any turn
 * exists. The new rule keys edit/transform to whether a source image exists.
 *
 * Enforcement lives in the policy engine (`allowedActions`), so these hold
 * through the REAL StudioPolicyEngine with only the process-external LLM
 * boundary mocked — the same seam the clarify-once regression uses.
 */

/** Routing answer for the port stub; Studio does not vary provider by test. */
const STUB_EXECUTION: ResolvedExecution = {
  client: "openai",
  provider: "openai",
  model: "stub-model",
  viaFallback: false,
};

/** The take as the session records it: a path the creator owns, not a URL. */
const SOURCE: SessionPictureSource = {
  sessionId: "session-1",
  promptVersionId: "v1",
  generationId: "take-1",
  storagePath: "users/user-1/previews/images/1758100000000-abcdef01.webp",
  assetId: "1758100000000-abcdef01.webp",
};

const NOW_MS = new Date("2026-09-17T12:00:00Z").getTime();

const SUGGESTIONS: [string, string, string] = [
  "Warmer light",
  "Tighter crop",
  "Cooler grade",
];

/**
 * In-memory store honoring the reservation contract, injected structurally —
 * the service never knows it isn't Firestore. Mirrors the fakes the other
 * studio suites hand-roll (there is no shared fake module).
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

function makeService() {
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

  // REAL policy engine — only the LLM behind it is mocked.
  const execute = vi.fn();
  const service = new StudioService({
    store,
    registry: new StudioModelRegistry(),
    runner,
    storage,
    policy: new StudioPolicyEngine({
      ai: { execute, resolveExecution: () => STUB_EXECUTION },
    }),
    dailyCapCents: 500,
    now: () => new Date(NOW_MS),
    idFactory: () => `id-${++idCounter}`,
  });

  return { service, store, execute, runner };
}

describe("regression: the first turn can edit a picture the project already holds (#110)", () => {
  it("a project bridged from a session picture edits on the FIRST message, no prior generation", async () => {
    const { service, execute } = makeService();
    const project = await service.createProjectFromSessionPicture(
      "user-1",
      SOURCE,
    );
    const bridgedId = project.origin?.bridgedImageId ?? "";
    expect(bridgedId).not.toBe("");

    // The conversation LLM's very first decision is an edit of the bridged
    // picture — nothing has been generated or asked first.
    execute.mockResolvedValueOnce({
      text: JSON.stringify({
        action: "edit",
        instruction: "remove the chair",
        sourceImageIds: [bridgedId],
        suggestions: SUGGESTIONS,
      } satisfies StudioDecision),
    });

    const result = await service.runTurn(
      "user-1",
      project.id,
      "remove the chair",
    );
    await result.completion;

    // Accepted on the first attempt — not rejected with a corrective re-ask.
    expect(result.decision.action).toBe("edit");
    expect(execute).toHaveBeenCalledTimes(1);
    const turn = await service.getTurn("user-1", project.id, result.turnId);
    expect(turn.status).toBe("complete");
    expect(turn.calls[0]?.status).toBe("succeeded");
  });

  it("a project with an uploaded attachment and no turns transforms on the FIRST message", async () => {
    const { service, execute } = makeService();
    const project = await service.createProject("user-1");
    const attachment = await service.addAttachment("user-1", project.id, {
      storagePath: "users/user-1/previews/images/upload.webp",
      filename: "reference.png",
    });

    execute.mockResolvedValueOnce({
      text: JSON.stringify({
        action: "transform",
        operation: "remove_background",
        sourceImageId: attachment.id,
        suggestions: SUGGESTIONS,
      } satisfies StudioDecision),
    });

    const result = await service.runTurn(
      "user-1",
      project.id,
      "remove the background of this",
    );
    await result.completion;

    expect(result.decision.action).toBe("transform");
    expect(execute).toHaveBeenCalledTimes(1);
    const turn = await service.getTurn("user-1", project.id, result.turnId);
    expect(turn.status).toBe("complete");
    expect(turn.calls[0]?.status).toBe("succeeded");
  });

  it("a fresh project with no images cannot edit on the first turn — the policy rejects it and the turn fails", async () => {
    const { service, execute } = makeService();
    const project = await service.createProject("user-1");

    // The LLM insists on an edit twice. With no source image in the project,
    // edit is not an allowed first-turn action, so both asks are rejected and
    // the turn fails after the corrective re-ask (MAX_ATTEMPTS = 2).
    const editJson = JSON.stringify({
      action: "edit",
      instruction: "remove the chair",
      sourceImageIds: ["nonexistent"],
      suggestions: SUGGESTIONS,
    } satisfies StudioDecision);
    execute.mockResolvedValueOnce({ text: editJson });
    execute.mockResolvedValueOnce({ text: editJson });

    await expect(
      service.runTurn("user-1", project.id, "remove the chair"),
    ).rejects.toBeInstanceOf(StudioPolicyError);
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
