/**
 * ADR-0022 D7, "Versions stay honest": changing the camera after a take
 * exists must leave that take's words alone. The take is permanently paired
 * with the words it was made from (CONTEXT.md, "Take"); the new camera
 * direction is a new words-version, never a rewrite of the old one.
 *
 * The real useVersionManagement is composed in — a spy on
 * createVersionIfNeeded would prove the call and miss the point, which is
 * what happens to the version that already carries a take.
 */

import React, { type ReactNode } from "react";
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  PromptHistoryEntry,
  PromptVersionEntry,
} from "@features/prompt-optimizer/types/domain/prompt-session";
import { useHighlightState } from "@features/prompt-optimizer/context/hooks/useHighlightState";
import { createHighlightSignature } from "@/features/span-highlighting";
import {
  GenerationControlsStoreProvider,
  useGenerationControlsStoreActions,
  useGenerationControlsStoreState,
  DEFAULT_GENERATION_CONTROLS_STATE,
} from "@features/generation-controls";
import { cameraMotionDirection, CAMERA_PATHS } from "@shared/cameraMotion";
import type { CameraPath } from "@/features/convergence/types";
import { useVersionManagement } from "../useVersionManagement";

vi.mock("../usePromptVersioning", () => ({
  usePromptVersioning: () => ({
    syncVersionHighlights: vi.fn(),
    syncVersionGenerations: vi.fn(),
  }),
}));

const ORIGINAL_WORDS = "a wide shot of a lighthouse";

/** v1 already carries a take — the words that made it are load-bearing. */
const EXISTING_TAKE = {
  id: "gen-1",
  status: "completed",
  mediaUrl: "https://example.com/frame.png",
};

const VERSION_ONE: PromptVersionEntry = {
  versionId: "v-1",
  label: "v1",
  signature: createHighlightSignature(ORIGINAL_WORDS),
  prompt: ORIGINAL_WORDS,
  timestamp: new Date(1000).toISOString(),
  generations: [EXISTING_TAKE],
} as unknown as PromptVersionEntry;

const setupVersions = (displayedPrompt: string) => {
  const updateEntryVersions = vi.fn();

  const historyEntry: PromptHistoryEntry = {
    id: "doc-1",
    uuid: "uuid-1",
    input: ORIGINAL_WORDS,
    output: displayedPrompt,
    versions: [VERSION_ONE],
  } as unknown as PromptHistoryEntry;

  const hook = renderHook(() => {
    const highlightState = useHighlightState();
    return useVersionManagement({
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
      inputPrompt: ORIGINAL_WORDS,
      normalizedDisplayedPrompt: displayedPrompt,
      selectedMode: "video",
      selectedModel: "wan-2.2",
      generationParams: {},
      serializedKeyframes: [],
      promptOptimizer: { setOptimizedPrompt: vi.fn() },
      applyInitialHighlightSnapshot:
        highlightState.applyInitialHighlightSnapshot,
      setDisplayedPromptSilently: vi.fn(),
      latestHighlightRef: highlightState.latestHighlightRef,
      versionEditCountRef: { current: 0 },
      versionEditsRef: { current: [] },
      resetVersionEdits: vi.fn(),
    });
  });

  return { hook, updateEntryVersions };
};

describe("regression: changing the camera leaves an existing take's words alone", () => {
  it("mints a new words-version and never rewrites the one that carries the take", () => {
    const direction = cameraMotionDirection("push_in");
    if (!direction) throw new Error("expected a direction for push_in");

    // The camera direction lands at the end of the creator's words, exactly
    // as the writer appends it (cameraDirection.test.ts owns that shape).
    const wordsWithCamera = `${ORIGINAL_WORDS} ${direction}`;

    const { hook, updateEntryVersions } = setupVersions(wordsWithCamera);

    let mintedVersionId = "";
    act(() => {
      mintedVersionId = hook.result.current.createVersionIfNeeded();
    });

    expect(mintedVersionId).not.toBe("v-1");

    const [, , versions] = updateEntryVersions.mock.calls.at(-1) ?? [];
    expect(versions).toHaveLength(2);

    const [previous, minted] = versions as PromptVersionEntry[];
    expect(previous?.versionId).toBe("v-1");
    expect(previous?.prompt).toBe(ORIGINAL_WORDS);
    expect(previous?.generations).toEqual([EXISTING_TAKE]);

    expect(minted?.versionId).toBe(mintedVersionId);
    expect(minted?.prompt).toBe(wordsWithCamera);
    expect(minted?.generations).toEqual([]);
  });

  it("selects the existing words-version when the words did not change", () => {
    // Signature-gated: re-choosing the same move writes the same text, and no
    // version is minted for an edit that edited nothing.
    const { hook, updateEntryVersions } = setupVersions(ORIGINAL_WORDS);

    let versionId = "";
    act(() => {
      versionId = hook.result.current.createVersionIfNeeded();
    });

    expect(versionId).toBe("v-1");
    expect(updateEntryVersions).not.toHaveBeenCalled();
  });
});

describe("regression: the armed first frame keeps its take identity", () => {
  it("leaves the start frame untouched when the camera motion changes", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <GenerationControlsStoreProvider
        initialState={{
          ...DEFAULT_GENERATION_CONTROLS_STATE,
          domain: {
            ...DEFAULT_GENERATION_CONTROLS_STATE.domain,
            startFrame: {
              id: "space-animate-gen-1",
              url: "https://example.com/frame.png",
              source: "generation",
              generationId: "gen-1",
            },
          },
        }}
      >
        {children}
      </GenerationControlsStoreProvider>
    );

    const { result } = renderHook(
      () => ({
        state: useGenerationControlsStoreState(),
        actions: useGenerationControlsStoreActions(),
      }),
      { wrapper },
    );

    const armedFrame = result.current.state.domain.startFrame;

    act(() => {
      result.current.actions.setCameraMotion(
        CAMERA_PATHS[7] as unknown as CameraPath,
      );
    });

    expect(result.current.state.domain.cameraMotion?.id).toBe("push_in");
    expect(result.current.state.domain.startFrame).toEqual(armedFrame);
    expect(result.current.state.domain.startFrame?.generationId).toBe("gen-1");
  });
});
