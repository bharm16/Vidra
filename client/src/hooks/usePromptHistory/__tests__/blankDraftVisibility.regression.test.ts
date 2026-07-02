/**
 * Regression: blank bootstrap drafts must not appear in the visible sessions list.
 *
 * Every plain page load of the workspace bootstraps a blank draft via
 * usePromptLoader.bootstrapBlankDraft() -> createDraft({ persist: false }).
 * The draft must stay in `history` (draft sync and in-memory hydration look it
 * up by uuid/id) but must not surface in `filteredHistory` — the selector that
 * feeds the Sessions panel — until the creator gives it content. Otherwise a
 * phantom "Untitled / Draft / 0m ago" row appears on every visit.
 *
 * Mock boundary: history storage api (localStorage/Firestore wrappers) and the
 * Toast context only. useHistoryState + useHistoryPersistence run real.
 */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as fc from "fast-check";
import type { PromptHistoryEntry } from "@hooks/usePromptHistory/types";

const {
  mockLoadFromFirestore,
  mockLoadFromLocalStorage,
  mockSyncToLocalStorage,
  mockSaveEntry,
} = vi.hoisted(() => ({
  mockLoadFromFirestore: vi.fn().mockResolvedValue([]),
  mockLoadFromLocalStorage: vi.fn().mockResolvedValue([]),
  mockSyncToLocalStorage: vi
    .fn()
    .mockReturnValue({ success: true, trimmed: false }),
  mockSaveEntry: vi.fn(),
}));

vi.mock("@hooks/usePromptHistory/api", () => ({
  loadFromFirestore: mockLoadFromFirestore,
  loadFromLocalStorage: mockLoadFromLocalStorage,
  syncToLocalStorage: mockSyncToLocalStorage,
  saveEntry: mockSaveEntry,
  updateHighlights: vi.fn(),
  updateOutput: vi.fn(),
  updateVersions: vi.fn(),
  updatePrompt: vi.fn(),
  deleteEntry: vi.fn(),
  clearAll: vi.fn(),
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

const mountHook = async () => {
  const rendered = renderHook(() => usePromptHistory(null));
  // Flush the mount-time localStorage load so it cannot clobber state later.
  await act(async () => {});
  return rendered;
};

describe("regression: blank draft bootstrap keeps the sessions list clean", () => {
  it("for any blank draft bootstrap, the visible sessions list gains no entry until the draft has content", async () => {
    await fc.assert(
      fc.asyncProperty(
        generationParamsArb,
        targetModelArb,
        async (generationParams, targetModel) => {
          const { result, unmount } = await mountHook();

          try {
            act(() => {
              result.current.createDraft({
                id: `draft-${Date.now()}`,
                mode: "video",
                targetModel,
                generationParams,
                persist: false,
              });
            });

            // The draft stays in history — draft sync and in-memory session
            // hydration depend on finding it there.
            expect(result.current.history).toHaveLength(1);
            // But the visible sessions list gains no phantom row.
            expect(result.current.filteredHistory).toHaveLength(0);
          } finally {
            unmount();
          }
        },
      ),
      { numRuns: 15 },
    );
  });

  it("the draft appears in the visible sessions list once the creator types content", async () => {
    const { result, unmount } = await mountHook();

    let draftUuid = "";
    act(() => {
      const draft = result.current.createDraft({
        id: `draft-${Date.now()}`,
        mode: "video",
        targetModel: null,
        generationParams: { aspectRatio: "16:9" },
        persist: false,
      });
      draftUuid = draft.uuid;
    });

    expect(result.current.filteredHistory).toHaveLength(0);

    act(() => {
      result.current.updateEntryLocal(draftUuid, {
        input: "a cat skateboarding through neon rain",
      });
    });

    expect(result.current.filteredHistory).toHaveLength(1);
    expect(result.current.filteredHistory[0]?.uuid).toBe(draftUuid);

    unmount();
  });

  it("persisted sessions remain visible even when their prompt text is empty", async () => {
    const persistedEntry: PromptHistoryEntry = {
      id: "AbC123xyz",
      uuid: "uuid-persisted",
      timestamp: new Date().toISOString(),
      title: null,
      input: "",
      output: "",
    };
    mockLoadFromLocalStorage.mockResolvedValueOnce([persistedEntry]);

    const { result, unmount } = await mountHook();

    expect(result.current.filteredHistory).toHaveLength(1);
    expect(result.current.filteredHistory[0]?.id).toBe("AbC123xyz");

    unmount();
  });
});
