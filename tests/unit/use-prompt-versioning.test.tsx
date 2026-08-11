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

  it("creates a new version when the prompt has changed", () => {
    const existingVersions: PromptVersionEntry[] = [
      {
        versionId: "v-1",
        label: "v1",
        signature: "sig-old",
        prompt: "Old prompt",
        timestamp: "2023-01-01T00:00:00.000Z",
      },
    ];

    const promptHistory = createPromptHistory({
      history: [
        {
          uuid: "uuid-1",
          input: "input",
          output: "output",
          versions: existingVersions,
        },
      ],
    });

    const latestHighlightRef: MutableRefObject<HighlightSnapshot | null> = {
      current: { spans: [], signature: "sig-new" },
    };
    const versionEditCountRef: MutableRefObject<number> = { current: 2 };
    const versionEditsRef: MutableRefObject<PromptVersionEdit[]> = {
      current: [{ timestamp: "2024-01-01T00:00:00.000Z", source: "manual" }],
    };
    const resetVersionEdits = vi.fn();

    const { result } = renderHook(() =>
      usePromptVersioning({
        promptHistory,
        currentPromptUuid: "uuid-1",
        currentPromptDocId: "doc-1",
        latestHighlightRef,
        versionEditCountRef,
        versionEditsRef,
        resetVersionEdits,
        effectiveAspectRatio: "1:1",
        generationParams: { steps: 10 },
        selectedModel: "model-a",
      }),
    );

    act(() => {
      result.current.upsertVersionOutput({
        action: "preview",
        prompt: "New prompt",
        generatedAt: 1700000000000,
        imageUrl: "https://example.com/image.png",
        aspectRatio: "4:3",
      });
    });

    expect(promptHistory.updateEntryVersions).toHaveBeenCalledWith(
      "uuid-1",
      "doc-1",
      expect.any(Array),
    );
    const versions = vi.mocked(promptHistory.updateEntryVersions).mock
      .calls[0]?.[2];
    expect(versions).toHaveLength(2);
    expect(versions?.[0]).toEqual(existingVersions[0]);
    expect(versions?.[1]).toMatchObject({
      versionId: expect.stringMatching(/^v-1704067200000-/),
      label: "v2",
      signature: "sig-new",
      prompt: "New prompt",
      timestamp: "2024-01-01T00:00:00.000Z",
      editCount: 2,
      edits: [{ timestamp: "2024-01-01T00:00:00.000Z", source: "manual" }],
      highlights: { spans: [], signature: "sig-new" },
      firstFrame: {
        generatedAt: new Date(1700000000000).toISOString(),
        imageUrl: "https://example.com/image.png",
        aspectRatio: "4:3",
        storagePath: null,
        assetId: null,
        viewUrlExpiresAt: null,
      },
    });
    expect(resetVersionEdits).toHaveBeenCalled();
  });

  it("updates the last version when signatures match", () => {
    mockCreateHighlightSignature.mockReturnValue("sig-same");

    const existingVersions: PromptVersionEntry[] = [
      {
        versionId: "v-1",
        label: "v1",
        signature: "sig-same",
        prompt: "Prompt",
        timestamp: "2023-01-01T00:00:00.000Z",
      },
    ];

    const promptHistory = createPromptHistory({
      history: [
        {
          uuid: "uuid-2",
          input: "input",
          output: "output",
          versions: existingVersions,
        },
      ],
    });

    const resetVersionEdits = vi.fn();

    const { result } = renderHook(() =>
      usePromptVersioning({
        promptHistory,
        currentPromptUuid: "uuid-2",
        currentPromptDocId: "doc-2",
        latestHighlightRef: { current: null },
        versionEditCountRef: { current: 0 },
        versionEditsRef: { current: [] },
        resetVersionEdits,
        effectiveAspectRatio: "16:9",
        generationParams: { steps: 12 },
        selectedModel: "model-a",
      }),
    );

    act(() => {
      result.current.upsertVersionOutput({
        action: "preview",
        prompt: "Prompt",
        generatedAt: "2024-01-01T00:00:00.000Z",
        imageUrl: null,
      });
    });

    expect(promptHistory.updateEntryVersions).toHaveBeenCalledWith(
      "uuid-2",
      "doc-2",
      expect.any(Array),
    );
    const versions = vi.mocked(promptHistory.updateEntryVersions).mock
      .calls[0]?.[2];
    expect(versions).toHaveLength(1);
    expect(versions?.[0]).toMatchObject({
      signature: "sig-same",
      firstFrame: {
        generatedAt: "2024-01-01T00:00:00.000Z",
        imageUrl: null,
        aspectRatio: "16:9",
        storagePath: null,
        assetId: null,
        viewUrlExpiresAt: null,
      },
    });
    expect(resetVersionEdits).not.toHaveBeenCalled();
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
        effectiveAspectRatio: null,
        generationParams: {},
        selectedModel: "",
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
        effectiveAspectRatio: null,
        generationParams: {},
        selectedModel: "",
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
