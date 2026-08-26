import {
  describe,
  expect,
  it,
  beforeEach,
  afterEach,
  vi,
  type MockedFunction,
} from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { MutableRefObject } from "react";

import { usePromptVersioning } from "@features/prompt-optimizer/PromptCanvas/hooks/usePromptVersioning";
import { createHighlightSignature } from "@/features/span-highlighting";
import type { PromptHistory } from "@features/prompt-optimizer/context/types";
import type {
  PromptVersionEntry,
  PromptVersionEdit,
} from "@features/prompt-optimizer/types/domain/prompt-session";
import type { HighlightSnapshot } from "@features/prompt-optimizer/PromptCanvas/types";

vi.mock("@/features/span-highlighting", () => ({
  createHighlightSignature: vi.fn(),
}));

const mockCreateHighlightSignature = vi.mocked(createHighlightSignature);

const createPromptHistory = (
  overrides: Partial<PromptHistory> = {},
): PromptHistory => {
  const updateEntryVersions: MockedFunction<
    PromptHistory["updateEntryVersions"]
  > = vi.fn();

  return {
    history: [],
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
    updateEntryPersisted: vi.fn(),
    updateEntryVersions,
    ...overrides,
  };
};

describe("usePromptVersioning", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
    vi.spyOn(Math, "random").mockReturnValue(0.123456);
    mockCreateHighlightSignature.mockReturnValue("sig-new");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("creates an initial version when syncing highlights without versions", () => {
    const promptHistory = createPromptHistory({
      history: [
        { uuid: "uuid-3", input: "input", output: "output", versions: [] },
      ],
    });

    const resetVersionEdits = vi.fn();

    const { result } = renderHook(() =>
      usePromptVersioning({
        promptHistory,
        currentPromptUuid: "uuid-3",
        currentPromptDocId: "doc-3",
        latestHighlightRef: { current: null },
        versionEditCountRef: { current: 0 },
        versionEditsRef: { current: [] },
        resetVersionEdits,
      }),
    );

    act(() => {
      result.current.syncVersionHighlights(
        { spans: [], signature: "sig-new" },
        "Prompt text",
      );
    });

    expect(promptHistory.updateEntryVersions).toHaveBeenCalledWith(
      "uuid-3",
      "doc-3",
      [
        expect.objectContaining({
          signature: "sig-new",
          prompt: "Prompt text",
          highlights: { spans: [], signature: "sig-new" },
        }),
      ],
    );
    expect(resetVersionEdits).toHaveBeenCalled();
  });

  it("updates highlights when signatures match the latest version", () => {
    const existingVersions: PromptVersionEntry[] = [
      {
        versionId: "v-1",
        label: "v1",
        signature: "sig-new",
        prompt: "Prompt",
        timestamp: "2023-01-01T00:00:00.000Z",
      },
    ];

    const promptHistory = createPromptHistory({
      history: [
        {
          uuid: "uuid-4",
          input: "input",
          output: "output",
          versions: existingVersions,
        },
      ],
    });

    const { result } = renderHook(() =>
      usePromptVersioning({
        promptHistory,
        currentPromptUuid: "uuid-4",
        currentPromptDocId: "doc-4",
        latestHighlightRef: { current: null },
        versionEditCountRef: { current: 0 },
        versionEditsRef: { current: [] },
        resetVersionEdits: vi.fn(),
      }),
    );

    act(() => {
      result.current.syncVersionHighlights(
        { spans: [], signature: "sig-new" },
        "Prompt",
      );
    });

    expect(promptHistory.updateEntryVersions).toHaveBeenCalledWith(
      "uuid-4",
      "doc-4",
      [
        expect.objectContaining({
          signature: "sig-new",
          highlights: { spans: [], signature: "sig-new" },
        }),
      ],
    );
  });
});
