import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import { spanIdSelector } from "@features/span-highlighting";

type OverlayState = "closed" | "opening" | "open" | "closing";

interface UseOutlineOverlayParams {
  outlineOverlayRef: React.RefObject<HTMLDivElement>;
  editorRef: React.RefObject<HTMLElement>;
  enableMLHighlighting: boolean;
  showHighlights: boolean;
  hoveredSpanId: string | null;
  setHoveredSpanId: (value: string | null) => void;
}

interface UseOutlineOverlayReturn {
  outlineOverlayState: OverlayState;
  outlineOverlayActive: boolean;
  openOutlineOverlay: () => void;
  closeOutlineOverlay: () => void;
}

export function useOutlineOverlay({
  outlineOverlayRef,
  editorRef,
  enableMLHighlighting,
  showHighlights,
  hoveredSpanId,
  setHoveredSpanId,
}: UseOutlineOverlayParams): UseOutlineOverlayReturn {
  const [outlineOverlayState, setOutlineOverlayState] =
    useState<OverlayState>("closed");
  const outlineOverlayActive = outlineOverlayState !== "closed";

  const closeOutlineOverlay = useCallback((): void => {
    setHoveredSpanId(null);
    setOutlineOverlayState("closing");
    window.setTimeout(() => {
      setOutlineOverlayState("closed");
    }, 160);
  }, [setHoveredSpanId]);

  const openOutlineOverlay = useCallback((): void => {
    setOutlineOverlayState("opening");
    requestAnimationFrame(() => setOutlineOverlayState("open"));
  }, []);

  // On small screens, avoid a skinny rail and show the outline content by default.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 768px)");
    if (mql.matches) openOutlineOverlay();
  }, [openOutlineOverlay]);

  // Escape key and click-outside dismissal
  useEffect(() => {
    if (!outlineOverlayActive) return;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        closeOutlineOverlay();
      }
    };
    const handleMouseDown = (event: MouseEvent): void => {
      const target = event.target as Node | null;
      if (!target) return;
      if (!outlineOverlayRef.current) return;
      if (outlineOverlayRef.current.contains(target)) return;
      closeOutlineOverlay();
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleMouseDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [closeOutlineOverlay, outlineOverlayActive, outlineOverlayRef]);

  // Hover brightness effect on span elements in the editor
  const inspectedSpanElementRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const root = editorRef.current;
    if (
      !root ||
      !enableMLHighlighting ||
      !showHighlights ||
      !outlineOverlayActive
    ) {
      if (inspectedSpanElementRef.current) {
        inspectedSpanElementRef.current.classList.remove("brightness-90");
        inspectedSpanElementRef.current = null;
      }
      return;
    }

    if (inspectedSpanElementRef.current) {
      inspectedSpanElementRef.current.classList.remove("brightness-90");
      inspectedSpanElementRef.current = null;
    }

    if (!hoveredSpanId) {
      return;
    }

    const el = root.querySelector(
      spanIdSelector(hoveredSpanId),
    ) as HTMLElement | null;
    if (!el) return;
    el.classList.add("brightness-90");
    inspectedSpanElementRef.current = el;
    return () => {
      el.classList.remove("brightness-90");
      if (inspectedSpanElementRef.current === el) {
        inspectedSpanElementRef.current = null;
      }
    };
  }, [
    editorRef,
    enableMLHighlighting,
    hoveredSpanId,
    showHighlights,
    outlineOverlayActive,
  ]);

  return {
    outlineOverlayState,
    outlineOverlayActive,
    openOutlineOverlay,
    closeOutlineOverlay,
  };
}
