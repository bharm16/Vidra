import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useUndoRedo } from "@/features/prompt-optimizer/PromptOptimizerContainer/hooks/useUndoRedo";
import type {
  HighlightSnapshot,
  StateSnapshot,
} from "@features/prompt-optimizer/context/types";
import { cameraMotionDirection } from "@shared/cameraMotion";
import { writeCameraDirection } from "../utils/cameraDirection";

/**
 * ADR-0022 D7 / UX rule 1: a camera choice is a deliberate edit to the
 * creator's words, so undo must bring the previous words back. The write
 * rides onComposerFill, which is `setInputPrompt` + the editor's real change
 * path (`handleDisplayedPromptChange`) — this exercises that second half, the
 * one that makes the edit recoverable. A write routed through the silent
 * history-application setter instead would pass every other test and lose the
 * creator's words for good.
 */

const ORIGINAL = "A clockmaker adjusts a brass clock in a dim workshop.";

function setup() {
  const undoStackRef = { current: [] as StateSnapshot[] };
  const redoStackRef = { current: [] as StateSnapshot[] };
  const latestHighlightRef = { current: null as HighlightSnapshot | null };
  const isApplyingHistoryRef = { current: false };

  let displayedPrompt = ORIGINAL;
  const setDisplayedPromptSilently = vi.fn((text: string) => {
    displayedPrompt = text;
  });

  const hook = renderHook(() =>
    useUndoRedo({
      promptOptimizer: {
        get displayedPrompt() {
          return displayedPrompt;
        },
        setDisplayedPrompt: (text: string) => {
          displayedPrompt = text;
        },
        setOptimizedPrompt: vi.fn(),
      },
      setDisplayedPromptSilently,
      applyInitialHighlightSnapshot: vi.fn(),
      undoStackRef,
      redoStackRef,
      latestHighlightRef,
      isApplyingHistoryRef,
      setCanUndo: vi.fn(),
      setCanRedo: vi.fn(),
    }),
  );

  return {
    hook,
    currentPrompt: (): string => displayedPrompt,
    setDisplayedPromptSilently,
  };
}

describe("regression: a camera choice is an undoable edit", () => {
  it("restores the prior words when the creator undoes the camera direction", () => {
    const { hook, currentPrompt, setDisplayedPromptSilently } = setup();

    const direction = cameraMotionDirection("push_in");
    if (!direction) throw new Error("expected a direction for push_in");

    const write = writeCameraDirection({ prompt: ORIGINAL, direction });
    if (write.outcome !== "written") throw new Error("expected a write");

    act(() => {
      hook.result.current.handleDisplayedPromptChange(write.prompt);
    });
    expect(currentPrompt()).toBe(`${ORIGINAL} ${direction}`);

    act(() => {
      hook.result.current.handleUndo();
    });

    expect(setDisplayedPromptSilently).toHaveBeenCalledWith(ORIGINAL);
    expect(currentPrompt()).toBe(ORIGINAL);
  });

  it("restores the previous camera direction, not the bare words, after a swap", () => {
    // Two trips through the picker are separate edits, not one burst of
    // typing: hold the clock apart so the hook's edit grouping treats them
    // the way a creator's two visits actually arrive.
    vi.useFakeTimers();
    const { hook, currentPrompt } = setup();

    const panLeft = cameraMotionDirection("pan_left");
    const pushIn = cameraMotionDirection("push_in");
    if (!panLeft || !pushIn) throw new Error("expected directions");

    const first = writeCameraDirection({
      prompt: ORIGINAL,
      direction: panLeft,
    });
    if (first.outcome !== "written") throw new Error("expected a write");
    act(() => {
      hook.result.current.handleDisplayedPromptChange(first.prompt);
    });

    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    const second = writeCameraDirection({
      prompt: first.prompt,
      direction: pushIn,
      previousDirection: panLeft,
    });
    if (second.outcome !== "written") throw new Error("expected a write");
    act(() => {
      hook.result.current.handleDisplayedPromptChange(second.prompt);
    });

    expect(currentPrompt()).toBe(`${ORIGINAL} ${pushIn}`);

    act(() => {
      hook.result.current.handleUndo();
    });

    expect(currentPrompt()).toBe(`${ORIGINAL} ${panLeft}`);

    vi.useRealTimers();
  });
});
