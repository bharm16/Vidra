/**
 * Highlight Styles Configuration
 *
 * CSS class names and style properties for highlight elements.
 */

import { HIGHLIGHT_CLASS } from "./spanSelectors";

export interface HighlightColor {
  bg: string;
  border: string;
  ring: string;
}

/**
 * Get CSS class name for a category
 */
export function getHighlightClassName(
  category: string | null | undefined,
): string {
  const baseClasses = [
    HIGHLIGHT_CLASS,
    "relative",
    "cursor-pointer",
    "transition-colors",
    "duration-150",
    "ease-out",
    "break-words",
    "select-text",
  ];
  const categoryClass = category
    ? `value-word-${category}`
    : "value-word-unknown";
  return [...baseClasses, categoryClass].join(" ");
}

/**
 * Apply styles to a highlight element
 */
export function applyHighlightStyles(
  element: HTMLElement,
  color: HighlightColor | undefined,
): void {
  const fallback: HighlightColor = {
    bg: "rgba(104,134,255,0.12)",
    border: "rgba(104,134,255,0.35)",
    ring: "rgba(104,134,255,0.18)",
  };
  const resolved = color ?? fallback;
  // Extract RGB from border color and apply as text color at 0.9 opacity
  const rgbMatch = resolved.border.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    element.style.color = `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, 0.9)`;
  }
  // Clear any previously set highlight vars (in case of re-render)
  element.style.removeProperty("--highlight-bg");
  element.style.removeProperty("--highlight-border");
  element.style.removeProperty("--highlight-ring");
}
