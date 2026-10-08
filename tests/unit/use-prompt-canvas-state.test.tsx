import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { usePromptCanvasState } from "@features/prompt-optimizer/PromptCanvas/hooks/usePromptCanvasState";

describe("usePromptCanvasState", () => {
  it("initializes with expected defaults", () => {
    const { result } = renderHook(() => usePromptCanvasState());

    expect(result.current.state.showHighlights).toBe(true);
  });

  it("merges state updates", () => {
    const { result } = renderHook(() => usePromptCanvasState());

    act(() => {
      result.current.setState({ showHighlights: false, hoveredSpanId: "span-1" });
    });

    expect(result.current.state.showHighlights).toBe(false);
    expect(result.current.state.hoveredSpanId).toBe("span-1");
  });

});
