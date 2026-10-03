import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type MockedFunction,
} from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useDraftHistorySync } from "@features/prompt-optimizer/context/hooks/useDraftHistorySync";
import type {
  PromptHistory,
  PromptOptimizer,
} from "@features/prompt-optimizer/context/types";
import type { PromptHistoryEntry } from "@features/prompt-optimizer/types/domain/prompt-session";
import type { CapabilityValues } from "@shared/capabilities";

type UpdatePayload = Parameters<PromptHistory["updateEntryPersisted"]>[2];

const createPromptOptimizer = (
  overrides: Partial<PromptOptimizer> = {},
): PromptOptimizer => {
  const setInputPrompt: MockedFunction<PromptOptimizer["setInputPrompt"]> =
    vi.fn();
  const setOptimizedPrompt: MockedFunction<
    PromptOptimizer["setOptimizedPrompt"]
  > = vi.fn();
  const setDisplayedPrompt: MockedFunction<
    PromptOptimizer["setDisplayedPrompt"]
  > = vi.fn();
  const setGenericOptimizedPrompt: MockedFunction<
    NonNullable<PromptOptimizer["setGenericOptimizedPrompt"]>
  > = vi.fn();
  const setPreviewPrompt: MockedFunction<PromptOptimizer["setPreviewPrompt"]> =
    vi.fn();
  const setPreviewAspectRatio: MockedFunction<
    PromptOptimizer["setPreviewAspectRatio"]
  > = vi.fn();
  const setSkipAnimation: MockedFunction<PromptOptimizer["setSkipAnimation"]> =
    vi.fn();
  const setImprovementContext: MockedFunction<
    PromptOptimizer["setImprovementContext"]
  > = vi.fn();
  const optimize: MockedFunction<PromptOptimizer["optimize"]> = vi.fn();
  const compile: MockedFunction<PromptOptimizer["compile"]> = vi.fn();
  const resetPrompt: MockedFunction<PromptOptimizer["resetPrompt"]> = vi.fn();
  const setLockedSpans: MockedFunction<PromptOptimizer["setLockedSpans"]> =
    vi.fn();
  const addLockedSpan: MockedFunction<PromptOptimizer["addLockedSpan"]> =
    vi.fn();
  const removeLockedSpan: MockedFunction<PromptOptimizer["removeLockedSpan"]> =
    vi.fn();
  const clearLockedSpans: MockedFunction<PromptOptimizer["clearLockedSpans"]> =
    vi.fn();

  return {
    inputPrompt: "",
    setInputPrompt,
    isProcessing: false,
    optimizedPrompt: "",
    setOptimizedPrompt,
    displayedPrompt: "",
    setDisplayedPrompt,
    genericOptimizedPrompt: null,
    setGenericOptimizedPrompt,
    previewPrompt: null,
    setPreviewPrompt,
    previewAspectRatio: null,
    setPreviewAspectRatio,
    qualityScore: null,
    skipAnimation: false,
    setSkipAnimation,
    improvementContext: null,
    setImprovementContext,
    optimizationResultVersion: 0,
    lockedSpans: [],
    optimize,
    compile,
    resetPrompt,
    setLockedSpans,
    addLockedSpan,
    removeLockedSpan,
    clearLockedSpans,
    ...overrides,
  };
};

const createPromptHistory = (
  history: PromptHistoryEntry[],
  updateEntryPersisted: PromptHistory["updateEntryPersisted"],
): PromptHistory => ({
  history,
  filteredHistory: [],
  isLoadingHistory: false,
  searchQuery: "",
  setSearchQuery: vi.fn(),
  saveToHistory: vi.fn(),
  createDraft: vi.fn(),
  updateEntryLocal: vi.fn(),
  clearHistory: vi.fn(),
  deleteFromHistory: vi.fn(),
  loadHistoryFromFirestore: vi.fn(),
  updateEntryHighlight: vi.fn(),
  updateEntryOutput: vi.fn(),
  updateEntryPersisted,
  flushVersionWrites: vi.fn(async (): Promise<void> => {}),
  updateEntryVersions: vi.fn(),
});

describe("useDraftHistorySync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("error handling", () => {
    it("skips updates when the current prompt UUID is missing", () => {
      const updates: Array<{
        uuid: string;
        docId: string | null;
        updates: UpdatePayload;
      }> = [];
      const promptHistory = createPromptHistory(
        [],
        (uuid, docId, updatesPayload) => {
          updates.push({ uuid, docId, updates: updatesPayload });
        },
      );

      renderHook(() =>
        useDraftHistorySync({
          currentPromptUuid: null,
          currentPromptDocId: null,
          promptHistory,
          promptOptimizer: createPromptOptimizer({ inputPrompt: "New draft" }),
          selectedModel: "model-a",
          generationParams: { steps: 5 },
        }),
      );

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(updates).toHaveLength(0);
    });

    it("skips updates when the history entry cannot be found", () => {
      const updates: Array<{
        uuid: string;
        docId: string | null;
        updates: UpdatePayload;
      }> = [];
      const promptHistory = createPromptHistory(
        [],
        (uuid, docId, updatesPayload) => {
          updates.push({ uuid, docId, updates: updatesPayload });
        },
      );

      renderHook(() =>
        useDraftHistorySync({
          currentPromptUuid: "uuid-missing",
          currentPromptDocId: null,
          promptHistory,
          promptOptimizer: createPromptOptimizer({ inputPrompt: "Draft" }),
          selectedModel: "model-a",
          generationParams: { steps: 5 },
        }),
      );

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(updates).toHaveLength(0);
    });

    it("skips updates when the history entry is not a draft", () => {
      const updates: Array<{
        uuid: string;
        docId: string | null;
        updates: UpdatePayload;
      }> = [];
      const historyEntry: PromptHistoryEntry = {
        uuid: "uuid-1",
        input: "Existing",
        output: "Done",
      };

      const promptHistory = createPromptHistory(
        [historyEntry],
        (uuid, docId, updatesPayload) => {
          updates.push({ uuid, docId, updates: updatesPayload });
        },
      );

      renderHook(() =>
        useDraftHistorySync({
          currentPromptUuid: "uuid-1",
          currentPromptDocId: "doc-1",
          promptHistory,
          promptOptimizer: createPromptOptimizer({ inputPrompt: "Changed" }),
          selectedModel: "model-a",
          generationParams: { steps: 5 },
        }),
      );

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(updates).toHaveLength(0);
    });

    it("cancels pending updates on unmount", () => {
      const updates: Array<{
        uuid: string;
        docId: string | null;
        updates: UpdatePayload;
      }> = [];
      const historyEntry: PromptHistoryEntry = {
        uuid: "uuid-2",
        input: "Old draft",
        output: "",
      };

      const promptHistory = createPromptHistory(
        [historyEntry],
        (uuid, docId, updatesPayload) => {
          updates.push({ uuid, docId, updates: updatesPayload });
        },
      );

      const { unmount } = renderHook(() =>
        useDraftHistorySync({
          currentPromptUuid: "uuid-2",
          currentPromptDocId: "doc-2",
          promptHistory,
          promptOptimizer: createPromptOptimizer({
            inputPrompt: "Updated draft",
          }),
          selectedModel: "model-a",
          generationParams: { steps: 5 },
        }),
      );

      unmount();

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(updates).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    it("treats whitespace-only model values as null", () => {
      const updates: Array<{
        uuid: string;
        docId: string | null;
        updates: UpdatePayload;
      }> = [];
      const historyEntry: PromptHistoryEntry = {
        uuid: "uuid-3",
        input: "Draft",
        output: "",
        targetModel: null,
      };

      const promptHistory = createPromptHistory(
        [historyEntry],
        (uuid, docId, updatesPayload) => {
          updates.push({ uuid, docId, updates: updatesPayload });
        },
      );

      renderHook(() =>
        useDraftHistorySync({
          currentPromptUuid: "uuid-3",
          currentPromptDocId: "doc-3",
          promptHistory,
          promptOptimizer: createPromptOptimizer({
            inputPrompt: "Draft updated",
          }),
          selectedModel: "   ",
          generationParams: { steps: 5 },
        }),
      );

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(updates).toHaveLength(1);
      expect(updates[0]?.updates.targetModel).toBeNull();
    });

    it("detects deep-equal generation params and avoids updates", () => {
      const updates: Array<{
        uuid: string;
        docId: string | null;
        updates: UpdatePayload;
      }> = [];
      const params: CapabilityValues = { steps: 2, seed: 9 };
      const historyEntry: PromptHistoryEntry = {
        uuid: "uuid-4",
        input: "Draft",
        output: "",
        generationParams: params,
      };

      const promptHistory = createPromptHistory(
        [historyEntry],
        (uuid, docId, updatesPayload) => {
          updates.push({ uuid, docId, updates: updatesPayload });
        },
      );

      renderHook(() =>
        useDraftHistorySync({
          currentPromptUuid: "uuid-4",
          currentPromptDocId: "doc-4",
          promptHistory,
          promptOptimizer: createPromptOptimizer({ inputPrompt: "Draft" }),
          selectedModel: "",
          generationParams: { steps: 2, seed: 9 },
        }),
      );

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(updates).toHaveLength(0);
    });
  });

  describe("core behavior", () => {
    it("persists draft changes after the debounce interval", () => {
      const updates: Array<{
        uuid: string;
        docId: string | null;
        updates: UpdatePayload;
      }> = [];
      const historyEntry: PromptHistoryEntry = {
        uuid: "uuid-5",
        input: "Old draft",
        output: "",
        targetModel: "model-a",
        generationParams: { steps: 2 },
      };

      const promptHistory = createPromptHistory(
        [historyEntry],
        (uuid, docId, updatesPayload) => {
          updates.push({ uuid, docId, updates: updatesPayload });
        },
      );

      renderHook(() =>
        useDraftHistorySync({
          currentPromptUuid: "uuid-5",
          currentPromptDocId: "doc-5",
          promptHistory,
          promptOptimizer: createPromptOptimizer({ inputPrompt: "New draft" }),
          selectedModel: "model-b",
          generationParams: { steps: 3 },
        }),
      );

      expect(updates).toHaveLength(0);

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(updates).toHaveLength(1);
      expect(updates[0]).toEqual({
        uuid: "uuid-5",
        docId: "doc-5",
        updates: {
          input: "New draft",
          targetModel: "model-b",
          generationParams: { steps: 3 },
        },
      });
    });
  });
});
