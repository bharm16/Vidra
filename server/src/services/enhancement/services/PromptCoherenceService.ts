import { logger } from "@infrastructure/Logger";
import {
  StructuredOutputEnforcer,
  type StructuredOutputSchema,
} from "@utils/StructuredOutputEnforcer";
import { TemperatureOptimizer } from "@utils/TemperatureOptimizer";
import type { AIExecutionPort as AIService } from "@services/ai-model/ports/AIExecutionPort";
import { normalizeText } from "@services/enhancement/utils/text";

export interface CoherenceSpan {
  id?: string;
  category?: string;
  text?: string;
  quote?: string;
  start?: number;
  end?: number;
  confidence?: number;
  source?: "labeled" | "context";
}

export interface AppliedChange {
  spanId?: string;
  category?: string;
  oldText?: string;
  newText?: string;
}

export type CoherenceEdit =
  | {
      type: "replaceSpanText";
      spanId?: string;
      replacementText?: string;
      anchorQuote?: string;
    }
  | {
      type: "removeSpan";
      spanId?: string;
      anchorQuote?: string;
    };

export interface CoherenceRecommendation {
  title: string;
  rationale: string;
  edits: CoherenceEdit[];
  confidence?: number;
}

export interface CoherenceFinding {
  severity?: "low" | "medium" | "high" | "suggestion";
  message: string;
  reasoning: string;
  involvedSpanIds?: string[];
  recommendations: CoherenceRecommendation[];
}

export interface CoherenceResult {
  conflicts: CoherenceFinding[];
  harmonizations: CoherenceFinding[];
}

export interface CoherenceCheckParams {
  beforePrompt: string;
  afterPrompt: string;
  appliedChange?: AppliedChange;
  spans?: CoherenceSpan[];
}

const log = logger.child({ service: "PromptCoherenceService" });

const MAX_CONTEXT_SPANS = 12;
const MIN_CONTEXT_CHARS = 3;
const SENTENCE_REGEX = /[^.!?\n]+[.!?]+|[^.!?\n]+$/g;
const WORD_CHAR_REGEX = /[A-Za-z0-9]/;

const summarizeSpan = (span: CoherenceSpan): string =>
  (span.quote || span.text || "").trim();

const sanitizeSpans = (spans: CoherenceSpan[] | undefined): CoherenceSpan[] => {
  if (!Array.isArray(spans)) return [];
  return spans
    .map((span) => {
      const text = span.text ?? span.quote;
      const quote = span.quote ?? span.text;
      return {
        ...span,
        ...(text !== undefined ? { text } : {}),
        ...(quote !== undefined ? { quote } : {}),
      };
    })
    .filter((span) => Boolean(summarizeSpan(span)));
};

interface SpanRange {
  start: number;
  end: number;
}

const buildCoverageRanges = (
  prompt: string,
  spans: CoherenceSpan[],
): SpanRange[] => {
  const ranges = spans
    .map((span) => {
      const start = Number.isFinite(span.start) ? Number(span.start) : null;
      const end = Number.isFinite(span.end) ? Number(span.end) : null;
      if (start === null || end === null || end <= start) {
        return null;
      }
      const safeStart = Math.max(0, Math.min(start, prompt.length));
      const safeEnd = Math.max(safeStart, Math.min(end, prompt.length));
      if (safeEnd <= safeStart) {
        return null;
      }
      return { start: safeStart, end: safeEnd };
    })
    .filter((range): range is SpanRange => Boolean(range))
    .sort((a, b) => a.start - b.start);

  const merged: SpanRange[] = [];
  ranges.forEach((range) => {
    const last = merged[merged.length - 1];
    if (!last || range.start > last.end) {
      merged.push({ ...range });
      return;
    }
    if (range.end > last.end) {
      last.end = range.end;
    }
  });

  return merged;
};

const splitPromptSentences = (
  prompt: string,
): Array<{ start: number; end: number; text: string }> => {
  const sentences: Array<{ start: number; end: number; text: string }> = [];
  SENTENCE_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = SENTENCE_REGEX.exec(prompt)) !== null) {
    const raw = match[0];
    if (!raw) {
      continue;
    }
    const leadingWhitespace = raw.match(/^\s*/)?.[0].length ?? 0;
    const trailingWhitespace = raw.match(/\s*$/)?.[0].length ?? 0;
    const start = match.index + leadingWhitespace;
    const end = match.index + raw.length - trailingWhitespace;
    if (end <= start) {
      continue;
    }
    const text = prompt.slice(start, end);
    if (!text) {
      continue;
    }
    sentences.push({ start, end, text });
  }

  return sentences;
};

const sentenceHasUncoveredText = (
  prompt: string,
  sentenceStart: number,
  sentenceEnd: number,
  coverage: SpanRange[],
): boolean => {
  if (sentenceEnd <= sentenceStart) return false;

  let cursor = sentenceStart;
  for (const range of coverage) {
    if (range.end <= sentenceStart) {
      continue;
    }
    if (range.start >= sentenceEnd) {
      break;
    }
    if (range.start > cursor) {
      const gapText = prompt.slice(cursor, Math.min(range.start, sentenceEnd));
      if (WORD_CHAR_REGEX.test(gapText)) {
        return true;
      }
    }
    cursor = Math.max(cursor, range.end);
    if (cursor >= sentenceEnd) {
      return false;
    }
  }

  if (cursor < sentenceEnd) {
    const gapText = prompt.slice(cursor, sentenceEnd);
    if (WORD_CHAR_REGEX.test(gapText)) {
      return true;
    }
  }

  return false;
};

const buildContextSpans = (
  prompt: string,
  spans: CoherenceSpan[],
): CoherenceSpan[] => {
  if (!prompt) return [];
  const sentences = splitPromptSentences(prompt);
  if (sentences.length === 0) return [];

  const coverage = buildCoverageRanges(prompt, spans);
  const seen = new Set(
    spans.map((span) => normalizeText(summarizeSpan(span))).filter(Boolean),
  );
  const contextSpans: CoherenceSpan[] = [];

  for (const sentence of sentences) {
    if (contextSpans.length >= MAX_CONTEXT_SPANS) {
      break;
    }
    if (sentence.text.length < MIN_CONTEXT_CHARS) {
      continue;
    }
    if (
      !sentenceHasUncoveredText(prompt, sentence.start, sentence.end, coverage)
    ) {
      continue;
    }
    const normalized = normalizeText(sentence.text);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    contextSpans.push({
      text: sentence.text,
      quote: sentence.text,
      start: sentence.start,
      end: sentence.end,
      source: "context",
    });
    seen.add(normalized);
  }

  return contextSpans;
};

export class PromptCoherenceService {
  constructor(private readonly ai: AIService) {}

  async checkCoherence({
    beforePrompt,
    afterPrompt,
    appliedChange,
    spans,
  }: CoherenceCheckParams): Promise<CoherenceResult> {
    const operation = "prompt-coherence-check";
    const cleanSpans = sanitizeSpans(spans);
    const contextSpans = buildContextSpans(afterPrompt, cleanSpans);
    const spansForCheck = [...cleanSpans, ...contextSpans];

    try {
      const llmResult = await this.runLlmCheck({
        beforePrompt,
        afterPrompt,
        spans: spansForCheck,
        ...(appliedChange !== undefined ? { appliedChange } : {}),
      });

      return llmResult;
    } catch (error) {
      log.warn("LLM coherence check failed; returning empty results", {
        operation,
        error: error instanceof Error ? error.message : String(error),
      });
      return { conflicts: [], harmonizations: [] };
    }
  }

  private async runLlmCheck(
    params: CoherenceCheckParams & { spans: CoherenceSpan[] },
  ): Promise<CoherenceResult> {
    const prompt = this.buildSystemPrompt(params);
    const temperature = TemperatureOptimizer.getOptimalTemperature("analysis", {
      diversity: "low",
      precision: "high",
    });
    const schema: StructuredOutputSchema = {
      type: "object",
      required: ["conflicts", "harmonizations"],
    };

    const result = (await StructuredOutputEnforcer.enforceJSON(
      this.ai,
      prompt,
      {
        operation: "prompt_coherence_check",
        schema,
        isArray: false,
        maxTokens: 2048,
        maxRetries: 2,
        temperature,
      },
    )) as CoherenceResult;

    return this.sanitizeResult(result, params.spans);
  }

  private buildSystemPrompt({
    beforePrompt,
    afterPrompt,
    appliedChange,
    spans,
  }: CoherenceCheckParams & { spans: CoherenceSpan[] }): string {
    const trimmedSpans = spans.slice(0, 60).map((span) => {
      const entry: Record<string, string> = {
        text: summarizeSpan(span).slice(0, 200),
      };
      if (span.id) {
        entry.id = span.id;
      }
      if (span.category) {
        entry.category = span.category;
      }
      if (span.source) {
        entry.source = span.source;
      }
      return entry;
    });

    return `You are a prompt coherence auditor.
Your job: After a user applies a change, check the full after prompt for contradictions or optional harmonizations.

Return JSON only with this shape:
{
  "conflicts": [
    {
      "severity": "low" | "medium" | "high",
      "message": "Short description",
      "reasoning": "Why this is a conflict",
      "involvedSpanIds": ["spanIdA", "spanIdB"],
      "recommendations": [
        {
          "title": "Fix title",
          "rationale": "Why this edit helps",
          "confidence": 0-1,
          "edits": [
            { "type": "replaceSpanText", "spanId": "spanId", "replacementText": "..." },
            { "type": "removeSpan", "spanId": "spanId" }
          ]
        }
      ]
    }
  ],
  "harmonizations": [
    {
      "message": "Optional improvement",
      "reasoning": "Why it helps",
      "involvedSpanIds": ["spanIdX"],
      "recommendations": [
        {
          "title": "Adjustment title",
          "rationale": "Why this edit helps",
          "confidence": 0-1,
          "edits": [
            { "type": "replaceSpanText", "spanId": "spanId", "replacementText": "..." }
          ]
        }
      ]
    }
  ]
}

Rules:
- Conflicts are true contradictions (e.g., day vs night, indoor vs outdoor, underwater vs fire, or mismatched subject attributes like age/gender).
- Harmonizations are optional consistency upgrades (mood, palette, era, lens language).
- Prefer edits that adjust conflicting text rather than undoing the applied change.
- Scan the full after prompt for any inconsistencies across entities, attributes, actions, environment, time, physical constraints, and references (including pronouns/possessives).
- The span list is incomplete and optional. Do NOT limit your analysis to spans.
- Use span IDs only when the conflicting text is fully contained in a provided span; never invent span IDs.
- For any text outside spans, include anchorQuote with enough surrounding words to locate the text.
- Anchor quotes must be exact substrings from the after prompt.
- If the same inconsistency appears in multiple locations, include edits for each location.
- Return empty arrays if nothing is needed.

Input data:
Before prompt: """${beforePrompt}"""
After prompt (authoritative full text): """${afterPrompt}"""
Applied change: ${JSON.stringify(appliedChange ?? {}, null, 2)}
Span hints (incomplete): ${JSON.stringify(trimmedSpans, null, 2)}`;
  }

  private sanitizeResult(
    result: CoherenceResult,
    spans: CoherenceSpan[],
  ): CoherenceResult {
    const spanIds = new Set(
      spans.map((span) => span.id).filter(Boolean) as string[],
    );
    const normalizeFindings = (
      findings: CoherenceFinding[],
    ): CoherenceFinding[] =>
      findings
        .filter((finding) => Array.isArray(finding.recommendations))
        .map((finding) => {
          const involvedSpanIds = Array.isArray(finding.involvedSpanIds)
            ? finding.involvedSpanIds.filter((id) => spanIds.has(id))
            : [];
          const recommendations = finding.recommendations
            .map((rec) => ({
              ...rec,
              edits: Array.isArray(rec.edits)
                ? rec.edits
                    .map((edit) => {
                      if (edit.spanId && !spanIds.has(edit.spanId)) {
                        if (edit.anchorQuote) {
                          const { spanId: _spanId, ...rest } = edit;
                          return rest as CoherenceEdit;
                        }
                        return null;
                      }
                      return edit;
                    })
                    .filter((edit): edit is CoherenceEdit => Boolean(edit))
                    .filter((edit) => {
                      if (edit.type === "replaceSpanText") {
                        if (!edit.replacementText) return false;
                      }
                      return Boolean(edit.spanId || edit.anchorQuote);
                    })
                : [],
            }))
            .filter((rec) => rec.edits.length > 0);
          return {
            ...finding,
            ...(involvedSpanIds.length > 0 ? { involvedSpanIds } : {}),
            recommendations,
          };
        })
        .filter((finding) => finding.recommendations.length > 0);

    return {
      conflicts: normalizeFindings(result.conflicts || []),
      harmonizations: normalizeFindings(result.harmonizations || []),
    };
  }
}
