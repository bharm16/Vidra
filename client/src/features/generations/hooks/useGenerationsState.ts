import { useCallback, useEffect, useReducer, useRef } from "react";
import type { Generation, GenerationTier } from "../types";
import { areGenerationsEqual } from "../utils/generationComparison";
import { mergeGenerations } from "../utils/generationUrlPreference";

export { mergeGenerations } from "../utils/generationUrlPreference";

export type GenerationsState = {
  generations: Generation[];
  activeGenerationId: string | null;
  isGenerating: boolean;
};

// ISSUE-12 follow-up: ADD_GENERATION was retired. Under the server-
// authoritative model, "a new generation exists" is expressed as
// SET_GENERATIONS([...current, newGen]) so the dispatch call site carries
// the full authoritative set — same discipline as a session refetch.
// UPDATE_GENERATION is kept because targeted field patches (job status
// tick, signed-URL refresh, failure stamp) would require every caller to
// reconstruct the full array, which is awkward and error-prone.
export type GenerationsAction =
  | {
      type: "UPDATE_GENERATION";
      payload: { id: string; updates: Partial<Generation> };
    }
  | { type: "REMOVE_GENERATION"; payload: { id: string } }
  | { type: "SET_ACTIVE"; payload: string | null }
  | { type: "SET_GENERATIONS"; payload: Generation[] };

const deriveIsGenerating = (generations: Generation[]): boolean =>
  generations.some(
    (gen) => gen.status === "pending" || gen.status === "generating",
  );

const buildInitialState = (initial?: Generation[]): GenerationsState => {
  const generations = initial ?? [];
  const lastGeneration =
    generations.length > 0 ? generations[generations.length - 1]! : null;
  const activeGenerationId = lastGeneration?.id ?? null;
  return {
    generations,
    activeGenerationId,
    isGenerating: deriveIsGenerating(generations),
  };
};

function generationsReducer(
  state: GenerationsState,
  action: GenerationsAction,
): GenerationsState {
  switch (action.type) {
    case "UPDATE_GENERATION": {
      const updates = action.payload.updates;
      const generations = state.generations.map((gen) =>
        gen.id === action.payload.id ? { ...gen, ...updates } : gen,
      );
      return {
        ...state,
        generations,
        isGenerating: deriveIsGenerating(generations),
      };
    }
    case "REMOVE_GENERATION": {
      const generations = state.generations.filter(
        (gen) => gen.id !== action.payload.id,
      );
      const activeGenerationId =
        state.activeGenerationId === action.payload.id
          ? (generations[generations.length - 1]?.id ?? null)
          : state.activeGenerationId;
      return {
        generations,
        activeGenerationId,
        isGenerating: deriveIsGenerating(generations),
      };
    }
    case "SET_ACTIVE":
      return { ...state, activeGenerationId: action.payload };
    case "SET_GENERATIONS": {
      const generations = action.payload ?? [];
      // Bug 15 fix: preserve activeGenerationId if it still exists in the new set
      const lastGeneration =
        generations.length > 0 ? generations[generations.length - 1]! : null;
      const preservedActiveId =
        state.activeGenerationId &&
        generations.some((g) => g.id === state.activeGenerationId)
          ? state.activeGenerationId
          : (lastGeneration?.id ?? null);
      return {
        generations,
        activeGenerationId: preservedActiveId,
        isGenerating: deriveIsGenerating(generations),
      };
    }
    default:
      return state;
  }
}

interface UseGenerationsStateOptions {
  initialGenerations?: Generation[] | undefined;
  onGenerationsChange?: ((generations: Generation[]) => void) | undefined;
  promptVersionId?: string | null | undefined;
}

export function useGenerationsState({
  initialGenerations,
  onGenerationsChange,
  promptVersionId,
}: UseGenerationsStateOptions = {}) {
  const [state, dispatch] = useReducer(
    generationsReducer,
    initialGenerations,
    buildInitialState,
  );
  const initialRef = useRef<Generation[] | undefined>(initialGenerations);
  const suppressOnChangeRef = useRef(false);
  const onGenerationsChangeRef = useRef(onGenerationsChange);
  onGenerationsChangeRef.current = onGenerationsChange;
  const generationsRef = useRef(state.generations);
  generationsRef.current = state.generations;

  // Sync initialGenerations into local state
  // Bug 7 fix: read state.generations via ref to avoid re-triggering on local changes
  useEffect(() => {
    const hasInitial = Boolean(initialGenerations);
    const sameRef = initialRef.current === initialGenerations;
    const mergedGenerations = mergeGenerations(
      initialGenerations,
      generationsRef.current,
    );
    const sameContent = areGenerationsEqual(
      mergedGenerations,
      generationsRef.current,
    );
    const hasLocalForVersion = Boolean(
      promptVersionId &&
        Array.isArray(initialGenerations) &&
        initialGenerations.length === 0 &&
        generationsRef.current.some(
          (gen) => gen.promptVersionId === promptVersionId,
        ),
    );

    if (!hasInitial || sameRef || sameContent || hasLocalForVersion) return;

    initialRef.current = initialGenerations;
    suppressOnChangeRef.current = true;
    dispatch({ type: "SET_GENERATIONS", payload: mergedGenerations ?? [] });
  }, [initialGenerations, promptVersionId]);

  // Emit changes to parent
  // Bug 8 fix: skip when only callback reference changed but generations didn't
  const prevGenerationsRef = useRef(state.generations);
  useEffect(() => {
    if (suppressOnChangeRef.current) {
      suppressOnChangeRef.current = false;
      prevGenerationsRef.current = state.generations;
      return;
    }
    if (prevGenerationsRef.current === state.generations) return;
    prevGenerationsRef.current = state.generations;
    onGenerationsChangeRef.current?.(state.generations);
  }, [state.generations]);

  // ISSUE-12 follow-up: `addGeneration` is retained as a test-facing
  // convenience — it dispatches SET_GENERATIONS over the current ref
  // snapshot so the reducer keeps a single "state grows" entry point. It
  // has no production caller (state grows via SET_GENERATIONS directly).
  //
  // CAVEAT: do NOT call it twice in the same React tick. Each call reads
  // `generationsRef.current`, which only updates after re-render; two sync
  // calls each compute `[...stale, gen]` and the second clobbers the first.
  // To batch multiple entries, dispatch SET_GENERATIONS with the full array.
  const addGeneration = useCallback(
    (generation: Generation) =>
      dispatch({
        type: "SET_GENERATIONS",
        payload: [...generationsRef.current, generation],
      }),
    [],
  );

  const removeGeneration = useCallback(
    (id: string) => dispatch({ type: "REMOVE_GENERATION", payload: { id } }),
    [],
  );

  const setActiveGeneration = useCallback(
    (id: string | null) => dispatch({ type: "SET_ACTIVE", payload: id }),
    [],
  );

  const getLatestByTier = useCallback(
    (tier: GenerationTier) => {
      const items = state.generations.filter((gen) => gen.tier === tier);
      return items.length ? items[items.length - 1] : null;
    },
    [state.generations],
  );

  const clearGenerations = useCallback(() => {
    dispatch({ type: "SET_GENERATIONS", payload: [] });
  }, []);

  return {
    generations: state.generations,
    activeGenerationId: state.activeGenerationId,
    isGenerating: state.isGenerating,
    dispatch,
    addGeneration,
    removeGeneration,
    setActiveGeneration,
    clearGenerations,
    getLatestByTier,
  };
}
