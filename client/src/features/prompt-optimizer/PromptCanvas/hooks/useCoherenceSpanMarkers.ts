import { useEffect } from "react";
import type { RefObject } from "react";
import { HIGHLIGHT_SELECTOR } from "@features/span-highlighting";

const COHERENCE_BASE_CLASSES = [
  "underline",
  "decoration-2",
  "underline-offset-4",
  'after:content-[""]',
  "after:absolute",
  "after:-right-1",
  "after:-top-1",
  "after:h-2",
  "after:w-2",
  "after:rounded-full",
  "after:pointer-events-none",
];

const CONFLICT_CLASSES = [
  "decoration-error",
  "decoration-wavy",
  "after:bg-error",
];

const HARMONIZATION_CLASSES = [
  "decoration-warning",
  "decoration-dotted",
  "after:bg-warning",
];

const ALL_CLASSES = [
  ...COHERENCE_BASE_CLASSES,
  ...CONFLICT_CLASSES,
  ...HARMONIZATION_CLASSES,
];

export interface UseCoherenceSpanMarkersOptions {
  editorRef: RefObject<HTMLElement>;
  enableMLHighlighting: boolean;
  showHighlights: boolean;
  affectedSpanIds?: Set<string> | null;
  spanIssueMap?: Map<string, "conflict" | "harmonization"> | null;
  highlightFingerprint?: string | null;
}

export function useCoherenceSpanMarkers({
  editorRef,
  enableMLHighlighting,
  showHighlights,
  affectedSpanIds,
  spanIssueMap,
  highlightFingerprint,
}: UseCoherenceSpanMarkersOptions): void {
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const highlightNodes = editor.querySelectorAll(HIGHLIGHT_SELECTOR);
    if (!highlightNodes.length) return;

    const isActive = enableMLHighlighting && showHighlights;
    const issueMap = spanIssueMap ?? null;
    const issueSet = affectedSpanIds ?? null;

    highlightNodes.forEach((node) => {
      const element = node as HTMLElement;
      const spanId = element.dataset?.spanId;
      let issueType: "conflict" | "harmonization" | null = null;

      if (isActive && spanId) {
        issueType =
          issueMap?.get(spanId) ??
          (issueSet?.has(spanId) ? "harmonization" : null);
      }

      if (!issueType) {
        element.classList.remove(...ALL_CLASSES);
        delete element.dataset.coherenceIssue;
        return;
      }

      element.classList.add(...COHERENCE_BASE_CLASSES);
      if (issueType === "conflict") {
        element.classList.add(...CONFLICT_CLASSES);
        element.classList.remove(...HARMONIZATION_CLASSES);
      } else {
        element.classList.add(...HARMONIZATION_CLASSES);
        element.classList.remove(...CONFLICT_CLASSES);
      }
      element.dataset.coherenceIssue = issueType;
    });
  }, [
    editorRef,
    enableMLHighlighting,
    showHighlights,
    affectedSpanIds,
    spanIssueMap,
    highlightFingerprint,
  ]);
}
