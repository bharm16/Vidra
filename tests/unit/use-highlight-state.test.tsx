import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useHighlightState } from "@features/prompt-optimizer/context/hooks/useHighlightState";
import type { HighlightSnapshot } from "@features/prompt-optimizer/PromptCanvas/types";

const createSnapshot = (signature: string): HighlightSnapshot => ({
  spans: [
    {
      start: 0,
      end: 5,
      category: "subject",
      confidence: 0.9,
    },
  ],
  signature,
});

describe("useHighlightState", () => {
  describe("error handling", () => {
    it("clears highlight state when applying a null snapshot", () => {
      const { result } = renderHook(() => useHighlightState());

      act(() => {
        result.current.applyInitialHighlightSnapshot(createSnapshot("sig-1"));
      });

      act(() => {
        result.current.applyInitialHighlightSnapshot(null);
      });

      expect(result.current.initialHighlights).toBeNull();
      expect(result.current.latestHighlightRef.current).toBeNull();
    });

    it("resets undo/redo stacks and flags to safe defaults", () => {
      const { result } = renderHook(() => useHighlightState());

      act(() => {
        result.current.undoStackRef.current = [
          { text: "A", highlight: null, timestamp: 1, version: 1 },
        ];
        result.current.redoStackRef.current = [
          { text: "B", highlight: null, timestamp: 2, version: 2 },
        ];
        result.current.setCanUndo(true);
        result.current.setCanRedo(true);
      });

      act(() => {
        result.current.resetEditStacks();
      });

      expect(result.current.undoStackRef.current).toHaveLength(0);
      expect(result.current.redoStackRef.current).toHaveLength(0);
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
    });

    it("clears persisted signature when marking a null snapshot", () => {
      const { result } = renderHook(() => useHighlightState());

      act(() => {
        result.current.persistedSignatureRef.current = "old-signature";
        result.current.applyInitialHighlightSnapshot(null, {
          markPersisted: true,
        });
      });

      expect(result.current.persistedSignatureRef.current).toBeNull();
    });
  });

  describe("core behavior", () => {
    it("applies snapshots and persists signatures when configured", () => {
      const { result } = renderHook(() => useHighlightState());
      const snapshot = createSnapshot("sig-4");

      act(() => {
        result.current.applyInitialHighlightSnapshot(snapshot, {
          bumpVersion: true,
          markPersisted: true,
        });
      });

      expect(result.current.initialHighlights).toBe(snapshot);
      expect(result.current.initialHighlightsVersion).toBe(1);
      expect(result.current.persistedSignatureRef.current).toBe("sig-4");
    });
  });
});
