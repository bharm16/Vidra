import { describe, it, expect, vi } from "vitest";
import {
  attachTakeWithOwedTracking,
  type OwedTakeAttachment,
  type OwedTakeAttachmentInput,
  type OwedTakeAttachmentStore,
} from "../attachTakeWithOwedTracking";
import type { SessionAppendPort } from "../attachTakeToSession";
import { SessionNotFoundError } from "../SessionService";

/**
 * The quick-picture (generated) half of ADR-0022 decision 6 — issue #133.
 *
 * The seam mirrors the clip worker's `attachCompletedJobToSession`: a durable
 * `pending` checkpoint before the append, then the append reporting rather than
 * throwing, then the debt settled with the outcome. These tests hold it to that
 * contract against an in-memory store and append port — the same seam the
 * admission tests use, no internal module mocked.
 */

/** An in-memory owed-attachment ledger, keyed by generation id. */
function makeStore(): OwedTakeAttachmentStore & {
  readonly docs: Map<string, OwedTakeAttachment>;
} {
  const docs = new Map<string, OwedTakeAttachment>();
  return {
    docs,
    async recordOwedPending(input: OwedTakeAttachmentInput): Promise<void> {
      docs.set(input.generationId, {
        userId: input.userId,
        generationId: input.generationId,
        sessionId: input.sessionId,
        promptVersionId: input.promptVersionId,
        state: "pending",
        record: input.record,
      });
    },
    async settleOwed(input, attachment): Promise<void> {
      if (attachment.state === "attached") {
        docs.delete(input.generationId);
        return;
      }
      docs.set(input.generationId, {
        userId: input.userId,
        generationId: input.generationId,
        sessionId: input.sessionId,
        promptVersionId: input.promptVersionId,
        state: "failed",
        reason: attachment.reason,
        record: input.record,
      });
    },
    async listOwedForSession(userId, sessionId): Promise<OwedTakeAttachment[]> {
      return [...docs.values()].filter(
        (d) => d.userId === userId && d.sessionId === sessionId,
      );
    },
    async getOwned(
      userId,
      generationId,
    ): Promise<OwedTakeAttachment | undefined> {
      const doc = docs.get(generationId);
      return doc && doc.userId === userId ? doc : undefined;
    },
  };
}

const INPUT: OwedTakeAttachmentInput = {
  userId: "user-1",
  generationId: "gen-1",
  sessionId: "session-1",
  promptVersionId: "v1",
  record: { id: "gen-1", mediaType: "image", status: "completed" },
};

describe("attachTakeWithOwedTracking (issue #133)", () => {
  it("checkpoints pending before attaching, then clears the debt on success", async () => {
    const store = makeStore();
    const order: string[] = [];
    const recordSpy = vi.spyOn(store, "recordOwedPending");
    const sessionService: SessionAppendPort = {
      appendGenerationToVersion: vi.fn(async () => {
        // The checkpoint must already exist by the time the append runs.
        order.push("append");
        expect(store.docs.get("gen-1")?.state).toBe("pending");
        return {};
      }),
    };
    recordSpy.mockImplementation(async (input) => {
      order.push("checkpoint");
      store.docs.set(input.generationId, {
        userId: input.userId,
        generationId: input.generationId,
        sessionId: input.sessionId,
        promptVersionId: input.promptVersionId,
        state: "pending",
        record: input.record,
      });
    });

    const attachment = await attachTakeWithOwedTracking({
      store,
      sessionService,
      input: INPUT,
      logLabel: "Quick picture",
    });

    expect(order).toEqual(["checkpoint", "append"]);
    expect(attachment.state).toBe("attached");
    // Attached: no longer owed — the session is now the source of truth.
    expect(store.docs.has("gen-1")).toBe(false);
  });

  it("leaves a retryable owed record when the append fails", async () => {
    const store = makeStore();
    const sessionService: SessionAppendPort = {
      appendGenerationToVersion: vi.fn(async () => {
        throw new Error("firestore unavailable");
      }),
    };

    const attachment = await attachTakeWithOwedTracking({
      store,
      sessionService,
      input: INPUT,
      logLabel: "Quick picture",
    });

    expect(attachment.state).toBe("failed");
    // The record rides back so a retry re-sends this exact take.
    expect(attachment.record).toEqual(INPUT.record);
    const owed = store.docs.get("gen-1");
    expect(owed?.state).toBe("failed");
    expect(owed?.reason).toBe("firestore unavailable");
    expect(owed?.record).toEqual(INPUT.record);
  });

  it("reports a deleted destination truthfully rather than as saved", async () => {
    const store = makeStore();
    const sessionService: SessionAppendPort = {
      appendGenerationToVersion: vi.fn(async () => {
        throw new SessionNotFoundError("session-1");
      }),
    };

    const attachment = await attachTakeWithOwedTracking({
      store,
      sessionService,
      input: INPUT,
      logLabel: "Retried picture",
    });

    expect(attachment.state).toBe("failed");
    expect(attachment.reason).toContain("session-1");
    // Still owed — a take cannot be saved to a session that is gone, and the
    // debt says so rather than disappearing as if it had landed.
    expect(store.docs.get("gen-1")?.state).toBe("failed");
  });

  it("attaches without a store, leaving no durable trace", async () => {
    const sessionService: SessionAppendPort = {
      appendGenerationToVersion: vi.fn(async () => ({})),
    };

    const attachment = await attachTakeWithOwedTracking({
      store: undefined,
      sessionService,
      input: INPUT,
      logLabel: "Quick picture",
    });

    expect(attachment.state).toBe("attached");
    expect(sessionService.appendGenerationToVersion).toHaveBeenCalledTimes(1);
  });

  it("still attaches when the checkpoint write itself fails", async () => {
    const store = makeStore();
    vi.spyOn(store, "recordOwedPending").mockRejectedValue(
      new Error("ledger write blip"),
    );
    const sessionService: SessionAppendPort = {
      appendGenerationToVersion: vi.fn(async () => ({})),
    };

    const attachment = await attachTakeWithOwedTracking({
      store,
      sessionService,
      input: INPUT,
      logLabel: "Quick picture",
    });

    expect(attachment.state).toBe("attached");
  });
});
