import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePromptOptimization } from "../usePromptOptimization";

const buildBaseParams = () => {
  const optimize = vi.fn(async () => ({
    optimized: "Optimized sequence prompt",
    score: 92,
  }));
  const compile = vi.fn(async () => ({
    optimized: "Compiled prompt",
    score: 90,
  }));
  const setInputPrompt = vi.fn();
  const setCurrentPromptUuid = vi.fn();
  const setCurrentPromptDocId = vi.fn();
  const setDisplayedPromptSilently = vi.fn();
  const setShowResults = vi.fn();
  const applyInitialHighlightSnapshot = vi.fn();
  const resetEditStacks = vi.fn();
  const navigate = vi.fn();
  const saveToHistory = vi.fn(async () => ({
    uuid: "uuid-1",
    id: "session-1",
  }));
  const updateEntryVersions = vi.fn();

  return {
    params: {
      promptOptimizer: {
        inputPrompt: "Original shot prompt",
        genericOptimizedPrompt: null,
        improvementContext: null,
        qualityScore: null,
        optimize,
        compile,
        setInputPrompt,
      },
      promptHistory: {
        history: [],
        updateEntryVersions,
        saveToHistory,
      },
      promptContext: null,
      selectedMode: "video",
      selectedModel: "sora",
      generationParams: {},
      keyframes: null,
      currentPromptUuid: "uuid-current",
      setCurrentPromptUuid,
      setCurrentPromptDocId,
      setDisplayedPromptSilently,
      setShowResults,
      applyInitialHighlightSnapshot,
      resetEditStacks,
      persistedSignatureRef: { current: null as string | null },
      skipLoadFromUrlRef: { current: false },
      navigate,
    },
    mocks: {
      optimize,
      setInputPrompt,
      saveToHistory,
      setCurrentPromptUuid,
      setCurrentPromptDocId,
      setDisplayedPromptSilently,
      setShowResults,
      navigate,
    },
  };
};

describe("usePromptOptimization", () => {
  it("persists and navigates by default", async () => {
    const { params, mocks } = buildBaseParams();
    const { result } = renderHook(() => usePromptOptimization(params));

    await act(async () => {
      await result.current.handleOptimize("Original shot prompt");
    });

    expect(mocks.saveToHistory).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith("/session/session-1", {
      replace: true,
    });
  });

  it("keeps sequence optimization in-place when preserveSessionView is enabled", async () => {
    const { params, mocks } = buildBaseParams();
    const { result } = renderHook(() => usePromptOptimization(params));

    await act(async () => {
      await result.current.handleOptimize("Original shot prompt", undefined, {
        preserveSessionView: true,
      });
    });

    expect(mocks.setInputPrompt).toHaveBeenCalledWith(
      "Optimized sequence prompt",
    );
    expect(mocks.setDisplayedPromptSilently).toHaveBeenCalledWith("");
    expect(mocks.setShowResults).toHaveBeenCalledWith(false);
    expect(mocks.saveToHistory).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.setCurrentPromptUuid).not.toHaveBeenCalled();
    expect(mocks.setCurrentPromptDocId).not.toHaveBeenCalled();
  });

  // The Idea Box expansion chain (expand -> first frame -> gate) hangs off
  // onOptimizationApplied: the workspace's continueAfterOptimization only
  // runs when this hook awaits the callback with the optimized text.
  describe("onOptimizationApplied contract", () => {
    it("awaits the callback with the optimized text after persistence", async () => {
      const { params, mocks } = buildBaseParams();
      const callOrder: string[] = [];
      mocks.saveToHistory.mockImplementation(async () => {
        callOrder.push("saveToHistory");
        return { uuid: "uuid-1", id: "session-1" };
      });
      const onOptimizationApplied = vi.fn(async () => {
        callOrder.push("onOptimizationApplied");
      });
      const { result } = renderHook(() =>
        usePromptOptimization({ ...params, onOptimizationApplied }),
      );

      await act(async () => {
        await result.current.handleOptimize("Original shot prompt");
      });

      expect(onOptimizationApplied).toHaveBeenCalledWith(
        "Optimized sequence prompt",
      );
      expect(callOrder).toEqual(["saveToHistory", "onOptimizationApplied"]);
    });

    it("invokes the callback on the preserveSessionView path", async () => {
      const { params } = buildBaseParams();
      const onOptimizationApplied = vi.fn();
      const { result } = renderHook(() =>
        usePromptOptimization({ ...params, onOptimizationApplied }),
      );

      await act(async () => {
        await result.current.handleOptimize("Original shot prompt", undefined, {
          preserveSessionView: true,
        });
      });

      expect(onOptimizationApplied).toHaveBeenCalledWith(
        "Optimized sequence prompt",
      );
    });

    it("does not invoke the callback on the I2V bypass (start image set)", async () => {
      const { params, mocks } = buildBaseParams();
      const onOptimizationApplied = vi.fn();
      const { result } = renderHook(() =>
        usePromptOptimization({
          ...params,
          startImageUrl: "https://example.com/frame.png",
          onOptimizationApplied,
        }),
      );

      await act(async () => {
        await result.current.handleOptimize("Original shot prompt");
      });

      expect(mocks.optimize).not.toHaveBeenCalled();
      expect(onOptimizationApplied).not.toHaveBeenCalled();
    });

    it("does not invoke the callback when optimization returns null", async () => {
      const { params, mocks } = buildBaseParams();
      mocks.optimize.mockResolvedValueOnce(
        null as unknown as Awaited<ReturnType<typeof mocks.optimize>>,
      );
      const onOptimizationApplied = vi.fn();
      const { result } = renderHook(() =>
        usePromptOptimization({ ...params, onOptimizationApplied }),
      );

      await act(async () => {
        await result.current.handleOptimize("Original shot prompt");
      });

      expect(mocks.saveToHistory).not.toHaveBeenCalled();
      expect(onOptimizationApplied).not.toHaveBeenCalled();
    });
  });
});
