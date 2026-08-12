import React, { createContext, useContext } from "react";
import type { CoherenceIssue } from "@/features/prompt-optimizer/components/coherence/useCoherenceAnnotations";
import type { CoherenceRecommendation } from "@/features/prompt-optimizer/types/coherence";

/**
 * Prompt-coherence state and the actions on it.
 *
 * A context because the producer (`usePromptCoherence`, at the workspace) and the
 * consumers (the coherence panel and the editor's span markers) are both single
 * and both far apart. These ten values used to travel the distance as props:
 * workspace hook → PromptResultsActionsProvider → PromptResultsSection (which
 * read the context only to write the same values back out as props) →
 * PromptCanvasProps → a pass-through `useCanvasCoherence` hook → viewProps →
 * PromptCanvasView → the panel. Six declarations for one producer, and every
 * field optional at every hop, so the panel normalized all eight of its inputs
 * (`?? []`, `Boolean()`, `?? (() => {})`) at the end of the tunnel.
 *
 * Non-optional here on purpose: whoever provides coherence provides all of it.
 */
export interface CoherenceContextValue {
  issues: CoherenceIssue[];
  isChecking: boolean;
  isPanelExpanded: boolean;
  onTogglePanelExpanded: () => void;
  onDismissIssue: (issueId: string) => void;
  onDismissAll: () => void;
  onApplyFix: (
    issueId: string,
    recommendation: CoherenceRecommendation,
  ) => void;
  onScrollToSpan: (spanId: string) => void;
  /** Spans an issue touches — the editor underlines these. */
  affectedSpanIds: Set<string>;
  /** Per-span marker style, keyed by span id. */
  spanIssueMap: Map<string, "conflict" | "harmonization">;
}

const CoherenceContext = createContext<CoherenceContextValue | null>(null);

export function CoherenceProvider({
  value,
  children,
}: {
  value: CoherenceContextValue;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <CoherenceContext.Provider value={value}>
      {children}
    </CoherenceContext.Provider>
  );
}

const EMPTY: CoherenceContextValue = {
  issues: [],
  isChecking: false,
  isPanelExpanded: false,
  onTogglePanelExpanded: () => {},
  onDismissIssue: () => {},
  onDismissAll: () => {},
  onApplyFix: () => {},
  onScrollToSpan: () => {},
  affectedSpanIds: new Set(),
  spanIssueMap: new Map(),
};

/**
 * Coherence state, or an inert value outside a provider.
 *
 * Inert rather than throwing because the canvas renders in surfaces that have no
 * coherence producer (the standalone editor screens and most component tests),
 * and "no issues" is the honest reading of that — the same thing the optional
 * props used to coerce to, now in one place instead of eight call sites.
 */
export function useCoherence(): CoherenceContextValue {
  return useContext(CoherenceContext) ?? EMPTY;
}
