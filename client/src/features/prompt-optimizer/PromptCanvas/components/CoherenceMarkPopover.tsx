import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Icon,
  Sparkle,
  WarningCircle,
  X,
} from "@promptstudio/system/components/ui";
import { Button } from "@promptstudio/system/components/ui/button";
import { cn } from "@/utils/cn";
import { useCoherence } from "@features/prompt-optimizer/context/CoherenceContext";
import type { CoherenceIssue } from "@features/prompt-optimizer/components/coherence/useCoherenceAnnotations";

/** The first live issue that involves the span, or null. */
export function findIssueForSpan(
  issues: CoherenceIssue[],
  spanId: string,
): CoherenceIssue | null {
  return (
    issues.find(
      (issue) => !issue.dismissed && issue.involvedSpanIds.includes(spanId),
    ) ?? null
  );
}

/**
 * How long the pointer must rest on a mark before the card opens. The card is
 * pointer-interactive and sits over following lines, so a pass-through cursor
 * must not plant it mid-path.
 */
const OPEN_INTENT_MS = 150;

/**
 * How long the popover survives the pointer leaving the span. Long enough to
 * travel from the underline to the popover, short enough not to linger.
 */
const CLOSE_GRACE_MS = 250;

/** w-80 plus the 8px gutter kept from the right viewport edge. */
const CARD_WIDTH_PX = 320;

/** Rough card height used only to decide whether to flip above the span. */
const CARD_ESTIMATED_HEIGHT_PX = 180;

interface OpenState {
  spanId: string;
  /** Viewport coordinates of the marked span, captured at open. */
  anchor: { top: number; left: number; bottom: number };
}

/**
 * The surface that explains a coherence mark, anchored to the mark itself.
 *
 * The check runs and the editor underlines contradicting spans on both layout
 * branches, but the panel that listed the issues is unreachable in the
 * canvas-first layout — so a creator saw marks with nothing explaining them.
 * This reads the same context the markers do and opens on hover over any
 * `[data-coherence-issue]` element inside the editor.
 *
 * Hover, never click: clicking a highlighted span is the click-to-enhance
 * entry point, and this surface must not sit in front of the core loop.
 *
 * NOTE (ADR-0014): the design handoff has no coherence surface, so this is a
 * provisional treatment built from existing canvas vocabulary — severity
 * icons and copy from CoherencePanel, tokens from the outline overlay. It
 * needs a handoff ruling; the seam to restyle or replace is this component.
 */
export function CoherenceMarkPopover({
  editorRef,
}: {
  editorRef: React.RefObject<HTMLElement | null>;
}): React.ReactElement | null {
  const coherence = useCoherence();
  const [open, setOpen] = useState<OpenState | null>(null);
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const cancelScheduledOpen = useCallback(() => {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  }, []);

  const cancelScheduledClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelScheduledClose();
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setOpen(null);
    }, CLOSE_GRACE_MS);
  }, [cancelScheduledClose]);

  useEffect(() => {
    const markFrom = (target: EventTarget | null): HTMLElement | null => {
      if (!(target instanceof Element)) return null;
      const mark = target.closest(
        "[data-coherence-issue]",
      ) as HTMLElement | null;
      // Containment is checked at event time against the ref's CURRENT
      // element, not against whatever it pointed at when this effect ran:
      // the same ref is rebound across editor swaps (the Anchor sheet's
      // editor pre-work, the docked composer's after), and a listener bound
      // to one editor element would go dead on the swap. Delegating on the
      // document and re-reading `.current` survives any remount.
      if (!mark || !editorRef.current?.contains(mark)) return null;
      return mark;
    };

    const handleOver = (event: MouseEvent): void => {
      const mark = markFrom(event.target);
      if (!mark) return;
      const spanId = mark.dataset.spanId;
      if (!spanId) return;
      cancelScheduledClose();
      cancelScheduledOpen();
      const rect = mark.getBoundingClientRect();
      const next: OpenState = {
        spanId,
        anchor: { top: rect.top, left: rect.left, bottom: rect.bottom },
      };
      // Intent delay: the card is pointer-interactive, so opening on the
      // first brushed pixel would plant it under a cursor that is merely
      // passing through the line.
      openTimerRef.current = window.setTimeout(() => {
        openTimerRef.current = null;
        setOpen(next);
      }, OPEN_INTENT_MS);
    };

    const handleOut = (event: MouseEvent): void => {
      const mark = markFrom(event.target);
      if (!mark) return;
      // Moving between children of the same mark is not a leave.
      if (
        event.relatedTarget instanceof Element &&
        (mark.contains(event.relatedTarget) ||
          event.relatedTarget.closest("[data-coherence-mark-popover]"))
      ) {
        return;
      }
      cancelScheduledOpen();
      scheduleClose();
    };

    // The anchor coordinates go stale the moment the editor scrolls; closing
    // is honest, and the mark is still there to re-hover.
    const handleScroll = (): void => {
      cancelScheduledOpen();
      setOpen(null);
    };

    document.addEventListener("mouseover", handleOver);
    document.addEventListener("mouseout", handleOut);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mouseover", handleOver);
      document.removeEventListener("mouseout", handleOut);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [editorRef, cancelScheduledOpen, cancelScheduledClose, scheduleClose]);

  useEffect(
    () => () => {
      cancelScheduledOpen();
      cancelScheduledClose();
    },
    [cancelScheduledOpen, cancelScheduledClose],
  );

  const issue = open ? findIssueForSpan(coherence.issues, open.spanId) : null;
  if (!open || !issue) return null;

  const recommendation = issue.recommendations[0] ?? null;
  const isConflict = issue.type === "conflict";

  // Clamp into the viewport. The editor is bottom-docked, so a mark on its
  // last line has no room below — flip above the span in that case.
  const left = Math.max(
    8,
    Math.min(open.anchor.left, window.innerWidth - CARD_WIDTH_PX - 8),
  );
  const flipAbove =
    open.anchor.bottom + 8 + CARD_ESTIMATED_HEIGHT_PX > window.innerHeight;

  return (
    <div
      data-testid="coherence-mark-popover"
      data-coherence-mark-popover
      role="dialog"
      aria-label={isConflict ? "Coherence conflict" : "Coherence suggestion"}
      onMouseEnter={cancelScheduledClose}
      onMouseLeave={scheduleClose}
      className={cn(
        "z-modal border-border bg-surface-1 fixed w-80 rounded-xl border p-3 shadow-lg",
        "ps-animate-scale-in",
      )}
      style={
        flipAbove
          ? {
              top: `${open.anchor.top - 8}px`,
              left: `${left}px`,
              transform: "translateY(-100%)",
            }
          : { top: `${open.anchor.bottom + 8}px`, left: `${left}px` }
      }
    >
      <div className="flex items-start gap-2">
        <Icon
          icon={isConflict ? WarningCircle : Sparkle}
          size="sm"
          className={cn(
            "mt-0.5 shrink-0",
            isConflict ? "text-error" : "text-info",
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="text-body-sm text-foreground font-medium">
            {issue.message}
          </p>
          <p className="text-meta text-muted mt-1">{issue.reasoning}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            coherence.onDismissIssue(issue.id);
            cancelScheduledClose();
            setOpen(null);
          }}
          className="text-muted hover:text-foreground h-6 w-6 shrink-0"
          aria-label="Dismiss"
        >
          <Icon icon={X} size="xs" />
        </Button>
      </div>

      {recommendation && (
        <div className="border-border mt-2 flex items-center justify-between gap-2 rounded-lg border p-2">
          <p className="text-meta text-foreground min-w-0 flex-1 truncate font-medium">
            {recommendation.title}
          </p>
          <Button
            variant="default"
            size="sm"
            onClick={() => {
              coherence.onApplyFix(issue.id, recommendation);
              cancelScheduledClose();
              setOpen(null);
            }}
            className="h-7 shrink-0 rounded-md px-3 text-xs font-medium"
            aria-label="Apply"
          >
            Apply
          </Button>
        </div>
      )}
    </div>
  );
}
