import type { SpanLabelingPolicy } from "../hooks/types";

export interface SpanLabel {
  start: number;
  end: number;
  category: string;
  confidence: number;
  text?: string;
}

export interface LabelSpansPayload {
  text: string;
  maxSpans?: number;
  minConfidence?: number;
  policy?: SpanLabelingPolicy;
  templateVersion?: string;
  isI2VMode?: boolean;
}

export interface LabelSpansResponse {
  spans: SpanLabel[];
  meta: Record<string, unknown> | null;
}
