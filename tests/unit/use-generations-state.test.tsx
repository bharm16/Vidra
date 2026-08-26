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

  describe("edge cases", () => {
    // ISSUE-12 follow-up: ADD_GENERATION retired; `addGeneration` is the
    // hook's convenience but is not safe to call twice in the same React
    // tick (each call reads a stale generationsRef snapshot). Test setup
    // that wants multiple entries should seed state via SET_GENERATIONS.
    it("updates active generation when the active one is removed", () => {
      const { result } = renderHook(() => useGenerationsState());

      act(() => {
        result.current.dispatch({
          type: "SET_GENERATIONS",
          payload: [
            createGeneration({ id: "gen-1" }),
            createGeneration({ id: "gen-2" }),
          ],
        });
      });

      expect(result.current.activeGenerationId).toBe("gen-2");

      act(() => {
        result.current.removeGeneration("gen-2");
      });

      expect(result.current.activeGenerationId).toBe("gen-1");
    });

    it("preserves the active generation when setting new generations that still include it", () => {
      const { result } = renderHook(() => useGenerationsState());

      act(() => {
        result.current.dispatch({
          type: "SET_GENERATIONS",
          payload: [
            createGeneration({ id: "gen-1" }),
            createGeneration({ id: "gen-2" }),
          ],
        });
        result.current.setActiveGeneration("gen-1");
      });

      act(() => {
        result.current.dispatch({
          type: "SET_GENERATIONS",
          payload: [createGeneration({ id: "gen-1" })],
        });
      });

      expect(result.current.activeGenerationId).toBe("gen-1");
    });
  });

  describe("core behavior", () => {
    it("adds generations and emits changes", () => {
      const onChange = vi.fn();
      const { result } = renderHook(() =>
        useGenerationsState({ onGenerationsChange: onChange }),
      );

      act(() => {
        result.current.dispatch({
          type: "SET_GENERATIONS",
          payload: [
            ...result.current.generations,
            createGeneration({ id: "gen-1", status: "generating" }),
          ],
        });
      });

      expect(result.current.generations).toHaveLength(1);
      expect(result.current.activeGenerationId).toBe("gen-1");
      expect(result.current.isGenerating).toBe(true);
      expect(onChange).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ id: "gen-1" })]),
      );
    });
  });
});
