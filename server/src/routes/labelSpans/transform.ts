import { normalizeRole } from "@shared/taxonomy";
import type {
  LabelSpansResult,
  LLMSpan,
  SpanLike,
} from "@llm/span-labeling/types";

export interface PublicSpan {
  text: string;
  start?: number;
  end?: number;
  category: string;
  confidence?: number;
}

export interface PublicLabelSpansResult
  extends Omit<LabelSpansResult, "spans"> {
  spans: PublicSpan[];
}

export const toPublicSpan = (span: LLMSpan | SpanLike): PublicSpan => ({
  text: span.text,
  ...(typeof span.start === "number" ? { start: span.start } : {}),
  ...(typeof span.end === "number" ? { end: span.end } : {}),
  category: normalizeRole(
    typeof span.role === "string"
      ? span.role
      : "category" in span && typeof span.category === "string"
        ? span.category
        : undefined,
  ),
  ...(typeof span.confidence === "number"
    ? { confidence: span.confidence }
    : {}),
});

export const toPublicLabelSpansResult = (
  result: LabelSpansResult,
): PublicLabelSpansResult => ({
  ...result,
  spans: Array.isArray(result.spans) ? result.spans.map(toPublicSpan) : [],
});
