import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useKeyframeWorkflow } from "../useKeyframeWorkflow";

const options = (prompt: string) => ({
  prompt,
  startFrame: null,
  setStartFrame: vi.fn(),
  clearStartFrame: vi.fn(),
  onCreateVersionIfNeeded: () => "v-saved",
  generateRender: vi.fn(),
});

describe("render intent resumption", () => {
  it("uses the captured visible words while the editor is empty during session navigation", () => {
    const params = options("");
    const { result } = renderHook(() => useKeyframeWorkflow(params));
    act(() =>
      result.current.handleRender(
        "google/veo-3",
        undefined,
        "A camera tracks the runner",
      ),
    );
    expect(params.generateRender).toHaveBeenCalledExactlyOnceWith(
      "google/veo-3",
      "A camera tracks the runner",
      expect.objectContaining({ promptVersionId: "v-saved" }),
    );
  });
  it("prefers the live words when the editor has already rehydrated", () => {
    const params = options("The updated visible words");
    const { result } = renderHook(() => useKeyframeWorkflow(params));
    act(() =>
      result.current.handleRender(
        "google/veo-3",
        undefined,
        "The old captured words",
      ),
    );
    expect(params.generateRender).toHaveBeenCalledExactlyOnceWith(
      "google/veo-3",
      "The updated visible words",
      expect.objectContaining({ promptVersionId: "v-saved" }),
    );
  });
});
