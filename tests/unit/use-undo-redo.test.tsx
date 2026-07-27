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

import { useUndoRedo } from "@features/prompt-optimizer/PromptOptimizerContainer/hooks/useUndoRedo";
import type {
  HighlightSnapshot,
  StateSnapshot,
} from "@features/prompt-optimizer/context/types";

vi.mock("@config/performance.config", () => ({
  PERFORMANCE_CONFIG: {
    UNDO_STACK_SIZE: 3,
    REF_RESET_DELAY_MS: 0,
  },
  default: {
    UNDO_STACK_SIZE: 3,
    REF_RESET_DELAY_MS: 0,
  },
}));

type UseUndoRedoParams = Parameters<typeof useUndoRedo>[0];

type PromptOptimizer = UseUndoRedoParams["promptOptimizer"];

type ApplyInitialHighlightSnapshot =
  UseUndoRedoParams["applyInitialHighlightSnapshot"];

type SetCanUndo = UseUndoRedoParams["setCanUndo"];
type SetCanRedo = UseUndoRedoParams["setCanRedo"];

type OnEdit = NonNullable<UseUndoRedoParams["onEdit"]>;

type SetDisplayedPromptSilently =
  UseUndoRedoParams["setDisplayedPromptSilently"];

const createPromptOptimizer = (initialPrompt: string): PromptOptimizer => {
  const optimizer = {
    displayedPrompt: initialPrompt,
    setDisplayedPrompt: vi.fn(),
    setOptimizedPrompt: vi.fn(),
    setPreviewPrompt: vi.fn(),
    setPreviewAspectRatio: vi.fn(),
  } satisfies PromptOptimizer;

  optimizer.setDisplayedPrompt = vi.fn((text: string) => {
    optimizer.displayedPrompt = text;
  });

  return optimizer;
};

const createDefaults = (
  overrides: Partial<UseUndoRedoParams> = {},
): UseUndoRedoParams => {
  const setDisplayedPromptSilently: MockedFunction<SetDisplayedPromptSilently> =
    vi.fn();
  const applyInitialHighlightSnapshot: MockedFunction<ApplyInitialHighlightSnapshot> =
    vi.fn();
  const setCanUndo: MockedFunction<SetCanUndo> = vi.fn();
  const setCanRedo: MockedFunction<SetCanRedo> = vi.fn();

  const undoStackRef: MutableRefObject<StateSnapshot[]> = { current: [] };
  const redoStackRef: MutableRefObject<StateSnapshot[]> = { current: [] };
  const latestHighlightRef: MutableRefObject<HighlightSnapshot | null> = {
    current: null,
  };
  const isApplyingHistoryRef: MutableRefObject<boolean> = { current: false };

  return {
    promptOptimizer: createPromptOptimizer(""),
    setDisplayedPromptSilently,
    applyInitialHighlightSnapshot,
    undoStackRef,
    redoStackRef,
    latestHighlightRef,
    isApplyingHistoryRef,
    setCanUndo,
    setCanRedo,
    ...overrides,
  };
};

describe("useUndoRedo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates undo points when the prompt changes", () => {
    const promptOptimizer = createPromptOptimizer("Hello");
    const setDisplayedPromptSilently: MockedFunction<SetDisplayedPromptSilently> =
      vi.fn();
    const onEdit: MockedFunction<OnEdit> = vi.fn();

    const params = createDefaults({
      promptOptimizer,
      setDisplayedPromptSilently,
      onEdit,
    });

    const { result } = renderHook(() => useUndoRedo(params));

    act(() => {
      result.current.handleDisplayedPromptChange("Hello world", 5);
    });

    expect(params.undoStackRef.current).toHaveLength(1);
    expect(params.undoStackRef.current[0]?.text).toBe("Hello");
    expect(params.redoStackRef.current).toHaveLength(0);
    expect(promptOptimizer.setDisplayedPrompt).toHaveBeenCalledWith(
      "Hello world",
    );
    expect(params.setCanUndo).toHaveBeenCalledWith(true);
    expect(params.setCanRedo).toHaveBeenCalledWith(false);
    expect(onEdit).toHaveBeenCalled();
  });

  it("undoes and redoes with highlight snapshots", () => {
    const promptOptimizer = createPromptOptimizer("second");

    const setDisplayedPromptSilently: MockedFunction<SetDisplayedPromptSilently> =
      vi.fn((text: string) => {
        promptOptimizer.displayedPrompt = text;
      });
    const applyInitialHighlightSnapshot: MockedFunction<ApplyInitialHighlightSnapshot> =
      vi.fn();

    const undoSnapshot: StateSnapshot = {
      text: "first",
      highlight: { spans: [], signature: "sig-undo" },
      timestamp: 1,
      version: 0,
    };

    const latestHighlight: HighlightSnapshot = {
      spans: [],
      signature: "sig-current",
    };

    const params = createDefaults({
      promptOptimizer,
      setDisplayedPromptSilently,
      applyInitialHighlightSnapshot,
      undoStackRef: { current: [undoSnapshot] },
      redoStackRef: { current: [] },
      latestHighlightRef: { current: latestHighlight },
      isApplyingHistoryRef: { current: false },
    });

    const { result } = renderHook(() => useUndoRedo(params));

    act(() => {
      result.current.handleUndo();
    });

    vi.runAllTimers();

    expect(setDisplayedPromptSilently).toHaveBeenCalledWith("first");
    expect(promptOptimizer.setOptimizedPrompt).toHaveBeenCalledWith("first");
    expect(applyInitialHighlightSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ signature: "sig-undo" }),
      { bumpVersion: true, markPersisted: false },
    );
    expect(params.redoStackRef.current[0]?.text).toBe("second");

    act(() => {
      result.current.handleRedo();
    });

    vi.runAllTimers();

    expect(setDisplayedPromptSilently).toHaveBeenCalledWith("second");
    expect(promptOptimizer.setOptimizedPrompt).toHaveBeenCalledWith("second");
    expect(applyInitialHighlightSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ signature: "sig-current" }),
      { bumpVersion: true, markPersisted: false },
    );
  });
});
