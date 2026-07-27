/**
 * Regression: browsing takes must not destroy the creator's undo history.
 *
 * Every take tile's onClick routes to handleSelectVersion, which used to call
 * resetEditStacks() — emptying both the undo and redo stacks. That violates
 * CLAUDE.md UX rule 1 ("Browsing is read-only... If clicking something can lose
 * the user's work, the design is wrong") and CONTEXT.md's Take ("Nothing is
 * displaced or lost by moving between takes").
 *
 * The real useHighlightState is composed in rather than a spy, so the assertion
 * is on the stacks themselves, not on a call count.
 */

import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  PromptHistoryEntry,
  PromptVersionEntry,
} from "@features/prompt-optimizer/types/domain/prompt-session";
import { useHighlightState } from "@features/prompt-optimizer/context/hooks/useHighlightState";
import type { StateSnapshot } from "@features/prompt-optimizer/context/types";
import { useVersionManagement } from "../useVersionManagement";

vi.mock("../usePromptVersioning", () => ({
  usePromptVersioning: () => ({
    syncVersionHighlights: vi.fn(),
    syncVersionGenerations: vi.fn(),
  }),
}));

const VERSIONS: PromptVersionEntry[] = [
  {
    versionId: "v-1",
    signature: "sig-1",
    prompt: "a wide shot of a lighthouse",
    timestamp: new Date(1000).toISOString(),
  },
  {
    versionId: "v-2",
    signature: "sig-2",
    prompt: "a slow push-in on a lighthouse",
    timestamp: new Date(2000).toISOString(),
  },
];

const snapshot = (text: string): StateSnapshot => ({
  text,
  highlight: null,
  timestamp: Date.now(),
  version: 1,
});

const setup = () => {
  const setDisplayedPromptSilently = vi.fn();
  const setOptimizedPrompt = vi.fn();

  const historyEntry: PromptHistoryEntry = {
    id: "doc-1",
    uuid: "uuid-1",
    input: "input",
    output: "output",
    versions: VERSIONS,
  };

  const hook = renderHook(() => {
    const highlightState = useHighlightState();
    const versioning = useVersionManagement({
      hasShotContext: false,
      shotId: null,
      shotPromptEntry: null,
      updateShotVersions: vi.fn(),
      promptHistory: {
        history: [historyEntry],
        createDraft: vi.fn(() => ({ uuid: "uuid-1", id: "doc-1" })),
        updateEntryVersions: vi.fn(),
      },
      currentPromptUuid: "uuid-1",
      currentPromptDocId: "doc-1",
      setCurrentPromptUuid: vi.fn(),
      setCurrentPromptDocId: vi.fn(),
      activeVersionId: "v-1",
      setActiveVersionId: vi.fn(),
      inputPrompt: "a wide shot of a lighthouse",
      normalizedDisplayedPrompt: "a wide shot of a lighthouse",
      selectedMode: "video",
      selectedModel: "wan-2.2",
      generationParams: {},
      serializedKeyframes: [],
      promptOptimizer: { setOptimizedPrompt },
      applyInitialHighlightSnapshot:
        highlightState.applyInitialHighlightSnapshot,
      resetEditStacks: highlightState.resetEditStacks,
      setDisplayedPromptSilently,
      latestHighlightRef: highlightState.latestHighlightRef,
      versionEditCountRef: { current: 0 },
      versionEditsRef: { current: [] },
      resetVersionEdits: vi.fn(),
      effectiveAspectRatio: null,
    });
    return { highlightState, versioning };
  });

  return { hook, setDisplayedPromptSilently, setOptimizedPrompt };
};

describe("useVersionManagement take browsing (regression)", () => {
  it("preserves undo and redo when a take is selected", () => {
    const { hook } = setup();

    act(() => {
      hook.result.current.highlightState.undoStackRef.current.push(
        snapshot("an earlier draft"),
      );
      hook.result.current.highlightState.redoStackRef.current.push(
        snapshot("a later draft"),
      );
    });

    act(() => {
      hook.result.current.versioning.handleSelectVersion("v-2");
    });

    expect(hook.result.current.highlightState.undoStackRef.current).toEqual([
      expect.objectContaining({ text: "an earlier draft" }),
    ]);
    expect(hook.result.current.highlightState.redoStackRef.current).toEqual([
      expect.objectContaining({ text: "a later draft" }),
    ]);
  });

  it("still restores the selected take's words into the editor", () => {
    const { hook, setDisplayedPromptSilently, setOptimizedPrompt } = setup();

    act(() => {
      hook.result.current.versioning.handleSelectVersion("v-2");
    });

    expect(setDisplayedPromptSilently).toHaveBeenCalledWith(
      "a slow push-in on a lighthouse",
    );
    expect(setOptimizedPrompt).toHaveBeenCalledWith(
      "a slow push-in on a lighthouse",
    );
  });
});
