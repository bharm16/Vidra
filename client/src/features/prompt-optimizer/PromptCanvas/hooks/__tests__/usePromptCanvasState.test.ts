import { describe, expect, it } from "vitest";
import {
  initialPromptCanvasState,
  promptCanvasReducer,
} from "../usePromptCanvasState";

describe("usePromptCanvasState reducer", () => {
  it("exposes expected initial state", () => {
    expect(initialPromptCanvasState).toMatchObject({
      showHighlights: true,
      selectedSpanId: null,
      promptState: "generated",
    });
  });

  it("MERGE_STATE returns same reference when payload does not change values", () => {
    const state = initialPromptCanvasState;
    const next = promptCanvasReducer(state, {
      type: "MERGE_STATE",
      payload: { showHighlights: true, promptState: "generated" },
    });

    expect(next).toBe(state);
  });

  it("MERGE_STATE updates changed fields only", () => {
    const state = initialPromptCanvasState;
    const next = promptCanvasReducer(state, {
      type: "MERGE_STATE",
      payload: { showHighlights: false, selectedSpanId: "span-1" },
    });

    expect(next).toEqual({
      ...state,
      showHighlights: false,
      selectedSpanId: "span-1",
    });
  });

  it("returns unchanged state for unknown actions", () => {
    const state = initialPromptCanvasState;
    const next = promptCanvasReducer(state, {
      type: "UNKNOWN_ACTION",
    } as never);

    expect(next).toBe(state);
  });
});
