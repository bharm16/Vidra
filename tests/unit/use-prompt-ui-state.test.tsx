import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { usePromptUiState } from "@features/prompt-optimizer/context/hooks/usePromptUiState";

describe("usePromptUiState", () => {
  describe("error handling", () => {
    it("defaults visibility toggles to false", () => {
      const { result } = renderHook(() => usePromptUiState());

      expect(result.current.showResults).toBe(false);
      expect(result.current.showSettings).toBe(false);
      expect(result.current.showShortcuts).toBe(false);
      expect(result.current.showImprover).toBe(false);
      expect(result.current.showBrainstorm).toBe(false);
    });

    it("defaults output status and AI index to safe values", () => {
      const { result } = renderHook(() => usePromptUiState());

      expect(result.current.outputSaveState).toBe("idle");
      expect(result.current.outputLastSavedAt).toBeNull();
      expect(result.current.currentAIIndex).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("supports error output state without losing the timestamp", () => {
      const { result } = renderHook(() => usePromptUiState());

      act(() => {
        result.current.setOutputLastSavedAt(1700000000000);
        result.current.setOutputSaveState("error");
      });

      expect(result.current.outputSaveState).toBe("error");
      expect(result.current.outputLastSavedAt).toBe(1700000000000);
    });
  });

  describe("core behavior", () => {
    it("updates UI toggles and indices via setters", () => {
      const { result } = renderHook(() => usePromptUiState());

      act(() => {
        result.current.setShowResults(true);
        result.current.setCurrentAIIndex(2);
      });

      expect(result.current.showResults).toBe(true);
      expect(result.current.currentAIIndex).toBe(2);
    });
  });
});
