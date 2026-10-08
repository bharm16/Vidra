/**
 * usePromptCanvasState Hook
 *
 * Centralizes UI state management using useReducer.
 * Extracted from PromptCanvas component to improve separation of concerns.
 */

import { useCallback, useReducer } from "react";

import type { PromptCanvasAction, PromptCanvasState } from "../types";

export const initialPromptCanvasState: PromptCanvasState = {
  showHighlights: true,
  selectedSpanId: null,
  lastAppliedSpanId: null,
  hasInteracted: false,
  hoveredSpanId: null,
  lastSwapTime: null,
  promptState: "generated",
  generatedTimestamp: null,
  justReplaced: null,
};

export function promptCanvasReducer(
  state: PromptCanvasState,
  action: PromptCanvasAction,
): PromptCanvasState {
  switch (action.type) {
    case "MERGE_STATE": {
      const keys = Object.keys(action.payload) as Array<
        keyof PromptCanvasState
      >;
      let changed = false;
      for (const key of keys) {
        if (!Object.is(state[key], action.payload[key])) {
          changed = true;
          break;
        }
      }
      return changed ? { ...state, ...action.payload } : state;
    }
    default:
      return state;
  }
}

export interface UsePromptCanvasStateReturn {
  state: PromptCanvasState;
  setState: (payload: Partial<PromptCanvasState>) => void;
}

export function usePromptCanvasState(): UsePromptCanvasStateReturn {
  const [state, dispatch] = useReducer(
    promptCanvasReducer,
    initialPromptCanvasState,
  );

  const setState = useCallback((payload: Partial<PromptCanvasState>) => {
    dispatch({ type: "MERGE_STATE", payload });
  }, []);

  return { state, setState };
}
