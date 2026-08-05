import { HIGHLIGHT_CLASS } from "@features/span-highlighting/config/spanSelectors";
/**
 * Finds a highlighted word element from a click target by traversing up the DOM tree.
 */
export function findHighlightNode(
  targetElement: HTMLElement | null,
  rootElement: HTMLElement | null,
): HTMLElement | null {
  if (!targetElement || !rootElement) {
    return null;
  }

  let node: HTMLElement | null = targetElement;

  while (node && node !== rootElement) {
    if (node.classList && node.classList.contains(HIGHLIGHT_CLASS)) {
      return node;
    }
    node = node.parentElement;
  }

  return null;
}

export interface HighlightMetadata {
  category: string | null;
  source: string | null;
  spanId: string | null;
  start: number;
  end: number;
  startGrapheme: number;
  endGrapheme: number;
  validatorPass: boolean;
  confidence: number | null;
  quote: string;
  leftCtx: string;
  rightCtx: string;
  idempotencyKey: string | null;
  span?: Record<string, unknown>;
  [key: string]: unknown;
}

interface SpanIdParts {
  spanId?: string | null | undefined;
  start?: string | number | null | undefined;
  end?: string | number | null | undefined;
  category?: string | null | undefined;
}

function parseOffset(value: string | number | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Resolve a robust span id for click/selection flows.
 * Falls back to offset-based key when backend span.id is missing.
 */
export function resolveHighlightSpanId({
  spanId,
  start,
  end,
  category,
}: SpanIdParts): string | null {
  const normalizedSpanId =
    typeof spanId === "string" &&
    spanId.trim().length > 0 &&
    spanId !== "undefined" &&
    spanId !== "null"
      ? spanId
      : null;

  if (normalizedSpanId) {
    return normalizedSpanId;
  }

  const startOffset = parseOffset(start);
  const endOffset = parseOffset(end);
  if (startOffset === null || endOffset === null) {
    return null;
  }

  const categoryPart =
    typeof category === "string" && category.trim().length > 0
      ? category.trim()
      : "span";
  return `${startOffset}-${endOffset}-${categoryPart}`;
}

export interface ParseResult {
  spans?: Array<{ id?: string | undefined }>;
  displayText?: string;
}

/**
 * Extracts metadata from a highlighted word element's dataset.
 */
export function extractHighlightMetadata(
  node: HTMLElement | null,
  parseResult?: ParseResult | null,
): HighlightMetadata | null {
  if (!node || !node.dataset) {
    return null;
  }

  const wordText = node.textContent?.trim() ?? "";
  const {
    category,
    source,
    spanId: rawSpanId,
    start,
    end,
    startGrapheme,
    endGrapheme,
    validatorPass,
    confidence,
    quote,
    leftCtx,
    rightCtx,
    idempotencyKey,
  } = node.dataset;

  const resolvedSpanId = resolveHighlightSpanId({
    spanId: rawSpanId,
    start,
    end,
    category,
  });

  const metadata: HighlightMetadata = {
    category: category || null,
    source: source || null,
    spanId: resolvedSpanId,
    start: start ? Number(start) : -1,
    end: end ? Number(end) : -1,
    startGrapheme: startGrapheme ? Number(startGrapheme) : -1,
    endGrapheme: endGrapheme ? Number(endGrapheme) : -1,
    validatorPass: validatorPass !== "false",
    confidence: confidence ? Number(confidence) : null,
    quote: quote || wordText,
    leftCtx: leftCtx || "",
    rightCtx: rightCtx || "",
    idempotencyKey: idempotencyKey || null,
  };

  // Enhance with full span details if available
  if (metadata.spanId && Array.isArray(parseResult?.spans)) {
    const spanDetail = parseResult.spans.find(
      (span) => span.id === metadata.spanId,
    );
    if (spanDetail) {
      metadata.span = { ...spanDetail };
    }
  }

  return metadata;
}

export interface HighlightRangeResult {
  range: Range | null;
  rangeClone: Range | null;
  offsets: { start: number; end: number } | null;
}

/**
 * Creates a Range object for a DOM node and returns selection offsets.
 */
export function createHighlightRange(
  node: HTMLElement | null,
  rootElement: HTMLElement | null,
  getOffsetsFn: (
    element: HTMLElement,
    range: Range,
  ) => { start: number; end: number } | null,
): HighlightRangeResult {
  if (!node || !rootElement || !getOffsetsFn) {
    return { range: null, rangeClone: null, offsets: null };
  }

  const range = document.createRange();
  range.selectNodeContents(node);
  const rangeClone = range.cloneRange();
  const offsets = getOffsetsFn(rootElement, rangeClone);

  return { range, rangeClone, offsets };
}
