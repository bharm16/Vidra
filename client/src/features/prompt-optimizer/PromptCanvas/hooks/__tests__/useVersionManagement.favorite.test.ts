import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  PromptHistoryEntry,
  PromptVersionEntry,
} from "@features/prompt-optimizer/types/domain/prompt-session";
import { useVersionManagement } from "../useVersionManagement";

const syncVersionHighlights = vi.fn();
const syncVersionGenerations = vi.fn();

vi.mock("../usePromptVersioning", () => ({
  usePromptVersioning: () => ({
    syncVersionHighlights,
    syncVersionGenerations,
  }),
}));

const makeVersions = (): PromptVersionEntry[] => [
  {
    versionId: "v-1",
    signature: "sig-1",
    prompt: "A prompt",
    timestamp: new Date().toISOString(),
    generations: [
      {
        id: "gen-1",
        tier: "draft",
        status: "completed",
        model: "wan-2.2",
        prompt: "Prompt one",
        promptVersionId: "v-1",
        createdAt: Date.now(),
        completedAt: Date.now(),
        mediaType: "video",
        mediaUrls: ["https://example.com/one.mp4"],
        isFavorite: false,
      },
      {
        id: "gen-2",
        tier: "render",
        status: "completed",
        model: "sora-2",
        prompt: "Prompt two",
        promptVersionId: "v-1",
        createdAt: Date.now(),
        completedAt: Date.now(),
        mediaType: "video",
        mediaUrls: ["https://example.com/two.mp4"],
        isFavorite: false,
      },
    ],
  },
];

describe("useVersionManagement setGenerationFavorite", () => {
  it("persists favorite changes across versions", () => {
    const updateEntryVersions = vi.fn();
    const historyEntry: PromptHistoryEntry = {
      id: "doc-1",
      uuid: "uuid-1",
      input: "input",
      output: "output",
      versions: makeVersions(),
    };

    const { result } = renderHook(() =>
      useVersionManagement({
        hasShotContext: false,
        shotId: null,
        shotPromptEntry: null,
        updateShotVersions: vi.fn(),
        promptHistory: {
          history: [historyEntry],
          createDraft: vi.fn(() => ({ uuid: "uuid-1", id: "doc-1" })),
          updateEntryVersions,
        },
        currentPromptUuid: "uuid-1",
        currentPromptDocId: "doc-1",
        setCurrentPromptUuid: vi.fn(),
        setCurrentPromptDocId: vi.fn(),
        activeVersionId: "v-1",
        setActiveVersionId: vi.fn(),
        inputPrompt: "A prompt",
        normalizedDisplayedPrompt: "A prompt",
        selectedMode: "video",
        selectedModel: "wan-2.2",
        generationParams: {},
        serializedKeyframes: [],
        promptOptimizer: {
          setOptimizedPrompt: vi.fn(),
        },
        applyInitialHighlightSnapshot: vi.fn(),
        setDisplayedPromptSilently: vi.fn(),
        latestHighlightRef: { current: null },
        versionEditCountRef: { current: 0 },
        versionEditsRef: { current: [] },
        resetVersionEdits: vi.fn(),
      }),
    );

    act(() => {
      result.current.setGenerationFavorite("gen-2", true);
    });

    expect(updateEntryVersions).toHaveBeenCalledTimes(1);
    const persistedVersions = updateEntryVersions.mock
      .calls[0]?.[2] as PromptVersionEntry[];
    const persistedGeneration = persistedVersions?.[0]?.generations?.find(
      (generation) => generation.id === "gen-2",
    );
    expect(persistedGeneration?.isFavorite).toBe(true);
  });

  it("does not persist when favorite value does not change", () => {
    const updateEntryVersions = vi.fn();
    const historyEntry: PromptHistoryEntry = {
      id: "doc-1",
      uuid: "uuid-1",
      input: "input",
      output: "output",
      versions: makeVersions(),
    };

    const { result } = renderHook(() =>
      useVersionManagement({
        hasShotContext: false,
        shotId: null,
        shotPromptEntry: null,
        updateShotVersions: vi.fn(),
        promptHistory: {
          history: [historyEntry],
          createDraft: vi.fn(() => ({ uuid: "uuid-1", id: "doc-1" })),
          updateEntryVersions,
        },
        currentPromptUuid: "uuid-1",
        currentPromptDocId: "doc-1",
        setCurrentPromptUuid: vi.fn(),
        setCurrentPromptDocId: vi.fn(),
        activeVersionId: "v-1",
        setActiveVersionId: vi.fn(),
        inputPrompt: "A prompt",
        normalizedDisplayedPrompt: "A prompt",
        selectedMode: "video",
        selectedModel: "wan-2.2",
        generationParams: {},
        serializedKeyframes: [],
        promptOptimizer: {
          setOptimizedPrompt: vi.fn(),
        },
        applyInitialHighlightSnapshot: vi.fn(),
        setDisplayedPromptSilently: vi.fn(),
        latestHighlightRef: { current: null },
        versionEditCountRef: { current: 0 },
        versionEditsRef: { current: [] },
        resetVersionEdits: vi.fn(),
      }),
    );

    act(() => {
      result.current.setGenerationFavorite("gen-1", false);
    });

    expect(updateEntryVersions).not.toHaveBeenCalled();
  });
});
