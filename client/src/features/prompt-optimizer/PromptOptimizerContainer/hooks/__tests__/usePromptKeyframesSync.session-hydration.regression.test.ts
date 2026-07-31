import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePromptKeyframesSync } from "../usePromptKeyframesSync";

type HookParams = Parameters<typeof usePromptKeyframesSync>[0] & {
  isLoadingHistory?: boolean;
};

describe("regression: session keyframes survive history hydration", () => {
  it("does not overwrite loaded keyframes from stale history while history is still loading", async () => {
    const setKeyframes = vi.fn();
    const setStartFrame = vi.fn();
    const clearEndFrame = vi.fn();
    const clearVideoReferences = vi.fn();
    const clearExtendVideo = vi.fn();
    const updateEntryPersisted = vi.fn();

    const loadedKeyframes = [
      {
        id: "kf-1",
        url: "https://cdn.example.com/keyframe-1.png",
        source: "upload" as const,
      },
    ];

    const hookParams: HookParams = {
      keyframes: loadedKeyframes,
      startFrame: null,
      setKeyframes,
      setStartFrame,
      clearEndFrame,
      clearVideoReferences,
      clearExtendVideo,
      currentPromptUuid: "uuid-1",
      currentPromptDocId: "session_123",
      promptHistory: {
        history: [
          {
            id: "session_123",
            uuid: "uuid-1",
            keyframes: [],
          } as unknown as HookParams["promptHistory"]["history"][number],
        ],
        updateEntryPersisted,
      },
      isLoadingHistory: true,
    };

    renderHook(() =>
      usePromptKeyframesSync(
        hookParams as unknown as Parameters<typeof usePromptKeyframesSync>[0],
      ),
    );

    expect(setKeyframes).not.toHaveBeenCalledWith([]);
    expect(updateEntryPersisted).not.toHaveBeenCalled();
    expect(clearEndFrame).not.toHaveBeenCalled();
    expect(clearVideoReferences).not.toHaveBeenCalled();
    expect(clearExtendVideo).not.toHaveBeenCalled();
    expect(setStartFrame).not.toHaveBeenCalled();
  });
});
