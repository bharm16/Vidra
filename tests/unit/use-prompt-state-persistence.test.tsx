import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import { usePromptStatePersistence } from "@features/prompt-optimizer/context/hooks/usePromptStatePersistence";

const SELECTED_MODE_KEY = "prompt-optimizer:selectedMode";

describe("usePromptStatePersistence", () => {
  const originalSetItem = localStorage.setItem;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.setItem = originalSetItem;
  });

  describe("error handling", () => {
    it("avoids throwing when storage write fails", () => {
      localStorage.setItem = vi.fn((key: string) => {
        if (key === SELECTED_MODE_KEY) {
          throw new Error("Write failure");
        }
      }) as typeof localStorage.setItem;

      expect(() =>
        renderHook(() =>
          usePromptStatePersistence({
            selectedMode: "video",
          }),
        ),
      ).not.toThrow();

      expect(localStorage.getItem(SELECTED_MODE_KEY)).toBeNull();
    });
  });

  describe("core behavior", () => {
    it("updates persisted state when inputs change", () => {
      const { rerender } = renderHook(
        ({ selectedMode }) => usePromptStatePersistence({ selectedMode }),
        {
          initialProps: { selectedMode: "video" },
        },
      );

      expect(localStorage.getItem(SELECTED_MODE_KEY)).toBe("video");

      rerender({ selectedMode: "image" });

      expect(localStorage.getItem(SELECTED_MODE_KEY)).toBe("image");
    });
  });
});
