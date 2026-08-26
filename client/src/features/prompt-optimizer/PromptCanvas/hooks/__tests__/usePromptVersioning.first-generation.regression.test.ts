import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Generation } from "@features/generations/types";
import type {
  PromptHistoryEntry,
  PromptVersionEntry,
} from "@features/prompt-optimizer/types/domain/prompt-session";
import { usePromptVersioning } from "../usePromptVersioning";

const makeGeneration = (): Generation => ({
  id: "gen-queued",
  tier: "render",
  status: "pending",
  model: "sora-2",
  prompt: "A cinematic drone shot of a lighthouse in a winter storm at dusk.",
  promptVersionId: "v-seed",
  createdAt: Date.now(),
  completedAt: null,
  mediaType: "video",
  mediaUrls: [],
  serverJobStatus: "queued",
  serverProgress: 5,
  isFavorite: false,
});

describe("usePromptVersioning syncVersionGenerations", () => {
  it("seeds the first version from an in-flight generation when versions have not hydrated yet", () => {
    const updateEntryVersions = vi.fn();
    const historyEntry: PromptHistoryEntry = {
      id: "doc-1",
      uuid: "uuid-1",
      input:
        "A cinematic drone shot of a lighthouse in a winter storm at dusk.",
      output: "",
      versions: [],
    };
    const generation = makeGeneration();

    const { result } = renderHook(() =>
      usePromptVersioning({
        promptHistory: {
          history: [historyEntry],
          updateEntryVersions,
        },
        currentPromptUuid: "uuid-1",
        currentPromptDocId: "doc-1",
        activeVersionId: null,
        latestHighlightRef: { current: null },
        versionEditCountRef: { current: 0 },
        versionEditsRef: { current: [] },
        resetVersionEdits: vi.fn(),
      }),
    );

    act(() => {
      result.current.syncVersionGenerations([generation]);
    });

    expect(updateEntryVersions).toHaveBeenCalledTimes(1);
    expect(updateEntryVersions).toHaveBeenCalledWith(
      "uuid-1",
      "doc-1",
      expect.any(Array),
    );

    const persistedVersions = updateEntryVersions.mock
      .calls[0]?.[2] as PromptVersionEntry[];
    expect(persistedVersions).toHaveLength(1);
    expect(persistedVersions[0]?.versionId).toBe("v-seed");
    expect(persistedVersions[0]?.prompt).toBe(generation.prompt);
    expect(persistedVersions[0]?.generations).toEqual([generation]);
  });
});
