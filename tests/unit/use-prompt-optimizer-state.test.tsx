import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/services/LoggingService", () => ({
  logger: {
    child: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

import { usePromptOptimizerState } from "@hooks/usePromptOptimizerState";

describe("usePromptOptimizerState", () => {
  it("deduplicates locked spans by id", () => {
    const { result } = renderHook(() => usePromptOptimizerState());

    act(() => {
      result.current.addLockedSpan({
        id: "span-1",
        text: "first",
        category: "subject",
      });
      result.current.addLockedSpan({
        id: "span-1",
        text: "duplicate",
        category: "action",
      });
    });

    expect(result.current.state.lockedSpans).toHaveLength(1);
    expect(result.current.state.lockedSpans[0]?.text).toBe("first");
  });

  it("startOptimization clears output state but preserves locked spans", () => {
    const { result } = renderHook(() => usePromptOptimizerState());

    act(() => {
      result.current.setOptimizedPrompt("optimized");
      result.current.setDisplayedPrompt("displayed");
      result.current.setQualityScore(85);
      result.current.addLockedSpan({
        id: "lock-1",
        text: "locked",
        category: "subject",
      });
    });

    act(() => {
      result.current.startOptimization();
    });

    expect(result.current.state.optimizedPrompt).toBe("");
    expect(result.current.state.displayedPrompt).toBe("");
    expect(result.current.state.qualityScore).toBeNull();
    expect(result.current.state.isProcessing).toBe(true);
    expect(result.current.state.lockedSpans).toHaveLength(1);
  });

  it("restores the rollback snapshot and clears processing", () => {
    const { result } = renderHook(() => usePromptOptimizerState());

    act(() => {
      result.current.setOptimizedPrompt("before");
      result.current.setDisplayedPrompt("before displayed");
      result.current.setQualityScore(70);
      result.current.snapshotForRollback();
      result.current.startOptimization();
      result.current.setOptimizedPrompt("after");
      result.current.setIsProcessing(true);
    });

    act(() => {
      result.current.rollback();
    });

    expect(result.current.state.optimizedPrompt).toBe("before");
    expect(result.current.state.displayedPrompt).toBe("before displayed");
    expect(result.current.state.qualityScore).toBe(70);
    expect(result.current.state.isProcessing).toBe(false);
    expect(result.current.state.rollbackSnapshot).toBeNull();
  });

  it("rollback without a snapshot only clears processing", () => {
    const { result } = renderHook(() => usePromptOptimizerState());

    act(() => {
      result.current.setOptimizedPrompt("kept");
      result.current.setIsProcessing(true);
    });

    act(() => {
      result.current.rollback();
    });

    expect(result.current.state.optimizedPrompt).toBe("kept");
    expect(result.current.state.isProcessing).toBe(false);
  });

  it("reset clears the rollback snapshot", () => {
    const { result } = renderHook(() => usePromptOptimizerState());

    act(() => {
      result.current.setOptimizedPrompt("saved");
      result.current.snapshotForRollback();
    });

    expect(result.current.state.rollbackSnapshot).not.toBeNull();

    act(() => {
      result.current.resetPrompt();
    });

    expect(result.current.state.rollbackSnapshot).toBeNull();
    expect(result.current.state.optimizedPrompt).toBe("");
  });
});
