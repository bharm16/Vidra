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
 * ## Who consumes what
 *
 * Three consumers, two branches:
 *
 * - The editor's span markers (`useCoherenceSpanMarkers`) underline affected
 *   spans on both layout branches — `affectedSpanIds`, `spanIssueMap`.
 * - `CoherenceMarkPopover` explains a mark on hover and offers the first fix.
 *   It is the canvas-first surface for issues (the layout that actually ships:
 *   `CANVAS_FIRST_LAYOUT` defaults true) — `issues`, `onDismissIssue`,
 *   `onApplyFix`.
 * - `CoherencePanel` lists everything with per-recommendation diffs. It sits in
 *   `PromptCanvasView`'s legacy branch only, so it is unreachable under the
 *   default flag. Kept there anyway: ADR-0014 makes the design handoff the
 *   visual authority and the handoff has no coherence *panel*, and
 *   `docs/REBUILD.md` schedules the whole legacy branch for one deletion sweep
 *   (LAST) — the 2026-08-09 audit counts the panel among its 8 components.
 *
 * When that sweep runs, only the panel-exclusive fields go with it:
 * `isChecking`, `isPanelExpanded`, `onTogglePanelExpanded`, `onDismissAll`,
 * `onScrollToSpan`. Everything else has a live consumer.
 *
 * The popover itself is a provisional treatment (ADR-0014): built strictly from
 * existing canvas vocabulary, pending a handoff ruling on how coherence should
 * look. Restyling or replacing it happens in one component.
 *
 * Note the term: this is *prompt* coherence, contradictions inside one prompt.
 * Not the multi-shot coherence ADR-0002 and CONTEXT.md put out of scope — that
 * is the expert's problem and a different subsystem (`services/continuity`).
 */
export interface CoherenceContextValue {
  // --- live in the shipping layout: markers + CoherenceMarkPopover ---
  issues: CoherenceIssue[];
  onDismissIssue: (issueId: string) => void;
  onApplyFix: (
    issueId: string,
    recommendation: CoherenceRecommendation,
  ) => void;
  /** Spans an issue touches — the editor underlines these. */
  affectedSpanIds: Set<string>;
  /** Per-span marker style, keyed by span id. */
  spanIssueMap: Map<string, "conflict" | "harmonization">;
  // --- panel-only: unreachable while CANVAS_FIRST_LAYOUT is on; goes with
  // --- the legacy-branch deletion sweep
  isChecking: boolean;
  isPanelExpanded: boolean;
  onTogglePanelExpanded: () => void;
  onDismissAll: () => void;
  onScrollToSpan: (spanId: string) => void;
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
