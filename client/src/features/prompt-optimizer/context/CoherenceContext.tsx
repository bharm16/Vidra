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
 *
 * ## Only half of this reaches a user today
 *
 * The check runs and the span markers render on both layout branches, but the
 * panel that lists the issues and offers the fixes is inside
 * `PromptCanvasView`'s legacy branch — after the
 * `if (FEATURES.CANVAS_FIRST_LAYOUT) return <CanvasWorkspace …>` early return —
 * and that flag defaults to `true`. So a creator sees underlines under
 * contradicting spans and has no surface explaining them.
 *
 * Left that way deliberately, on two existing decisions rather than a
 * preference:
 *
 * - Giving the panel a home in the canvas-first layout would add a surface the
 *   design handoff does not specify, and per ADR-0014 the handoff is the
 *   authoritative visual spec. `design_handoff_vidra/` has no coherence screen.
 * - Deleting it now would pre-empt a scheduled sweep. `docs/REBUILD.md` puts
 *   "the old-layout deletion (LAST)" at the end of the rebuild, and the
 *   2026-08-09 deep-module audit sizes that branch at 8 components and 55 props
 *   — the panel is one of the eight. Taking it alone leaves the other seven and
 *   the branch itself, against the build-scope rule that deletions land
 *   alongside their replacements.
 *
 * When that sweep runs, the panel's half of this value goes with it: `issues`,
 * `isChecking`, `isPanelExpanded`, `onTogglePanelExpanded`, `onDismissIssue`,
 * `onDismissAll`, `onApplyFix`, `onScrollToSpan`. What survives is what the
 * editor underlines with — `affectedSpanIds` and `spanIssueMap` — unless the
 * handoff grows a coherence surface first, which is the decision that would
 * reverse this one.
 *
 * Note the term: this is *prompt* coherence, contradictions inside one prompt.
 * Not the multi-shot coherence ADR-0002 and CONTEXT.md put out of scope — that
 * is the expert's problem and a different subsystem (`services/continuity`).
 */
export interface CoherenceContextValue {
  // --- the panel's half: unreachable while CANVAS_FIRST_LAYOUT is on ---
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
  // --- the editor's half: live on both branches ---
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
