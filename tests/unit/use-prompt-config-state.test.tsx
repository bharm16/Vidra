import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GenerationControlsStoreProvider } from "@features/generation-controls/context/GenerationControlsStore";
import { usePromptConfigState } from "@features/prompt-optimizer/context/hooks/usePromptConfigState";
import {
  persistGenerationParams,
  persistSelectedModel,
} from "@features/prompt-optimizer/context/promptStateStorage";

const GENERATION_PARAMS_KEY = "prompt-optimizer:generationParams";

describe("usePromptConfigState", () => {
  const originalGetItem = localStorage.getItem;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <GenerationControlsStoreProvider>
      {children}
    </GenerationControlsStoreProvider>
  );

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.getItem = originalGetItem;
  });

  describe("error handling", () => {
    it("falls back to defaults when localStorage access fails", () => {
      localStorage.getItem = vi.fn(() => {
        throw new Error("Storage failure");
      });

      const { result } = renderHook(() => usePromptConfigState(), { wrapper });

      expect(result.current.selectedModel).toBe("");
      expect(result.current.generationParams).toEqual({});
    });

    it("ignores invalid generation params JSON", () => {
      localStorage.setItem(GENERATION_PARAMS_KEY, "{not-json");

      const { result } = renderHook(() => usePromptConfigState(), { wrapper });

      expect(result.current.generationParams).toEqual({});
    });
  });

  describe("edge cases", () => {
    it("hydrates model and params from persisted storage", () => {
      persistSelectedModel("model-a");
      persistGenerationParams({ steps: 12 });

      const { result } = renderHook(() => usePromptConfigState(), { wrapper });

      expect(result.current.selectedModel).toBe("model-a");
      expect(result.current.generationParams).toEqual({ steps: 12 });
    });
  });
});
