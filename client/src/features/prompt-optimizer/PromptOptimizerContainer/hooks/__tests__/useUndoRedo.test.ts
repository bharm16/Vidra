import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HighlightSnapshot } from "@features/prompt-optimizer/context/types";
import { useUndoRedo } from "../useUndoRedo";

type SetupResult = ReturnType<
  typeof renderHook<unknown, ReturnType<typeof useUndoRedo>>
>;

function setup(initialText = "initial") {
  const setCanUndo = vi.fn();
  const setCanRedo = vi.fn();
  const applyInitialHighlightSnapshot = vi.fn();
  const onEdit = vi.fn();

  const undoStackRef = {
    current: [] as Array<{
      text: string;
      highlight: HighlightSnapshot | null;
      timestamp: number;
      version: number;
    }>,
  };
  const redoStackRef = {
    current: [] as Array<{
      text: string;
      highlight: HighlightSnapshot | null;
      timestamp: number;
      version: number;
    }>,
  };
  const latestHighlightRef = { current: null as HighlightSnapshot | null };
  const isApplyingHistoryRef = { current: false };

  const promptOptimizer = {
    displayedPrompt: initialText,
    setDisplayedPrompt: vi.fn((text: string) => {
      promptOptimizer.displayedPrompt = text;
    }),
    setOptimizedPrompt: vi.fn(),
    setPreviewPrompt: vi.fn(),
    setPreviewAspectRatio: vi.fn(),
  };

  const hook = renderHook(() =>
    useUndoRedo({
      promptOptimizer,
      setDisplayedPromptSilently: promptOptimizer.setDisplayedPrompt,
      applyInitialHighlightSnapshot,
      onEdit,
      undoStackRef,
      redoStackRef,
      latestHighlightRef,
      isApplyingHistoryRef,
      setCanUndo,
      setCanRedo,
    }),
  );

  return {
    hook,
    promptOptimizer,
    setCanUndo,
    setCanRedo,
    applyInitialHighlightSnapshot,
    onEdit,
    undoStackRef,
    redoStackRef,
    latestHighlightRef,
    isApplyingHistoryRef,
  };
}

describe("useUndoRedo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("groups quick same-direction edits into one undo point", () => {
    const { hook, undoStackRef, promptOptimizer } = setup("base");

    act(() => {
      hook.result.current.handleDisplayedPromptChange("base a", 6);
      hook.rerender();
      hook.result.current.handleDisplayedPromptChange("base ab", 7);
      hook.rerender();
    });

    expect(undoStackRef.current).toHaveLength(1);
    expect(undoStackRef.current[0]?.text).toBe("base");
    expect(promptOptimizer.setDisplayedPrompt).toHaveBeenCalledTimes(2);
  });

  it("creates a new undo point when switching from adding to deleting", () => {
    const { hook, undoStackRef } = setup("hello");

    act(() => {
      hook.result.current.handleDisplayedPromptChange("hello!", 6);
      hook.rerender();
      hook.result.current.handleDisplayedPromptChange("hello", 5);
      hook.rerender();
    });

    expect(undoStackRef.current).toHaveLength(2);
  });

  it("creates a new undo point for significant text-length changes", () => {
    const { hook, undoStackRef } = setup("short");

    act(() => {
      hook.result.current.handleDisplayedPromptChange("short text", 10);
      hook.rerender();
      hook.result.current.handleDisplayedPromptChange("x".repeat(80), 80);
      hook.rerender();
    });

    expect(undoStackRef.current).toHaveLength(2);
  });

  it("supports undo and redo transitions", () => {
    const {
      hook,
      promptOptimizer,
      undoStackRef,
      redoStackRef,
      applyInitialHighlightSnapshot,
    } = setup("seed");

    act(() => {
      hook.result.current.handleDisplayedPromptChange("seed one", 8);
      hook.rerender();
      hook.result.current.handleDisplayedPromptChange("seed one two", 12);
      hook.rerender();
    });

    expect(undoStackRef.current.length).toBeGreaterThan(0);

    act(() => {
      hook.result.current.handleUndo();
      vi.runAllTimers();
      hook.rerender();
    });

    expect(promptOptimizer.setOptimizedPrompt).toHaveBeenCalled();
    expect(applyInitialHighlightSnapshot).toHaveBeenCalled();
    expect(redoStackRef.current.length).toBeGreaterThan(0);

    act(() => {
      hook.result.current.handleRedo();
      vi.runAllTimers();
      hook.rerender();
    });

    expect(promptOptimizer.setOptimizedPrompt).toHaveBeenCalledTimes(2);
  });

  it("clears redo stack when a new edit diverges after undo", () => {
    const { hook, redoStackRef } = setup("start");

    act(() => {
      hook.result.current.handleDisplayedPromptChange("start one", 9);
      hook.rerender();
      hook.result.current.handleDisplayedPromptChange("start two", 9);
      hook.rerender();
      hook.result.current.handleUndo();
      vi.runAllTimers();
      hook.rerender();
    });

    expect(redoStackRef.current.length).toBeGreaterThan(0);

    act(() => {
      hook.result.current.handleDisplayedPromptChange("branch", 6);
      hook.rerender();
    });

    expect(redoStackRef.current).toHaveLength(0);
  });

  it("does not push history while applying history state", () => {
    const { hook, undoStackRef, isApplyingHistoryRef, promptOptimizer } =
      setup("raw");
    isApplyingHistoryRef.current = true;

    act(() => {
      hook.result.current.handleDisplayedPromptChange("raw updated", 11);
      hook.rerender();
    });

    expect(undoStackRef.current).toHaveLength(0);
    expect(promptOptimizer.setDisplayedPrompt).toHaveBeenCalledWith(
      "raw updated",
    );
  });

  it("cleans up pending timers on unmount", () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const { hook } = setup("alpha");

    act(() => {
      hook.result.current.handleDisplayedPromptChange("alpha 1", 7);
      hook.rerender();
      hook.result.current.handleUndo();
    });

    hook.unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});
