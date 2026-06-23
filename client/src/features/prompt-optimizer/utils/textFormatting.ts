/**
 * Text Formatting Layer
 *
 * Utilities for safely escaping text for the prompt editor and shared views.
 * Legacy "Standard Mode" formatting has been removed in favor of
 * "Video Mode" (ML Highlighting) support.
 */

/**
 * Escapes HTML special characters to prevent XSS attacks.
 */
const escapeHtml = (str: string | null | undefined = ""): string =>
  String(str)
    // Strip inline event handlers to avoid leftover "onxxx=" substrings.
    .replace(/on[a-z]+(\s*)=/gi, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

/**
 * Escapes HTML for ML highlighting mode.
 * Preserves whitespace and newlines for span offset matching.
 */
export function escapeHTMLForMLHighlighting(text: string): string {
  const escaped = escapeHtml(text || "");

  const paragraphBreakPattern = /(\r?\n){2,}/g;
  const withParagraphGaps = escaped.replace(
    paragraphBreakPattern,
    (match) =>
      `${match}<span class="ps-paragraph-gap" aria-hidden="true" contenteditable="false"></span>`,
  );

  return `<div class="whitespace-pre-wrap break-words text-body-xl text-foreground-warm">${withParagraphGaps}</div>`;
}
