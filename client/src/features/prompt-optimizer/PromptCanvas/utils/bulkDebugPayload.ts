/**
 * Payload builder for the DEV-only "copy all debug context" action.
 *
 * Fans out one enhancement-suggestions request per labeled span and folds the
 * settled results into a single serializable report. Kept out of the canvas
 * orchestrator so the hook retains only the toast/loading wiring.
 */

import { postEnhancementSuggestions } from "@/api/enhancementSuggestionsApi";
import { buildSuggestionContext } from "@features/prompt-optimizer/utils/enhancementSuggestionContext";
import { prepareSpanContext } from "@features/span-highlighting/utils/spanProcessing";
import type { Span } from "@features/span-highlighting/hooks/types";

interface SpanTarget {
  span: Span;
  spanText: string;
  spanId: string;
}

export interface BulkDebugEntry {
  spanId: string;
  status: string;
  text?: string;
  category?: string | null;
  confidence?: number | null;
  start?: number;
  end?: number;
  suggestionCount?: number;
  debug?: unknown;
  error?: string;
}

export interface BulkDebugPayload {
  generatedAt: string;
  totalSpans: number;
  successfulSpans: number;
  failedSpans: number;
  entries: BulkDebugEntry[];
}

export interface BuildBulkDebugPayloadOptions {
  promptText: string;
  spans: Span[];
  inputPrompt: string;
  promptContext: unknown;
}

const resolveSpanText = (span: Span): string => {
  if (typeof span.displayQuote === "string" && span.displayQuote.trim()) {
    return span.displayQuote.trim();
  }
  if (typeof span.quote === "string" && span.quote.trim()) {
    return span.quote.trim();
  }
  if (typeof span.text === "string" && span.text.trim()) {
    return span.text.trim();
  }
  return "";
};

const toSpanTargets = (spans: Span[]): SpanTarget[] =>
  spans
    .map((span): SpanTarget | null => {
      const spanText = resolveSpanText(span);
      if (!spanText) return null;
      return {
        span,
        spanText,
        spanId:
          typeof span.id === "string" && span.id.length > 0
            ? span.id
            : `span_${span.start}_${span.end}`,
      };
    })
    .filter((target): target is SpanTarget => target !== null);

const serializeContext = (promptContext: unknown): unknown => {
  if (
    promptContext &&
    typeof promptContext === "object" &&
    "toJSON" in promptContext &&
    typeof (promptContext as { toJSON?: () => unknown }).toJSON === "function"
  ) {
    return (promptContext as { toJSON: () => unknown }).toJSON();
  }
  return promptContext;
};

/**
 * Builds the bulk debug report for every labeled span in the prompt.
 * Returns null when no span carries usable text.
 */
export async function buildBulkDebugPayload({
  promptText,
  spans,
  inputPrompt,
  promptContext,
}: BuildBulkDebugPayloadOptions): Promise<BulkDebugPayload | null> {
  const spanTargets = toSpanTargets(spans);
  if (spanTargets.length === 0) {
    return null;
  }

  const serializedContext = serializeContext(promptContext);
  const normalizedPrompt = promptText.normalize("NFC");

  const settled = await Promise.allSettled(
    spanTargets.map(async ({ span, spanText, spanId }) => {
      const preferIndex =
        typeof span.start === "number" && Number.isFinite(span.start)
          ? span.start
          : null;
      const context = buildSuggestionContext(
        normalizedPrompt,
        spanText.normalize("NFC"),
        preferIndex,
        1000,
      );
      const metadata = {
        start: span.start,
        end: span.end,
        category: span.category,
        confidence: span.confidence,
        span,
      };
      const spanContext = prepareSpanContext(metadata, spans);

      const response = await postEnhancementSuggestions({
        highlightedText: spanText.normalize("NFC"),
        contextBefore: context.contextBefore,
        contextAfter: context.contextAfter,
        fullPrompt: normalizedPrompt,
        originalUserPrompt: inputPrompt,
        brainstormContext: serializedContext ?? null,
        highlightedCategory: span.category ?? null,
        highlightedCategoryConfidence:
          typeof span.confidence === "number" ? span.confidence : null,
        highlightedPhrase: spanText,
        allLabeledSpans: spanContext.simplifiedSpans,
        nearbySpans: spanContext.nearbySpans,
        editHistory: [],
      });

      return {
        spanId,
        text: spanText,
        category: span.category ?? null,
        confidence:
          typeof span.confidence === "number" ? span.confidence : null,
        start: span.start,
        end: span.end,
        suggestionCount: Array.isArray(response.suggestions)
          ? response.suggestions.length
          : 0,
        debug: response._debug ?? null,
      };
    }),
  );

  const entries: BulkDebugEntry[] = settled.map((result, index) => {
    const target = spanTargets[index];
    if (!target) {
      return {
        spanId: `unknown_${index}`,
        status: "error",
        error: "Unknown span target",
      };
    }

    if (result.status === "fulfilled") {
      return {
        status: "ok",
        ...result.value,
      };
    }

    return {
      spanId: target.spanId,
      text: target.spanText,
      category: target.span.category ?? null,
      confidence:
        typeof target.span.confidence === "number"
          ? target.span.confidence
          : null,
      start: target.span.start,
      end: target.span.end,
      status: "error",
      error:
        result.reason instanceof Error
          ? result.reason.message
          : "Failed to fetch debug data for span",
    };
  });

  const successfulSpans = entries.filter(
    (entry) => entry.status === "ok" && entry.debug !== null,
  ).length;

  return {
    generatedAt: new Date().toISOString(),
    totalSpans: entries.length,
    successfulSpans,
    failedSpans: entries.length - successfulSpans,
    entries,
  };
}
