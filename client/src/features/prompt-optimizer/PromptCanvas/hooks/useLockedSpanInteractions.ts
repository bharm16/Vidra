import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { RefObject } from "react";
import { findHighlightNode } from "@features/prompt-optimizer/utils/highlightInteractionHelpers";
import {
  buildLockedSpan,
  findLockedSpanIndex,
  getSpanId,
  isSpanLocked,
} from "@features/prompt-optimizer/utils/lockedSpans";
import type { LockedSpan } from "@features/prompt-optimizer/types";
import type { HighlightSpan } from "@features/span-highlighting";
import { logger } from "@/services/LoggingService";
import { sanitizeError } from "@/utils/logging";
import {
  HIGHLIGHT_SELECTOR,
  spanIdSelector,
} from "@features/span-highlighting";

const log = logger.child("useLockedSpanInteractions");

interface UseLockedSpanInteractionsOptions {
  editorRef: RefObject<HTMLElement>;
  editorWrapperRef: RefObject<HTMLDivElement | null>;
  lockButtonRef: RefObject<HTMLButtonElement | null>;
  enableMLHighlighting: boolean;
  showHighlights: boolean;
  hoveredSpanId: string | null;
  setHoveredSpanId: (value: string | null) => void;
  parseResultSpans: HighlightSpan[];
  lockedSpans: LockedSpan[];
  addLockedSpan: (span: LockedSpan) => void;
  removeLockedSpan: (spanId: string) => void;
  highlightFingerprint: string | null;
  displayedPrompt: string | null;
}

interface UseLockedSpanInteractionsResult {
  lockButtonPosition: { top: number; left: number } | null;
  isHoveredLocked: boolean;
  handleHighlightMouseEnter: (e: React.MouseEvent) => void;
  handleHighlightMouseLeave: (e: React.MouseEvent) => void;
  handleLockButtonMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => void;
  handleToggleLock: () => void;
  cancelHideLockButton: () => void;
}

export const useLockedSpanInteractions = ({
  editorRef,
  editorWrapperRef,
  lockButtonRef,
  enableMLHighlighting,
  showHighlights,
  hoveredSpanId,
  setHoveredSpanId,
  parseResultSpans,
  lockedSpans,
  addLockedSpan,
  removeLockedSpan,
  highlightFingerprint,
  displayedPrompt,
}: UseLockedSpanInteractionsOptions): UseLockedSpanInteractionsResult => {
  const [lockButtonPosition, setLockButtonPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const hideLockButtonTimerRef = useRef<number | null>(null);

  const hoveredSpan = useMemo(() => {
    if (!hoveredSpanId) return null;
    return (
      parseResultSpans.find(
        (candidate) => getSpanId(candidate) === hoveredSpanId,
      ) ?? null
    );
  }, [hoveredSpanId, parseResultSpans]);

  const hoveredLockedIndex = useMemo(
    () => findLockedSpanIndex(lockedSpans, hoveredSpan),
    [lockedSpans, hoveredSpan],
  );

  const isHoveredLocked = hoveredLockedIndex >= 0;

  const lockedSpanIds = useMemo(() => {
    if (!lockedSpans.length || !parseResultSpans.length) {
      return new Set<string>();
    }
    const ids = new Set<string>();
    parseResultSpans.forEach((span) => {
      if (isSpanLocked(lockedSpans, span)) {
        ids.add(getSpanId(span));
      }
    });
    return ids;
  }, [lockedSpans, parseResultSpans]);

  const cancelHideLockButton = useCallback((): void => {
    if (hideLockButtonTimerRef.current !== null) {
      window.clearTimeout(hideLockButtonTimerRef.current);
      hideLockButtonTimerRef.current = null;
    }
  }, []);

  const scheduleHideLockButton = useCallback(
    (delayMs = 2000): void => {
      cancelHideLockButton();
      hideLockButtonTimerRef.current = window.setTimeout(() => {
        setHoveredSpanId(null);
      }, delayMs);
    },
    [cancelHideLockButton, setHoveredSpanId],
  );

  const handleHighlightMouseEnter = useCallback(
    (e: React.MouseEvent): void => {
      if (!enableMLHighlighting || !editorRef.current) return;
      cancelHideLockButton();
      try {
        const target = e.target as HTMLElement | null;
        if (!target) return;
        const node = findHighlightNode(target, editorRef.current);
        if (node) {
          const spanId = node.dataset?.spanId || null;
          if (hoveredSpanId !== spanId) {
            setHoveredSpanId(spanId);
          }
        } else if (hoveredSpanId !== null) {
          scheduleHideLockButton();
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          const info = sanitizeError(error);
          log.debug("Hover detection error", {
            error: info.message,
            errorName: info.name,
          });
        }
      }
    },
    [
      enableMLHighlighting,
      editorRef,
      hoveredSpanId,
      setHoveredSpanId,
      cancelHideLockButton,
      scheduleHideLockButton,
    ],
  );

  const handleHighlightMouseLeave = useCallback(
    (e: React.MouseEvent): void => {
      const related = e.relatedTarget as Node | null;
      if (related && lockButtonRef.current?.contains(related)) {
        return;
      }
      scheduleHideLockButton();
    },
    [lockButtonRef, scheduleHideLockButton],
  );

  const handleLockButtonMouseLeave = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>): void => {
      const related = e.relatedTarget as Node | null;
      if (related && editorRef.current?.contains(related)) {
        return;
      }
      scheduleHideLockButton();
    },
    [editorRef, scheduleHideLockButton],
  );

  useEffect(() => {
    return () => {
      if (hideLockButtonTimerRef.current !== null) {
        window.clearTimeout(hideLockButtonTimerRef.current);
        hideLockButtonTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!editorRef.current || !enableMLHighlighting || !showHighlights) {
      return;
    }
    const editor = editorRef.current;
    const allHighlights = editor.querySelectorAll(HIGHLIGHT_SELECTOR);
    allHighlights.forEach((highlight) => {
      const element = highlight as HTMLElement;
      const spanId = element.dataset?.spanId;
      if (spanId && lockedSpanIds.has(spanId)) {
        element.classList.add("border-dashed");
      } else {
        element.classList.remove("border-dashed");
      }
    });
  }, [
    lockedSpanIds,
    enableMLHighlighting,
    showHighlights,
    editorRef,
    highlightFingerprint,
  ]);

  useLayoutEffect(() => {
    if (
      !hoveredSpanId ||
      !editorRef.current ||
      !editorWrapperRef.current ||
      !enableMLHighlighting ||
      !showHighlights
    ) {
      setLockButtonPosition(null);
      return;
    }

    const spanElement = editorRef.current.querySelector(
      spanIdSelector(hoveredSpanId),
    ) as HTMLElement | null;

    if (!spanElement) {
      setLockButtonPosition(null);
      return;
    }

    const wrapperRect = editorWrapperRef.current.getBoundingClientRect();
    const spanRect = spanElement.getBoundingClientRect();
    const buttonSize = 24;
    const padding = 4;
    const top = spanRect.top - wrapperRect.top;
    const centerX = spanRect.left - wrapperRect.left + spanRect.width / 2;
    const left = Math.min(
      Math.max(buttonSize / 2 + padding, centerX),
      wrapperRect.width - buttonSize / 2 - padding,
    );

    setLockButtonPosition({ top, left });
  }, [
    hoveredSpanId,
    enableMLHighlighting,
    showHighlights,
    highlightFingerprint,
    displayedPrompt,
    editorRef,
    editorWrapperRef,
  ]);

  const handleToggleLock = useCallback((): void => {
    if (!hoveredSpan) {
      return;
    }
    if (hoveredLockedIndex >= 0) {
      const lockedSpan = lockedSpans[hoveredLockedIndex];
      if (lockedSpan) {
        removeLockedSpan(lockedSpan.id);
      }
      return;
    }
    const nextLockedSpan = buildLockedSpan(hoveredSpan);
    if (nextLockedSpan) {
      addLockedSpan(nextLockedSpan);
    }
  }, [
    hoveredSpan,
    hoveredLockedIndex,
    lockedSpans,
    addLockedSpan,
    removeLockedSpan,
  ]);

  return {
    lockButtonPosition,
    isHoveredLocked,
    handleHighlightMouseEnter,
    handleHighlightMouseLeave,
    handleLockButtonMouseLeave,
    handleToggleLock,
    cancelHideLockButton,
  };
};
