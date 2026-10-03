import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Generation } from "@features/generations/types";
import type { PromptHistoryEntry } from "@features/prompt-optimizer/types/domain/prompt-session";
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

function renderEmptyHistoryVersioning() {
  const updateEntryVersions = vi.fn();
  const historyEntry: PromptHistoryEntry = {
    id: "doc-1",
    uuid: "uuid-1",
    input: "A cinematic drone shot of a lighthouse in a winter storm at dusk.",
    output: "",
    versions: [],
  };

  const view = renderHook(() =>
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

  return { ...view, updateEntryVersions };
}

describe("usePromptVersioning syncVersionGenerations", () => {
  it("keeps a queued job-backed clip local instead of establishing conflicting take facts", () => {
    const generation = makeGeneration();
    const { result, updateEntryVersions } = renderEmptyHistoryVersioning();

    act(() => {
      result.current.syncVersionGenerations([generation]);
    });

    expect(updateEntryVersions).not.toHaveBeenCalled();
    act(() => {
      result.current.syncVersionGenerations([
        { ...generation, serverJobStatus: undefined },
      ]);
    });
    expect(updateEntryVersions).not.toHaveBeenCalled();

    act(() => {
      result.current.syncVersionGenerations([
        {
          ...generation,
          status: "completed",
          completedAt: 5000,
          jobId: null,
          serverJobStatus: "completed",
          mediaUrls: ["https://example.com/clip.mp4"],
        },
      ]);
    });
    expect(updateEntryVersions).not.toHaveBeenCalled();
  });
  it("still seeds an image version while history has not hydrated", () => {
    const { result, updateEntryVersions } = renderEmptyHistoryVersioning();
    const image = {
      ...makeGeneration(),
      model: "flux-schnell",
      mediaType: "image" as const,
      serverJobStatus: undefined,
    };
    act(() => result.current.syncVersionGenerations([image]));
    expect(updateEntryVersions).toHaveBeenCalledWith("uuid-1", "doc-1", [
      expect.objectContaining({
        versionId: "v-seed",
        prompt: image.prompt,
        generations: [image],
      }),
    ]);
  });
});
