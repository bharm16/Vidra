/**
 * Scroll and Animation Utilities for Span Category Accordion
 */

import type { RefObject } from "react";
import { logger } from "@/services/LoggingService";
import { spanIdSelector } from "@features/span-highlighting";

const log = logger.child("spanFormatting");

export interface Span {
  id: string;
  [key: string]: unknown;
}

/**
 * Scrolls to a span in the editor and adds pulse animation
 * Finds the highlight wrapper by data-span-id and smoothly scrolls to it
 * Adds a temporary pulse animation to draw attention
 */
export function scrollToSpan(
  editorRef: RefObject<HTMLElement>,
  span: Span | undefined,
): void {
  if (!editorRef?.current || !span?.id) {
    return;
  }

  // Find the highlight wrapper with matching span ID
  const wrapper = editorRef.current.querySelector(
    spanIdSelector(span.id),
  ) as HTMLElement | null;

  if (!wrapper) {
    log.warn("Span not found in editor", {
      operation: "scrollToSpan",
      spanId: span.id,
    });
    return;
  }

  // Scroll into view smoothly
  wrapper.scrollIntoView({
    behavior: "smooth",
    block: "center",
    inline: "nearest",
  });

  // Add temporary pulse animation
  wrapper.classList.add("ps-animate-span-pulse");

  // Remove pulse after animation completes (1000ms as defined in CSS)
  setTimeout(() => {
    wrapper.classList.remove("ps-animate-span-pulse");
  }, 700);
}
