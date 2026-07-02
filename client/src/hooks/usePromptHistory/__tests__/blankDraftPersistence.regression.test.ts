/**
 * Regression: blank bootstrap drafts must never land in the persistent
 * history store.
 *
 * Every plain page load bootstraps a blank draft via
 * usePromptLoader.bootstrapBlankDraft() -> createDraft({ persist: false }).
 * The draft is in-memory scaffolding — but the workspace settings sync
 * (useDraftHistorySync) fires updateEntryPersisted on the draft id whenever
 * the model or generation params drift, even with no creator text. For draft
 * ids that routes into the debounced full localStorage snapshot, so the
 * blank draft became a durable store entry that resurfaced on every later
 * load as an "Untitled prompt / OUTPUT —" record in the session archive.
 *
 * Mock boundary: the repositories module (external storage) only.
 * useHistoryState + useHistoryPersistence + the historyRepository api layer
 * run real.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fc from "fast-check";
import type { PromptHistoryEntry } from "@hooks/usePromptHistory/types";

const { mockSyncEntries, mockGetUserPrompts } = vi.hoisted(() => ({
  mockSyncEntries: vi.fn(),
  mockGetUserPrompts: vi.fn(),
}));

vi.mock("../../../repositories", () => ({
  getLocalPromptRepository: () => ({ syncEntries: mockSyncEntries }),
  getPromptRepositoryForUser: () => ({ getUserPrompts: mockGetUserPrompts }),
}));

import { usePromptHistory } from "@hooks/usePromptHistory";

const capabilityValueArb = fc.oneof(
  fc.string({ maxLength: 12 }),
  fc.integer(),
  fc.boolean(),
);

const generationParamsArb = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 16 }),
  capabilityValueArb,
  { maxKeys: 6 },
);

const targetModelArb = fc.option(fc.string({ minLength: 1, maxLength: 24 }), {
  nil: null,
});

/**
 * Independent oracle for "blank draft" — a local draft-scoped entry with no
 * creator content. Deliberately re-stated here instead of importing the
 * production predicate so the test observes the store contract, not the
 * implementation.
 */
const isBlankDraftShape = (entry: PromptHistoryEntry): boolean =>
  typeof entry.id === "string" &&
  entry.id.startsWith("draft-") &&
  (entry.title ?? "").trim().length === 0 &&
  entry.input.trim().length === 0 &&
  entry.output.trim().length === 0 &&
  (entry.keyframes?.length ?? 0) === 0 &&
  (entry.versions?.length ?? 0) === 0;

const storeEverReceivedBlankDraft = (): boolean =>
  mockSyncEntries.mock.calls.some((call) =>
    (call[0] as PromptHistoryEntry[]).some(isBlankDraftShape),
  );

const mountHook = async () => {
  const rendered = renderHook(() => usePromptHistory(null));
  // Flush the mount-time localStorage load so it cannot clobber state later.
  await act(async () => {});
  return rendered;
};

beforeEach(() => {
  vi.useFakeTimers();
  mockSyncEntries.mockReturnValue({ success: true, trimmed: false });
  mockGetUserPrompts.mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("regression: blank draft bootstrap never reaches the history store", () => {
  it("for any bootstrap settings sync on a blank draft, no blank draft is written to the store", async () => {
    await fc.assert(
      fc.asyncProperty(
        generationParamsArb,
        targetModelArb,
        async (generationParams, targetModel) => {
          mockSyncEntries.mockClear();
          const { result, unmount } = await mountHook();

          try {
            let uuid = "";
            let docId = "";
            act(() => {
              const draft = result.current.createDraft({
                id: `draft-${Date.now()}`,
                mode: "video",
                targetModel,
                generationParams,
                persist: false,
              });
              uuid = draft.uuid;
              docId = draft.id;
            });

            // The workspace settings sync that fires on bootstrap
            // (useDraftHistorySync payload): no creator text, params only.
            act(() => {
              result.current.updateEntryPersisted(uuid, docId, {
                input: "",
                targetModel,
                generationParams,
              });
            });

            // Let the debounced full snapshot flush...
            act(() => {
              vi.advanceTimersByTime(6_000);
            });
          } finally {
            // ...and exercise the unmount flush too.
            unmount();
          }

          expect(storeEverReceivedBlankDraft()).toBe(false);
        },
      ),
      { numRuns: 10 },
    );
  });

  it("a draft that holds creator text is still persisted to the store", async () => {
    const { result, unmount } = await mountHook();

    let uuid = "";
    let docId = "";
    act(() => {
      const draft = result.current.createDraft({
        id: `draft-${Date.now()}`,
        mode: "video",
        targetModel: null,
        generationParams: { aspectRatio: "16:9" },
        persist: false,
      });
      uuid = draft.uuid;
      docId = draft.id;
    });

    act(() => {
      result.current.updateEntryPersisted(uuid, docId, {
        input: "a cat skateboarding through neon rain",
        targetModel: null,
        generationParams: { aspectRatio: "16:9" },
      });
    });

    act(() => {
      vi.advanceTimersByTime(6_000);
    });

    expect(mockSyncEntries).toHaveBeenCalled();
    const lastCall = mockSyncEntries.mock.calls.at(-1);
    const persisted = (lastCall?.[0] ?? []) as PromptHistoryEntry[];
    expect(
      persisted.some(
        (entry) =>
          entry.id === docId &&
          entry.input === "a cat skateboarding through neon rain",
      ),
    ).toBe(true);

    unmount();
  });
});
