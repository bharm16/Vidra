import type { LabelSpansResponse, SpanLabel } from "./spanLabelingTypes";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

export function parseSpanLabel(value: unknown): SpanLabel | null {
  if (!isRecord(value)) return null;

  const start = typeof value.start === "number" ? value.start : null;
  const end = typeof value.end === "number" ? value.end : null;
  // The server normalizes once (toPublicSpan): `category` is always a valid
  // taxonomy id. The client trusts it — no role fallback, no re-derivation.
  const category = typeof value.category === "string" ? value.category : null;
  const confidence =
    typeof value.confidence === "number" ? value.confidence : null;
  if (start === null || end === null || !category || confidence === null)
    return null;

  const span: SpanLabel = {
    start,
    end,
    category,
    confidence,
  };

  if (typeof value.text === "string") {
    span.text = value.text;
  }

  return span;
}

export function parseLabelSpansResponse(data: unknown): LabelSpansResponse {
  if (!isRecord(data)) {
    return { spans: [], meta: null };
  }

  const spans = Array.isArray(data.spans)
    ? data.spans
        .map(parseSpanLabel)
        .filter((span): span is SpanLabel => span !== null)
    : [];

  const meta =
    data.meta === null ? null : isRecord(data.meta) ? data.meta : null;

  return { spans, meta };
}
