import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useGenerationsState } from "@features/generations/hooks/useGenerationsState";
import type { Generation } from "@features/generations/types";

const createGeneration = (overrides: Partial<Generation> = {}): Generation => ({
  id: "gen-1",
  tier: "draft",
  status: "pending",
  model: "wan-2.2",
  prompt: "Prompt",
  promptVersionId: "version-1",
  createdAt: 1,
  completedAt: null,
  mediaType: "video",
  mediaUrls: [],
  thumbnailUrl: null,
  error: null,
  ...overrides,
});

describe("useGenerationsState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("error handling", () => {
    it("does not overwrite local generations when initial array is empty for the same version", () => {
      const onChange = vi.fn();
      const { result, rerender } = renderHook(
        ({ initialGenerations, promptVersionId }) =>
          useGenerationsState({
            initialGenerations,
            onGenerationsChange: onChange,
            promptVersionId,
          }),
        {
          initialProps: {
            initialGenerations: [],
            promptVersionId: "version-1",
          },
        },
      );

      act(() => {
        result.current.dispatch({
          type: "SET_GENERATIONS",
          payload: [
            ...result.current.generations,
            createGeneration({ id: "local-1", promptVersionId: "version-1" }),
          ],
        });
      });

      rerender({ initialGenerations: [], promptVersionId: "version-1" });

      expect(result.current.generations).toHaveLength(1);
      expect(result.current.generations[0]?.id).toBe("local-1");
    });
  });
});
