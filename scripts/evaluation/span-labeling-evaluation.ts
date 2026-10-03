#!/usr/bin/env tsx

/**
 * Span Labeling Evaluation Script
 *
 * Uses real production prompts + LLM-as-Judge evaluation.
 * No ground truth annotation required.
 *
 * Usage:
 *   npx tsx scripts/evaluation/span-labeling-evaluation.ts [--prompts-file path] [--sample N]
 *
 * Options:
 *   --prompts-file  Path to JSON file with input/output pairs (default: finds latest)
 *   --sample N      Only evaluate N random prompts (default: all)
 *   --baseline      Lock current results as baseline
 *   --concurrency N Number of concurrent requests (default: 10)
 *   --fast          Use gpt-4o-mini for judging (faster, cheaper)
 */

import { DEFAULT_GROQ_MODEL } from "../../server/src/config/llmModelDefaults";
import { config as loadEnv } from "dotenv";
import { z } from "zod";

import { existsSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { labelSpans } from "../../server/src/llm/span-labeling/SpanLabelingService.js";
import { AIModelService } from "../../server/src/services/ai-model/AIModelService.js";
import { OpenAICompatibleAdapter } from "../../server/src/clients/adapters/OpenAICompatibleAdapter.js";
import { warmupNlpServices } from "../../server/src/llm/span-labeling/nlp/NlpSpanService.js";
import { VALID_CATEGORIES } from "../../shared/taxonomy.js";
import {
  CATEGORY_NAMES,
  FALSE_POSITIVE_REASONS,
  GRANULARITY_ERROR_TYPES,
  MISSED_SEVERITIES,
  SECTION_NAMES,
  type CategoryScores,
  type ConfidenceAnalysis,
  type ErrorsBySection,
  type EvaluationDataset,
  type EvaluationResult,
  type FalsePositive,
  type FalsePositiveReasonCounts,
  type FalsePositivesByReason,
  type LegacyJudgeResult,
  type PromptRecord,
  type PromptSections,
  type SectionName,
  type Snapshot,
  type SpanLabelingMeta,
  type SpanResult,
  type EnhancedJudgeResult,
  type AnyJudgeResult,
} from "./types.js";
import { createEvalEmitter, resolveDistinctId } from "./posthog-emitter.js";
import type { Outcome, SpanLabelingJudgeMetrics } from "./eval-event-types.js";

const mainStartedAt = Date.now();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

loadEnv({ path: join(__dirname, "../..", ".env") });

const SNAPSHOTS_DIR = join(__dirname, "snapshots");

// =============================================================================
// LLM Judge Rubric
// =============================================================================

const VALID_ROLE_LIST = [...VALID_CATEGORIES].sort();

const JUDGE_SYSTEM_PROMPT = `You are evaluating span labeling quality for video prompts.

A span is a "visual control point" - a phrase that, if changed, would produce a visually different video.

## Prompt Structure

The prompts have THREE sections:
1. **Main paragraph**: Dense description of the primary shot (shot type, subject, action, environment, lighting, camera, style)
2. **TECHNICAL SPECS section**: Bulleted list with Duration, Aspect Ratio, Frame Rate, Audio, Camera, Lighting, Style
3. **ALTERNATIVE APPROACHES section**: 2 variations describing alternate shots (different angles, lighting, etc.)

Section headers like "**TECHNICAL SPECS**" and "**ALTERNATIVE APPROACHES**" are NOT visual content and should NOT be extracted.
Variation labels like "**Variation 1 (Alternate Angle):**" are headers, not content.
BUT the actual content within alternatives (e.g., "high-angle shot", "golden hour lighting") ARE visual control points and SHOULD be extracted.

## Evaluation Criteria (score each 1-5)

1. Coverage (1-5): Did it extract ALL visual control points from ALL sections?
   - Main: Shot type, subjects, subject actions (physical movements BY subjects), environments, lighting, camera movements, style
   - Technical Specs: Duration, fps/frame rate, aspect ratio, audio description, camera settings, lighting setup, style reference
   - Alternatives: Shot types, angles, lighting variations described in alternative approaches
   - Note: "actions" = what subjects physically DO (running, gazing). Framing/continuity = camera category.
   - 5 = Comprehensive across all sections
   - 1 = Major elements missing

2. Precision (1-5): Did it correctly SKIP abstract/non-renderable content?
   - Skip: "determination", "inviting the viewer", "enhancing authenticity", section headers, variation labels
   - Include: "focused demeanor" (visible expression), "gripping" (visible action)
   - 5 = Only extracted renderable elements
   - 1 = Extracted many abstract concepts or headers

3. Granularity (1-5): Are span boundaries correct?
   - Not too fine: "soft" + "highlights" should be "soft highlights"
   - Not too coarse: Do not merge unrelated elements
   - 5 = All boundaries appropriate
   - 1 = Many boundary errors

4. Taxonomy (1-5): Are roles assigned correctly?
   - camera.movement vs action.movement
   - shot.type vs camera.angle
   - technical.duration vs technical.framerate
   - 5 = All roles correct
   - 1 = Many misclassifications

5. Technical Specs (1-5): Did it extract format parameters from the TECHNICAL SPECS section?
   - Duration (e.g., "6s"), Frame Rate (e.g., "60fps"), Aspect Ratio (e.g., "16:9")
   - Audio description, Camera settings (lens, aperture), Lighting setup, Style reference
   - 5 = All specs extracted with correct roles
   - 1 = Specs ignored or misclassified

## Error Types (diagnostics)

- missedElements: visual elements present in the prompt that were not extracted.
  - Provide: text, expectedRole (taxonomy role), category, severity.
  - category must be EXACTLY one of: shot, subject, action, environment, lighting, camera, style, technical, audio.
  - severity must be EXACTLY one of: critical, important, minor.
  - CATEGORY DEFINITIONS:
    - action = ONLY physical movements/gestures by subjects (running, jumping, waving, gazing)
    - camera = camera movement, framing, angles, continuity (pan, zoom, consistent framing, subject continuity)
    - shot = shot type/composition (close-up, wide shot, establishing shot)
  - "consistent framing and subject continuity" → category: "camera", NOT "action"
  - "maintain visual flow" → category: "camera" or "style", NOT "action"
  - Example: { "text": "red leather jacket", "expectedRole": "subject.wardrobe", "category": "subject", "severity": "important" }
  - Example: { "text": "high-angle shot", "expectedRole": "camera.angle", "category": "camera", "severity": "important" } (from alternatives section)
  - Example: { "text": "60fps", "expectedRole": "technical.framerate", "category": "technical", "severity": "important" } (from tech specs)

- falsePositives: extracted spans that should NOT have been extracted.
  - Provide: text, assignedRole, reason, spanIndex.
  - spanIndex is the 0-based index of the extracted span; use null if no match.
  - reason must be EXACTLY one of: section_header, abstract_concept, non_visual, instruction_text, duplicate, other.
  - Section headers include: "TECHNICAL SPECS", "ALTERNATIVE APPROACHES", "Variation 1", "Variation 2", field labels like "Duration:", "Frame Rate:"
  - Example: { "text": "TECHNICAL SPECS", "assignedRole": "technical", "reason": "section_header", "spanIndex": 12 }
  - Example: { "text": "Variation 1 (Alternate Angle)", "assignedRole": "shot.type", "reason": "section_header", "spanIndex": 8 }
  - Example: { "text": "emotional resonance", "assignedRole": "style.mood", "reason": "abstract_concept", "spanIndex": 4 }

- taxonomyErrors: extracted spans with the wrong role.
  - Provide: text, assignedRole, expectedRole, spanIndex.
  - spanIndex is the 0-based index of the extracted span; use null if no match.
  - Example: { "text": "slow pan", "assignedRole": "action.movement", "expectedRole": "camera.movement", "spanIndex": 7 }

- granularityErrors: span boundary issues (too fine or too coarse).
  - Provide: text, spanIndex, reason.
  - spanIndex is the 0-based index of the extracted span; use null if no match.
  - reason must be EXACTLY one of: too_fine, too_coarse, other.
  - Example: { "text": "soft highlights", "spanIndex": 15, "reason": "too_fine" }
  - Example: { "text": "man in red jacket walking in rain", "spanIndex": 3, "reason": "too_coarse" }

## Category Scores (coverage and precision, 1-5 each)

Return categoryScores for: shot, subject, action, environment, lighting, camera, style, technical, audio.

## Valid Taxonomy Roles

Use ONLY the following roles (exact strings). If uncertain, choose the closest valid role:
${VALID_ROLE_LIST.join(", ")}

## Response Format

Return ONLY valid JSON with double quotes and no trailing commas.
If there are many items, include the 12 most impactful (critical and important first).
If there are no items for a list, return an empty array.

{
  "scores": {
    "coverage": <1-5>,
    "precision": <1-5>,
    "granularity": <1-5>,
    "taxonomy": <1-5>,
    "technicalSpecs": <1-5>
  },
  "totalScore": <sum of above, max 25>,
  "missedElements": [
    {
      "text": "...",
      "expectedRole": "...",
      "category": "shot|subject|action|environment|lighting|camera|style|technical|audio",
      "severity": "critical|important|minor"
    }
  ],
  "falsePositives": [
    {
      "text": "...",
      "assignedRole": "...",
      "reason": "section_header|abstract_concept|non_visual|instruction_text|duplicate|other",
      "spanIndex": 0
    }
  ],
  "taxonomyErrors": [
    {
      "text": "...",
      "assignedRole": "...",
      "expectedRole": "...",
      "spanIndex": 0
    }
  ],
  "granularityErrors": [
    {
      "text": "...",
      "spanIndex": 0,
      "reason": "too_fine|too_coarse|other"
    }
  ],
  "categoryScores": {
    "shot": { "coverage": <1-5>, "precision": <1-5> },
    "subject": { "coverage": <1-5>, "precision": <1-5> },
    "action": { "coverage": <1-5>, "precision": <1-5> },
    "environment": { "coverage": <1-5>, "precision": <1-5> },
    "lighting": { "coverage": <1-5>, "precision": <1-5> },
    "camera": { "coverage": <1-5>, "precision": <1-5> },
    "style": { "coverage": <1-5>, "precision": <1-5> },
    "technical": { "coverage": <1-5>, "precision": <1-5> },
    "audio": { "coverage": <1-5>, "precision": <1-5> }
  },
  "notes": "brief explanation of scoring"
}`;

const SCORE_SCHEMA = z.coerce.number();
const SpanIndexSchema = z.preprocess((value) => {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return value;
}, z.number().int().min(-1).nullable());
const JudgeScoresSchema = z.object({
  coverage: SCORE_SCHEMA,
  precision: SCORE_SCHEMA,
  granularity: SCORE_SCHEMA,
  taxonomy: SCORE_SCHEMA,
  technicalSpecs: SCORE_SCHEMA,
});
const MissedElementSchema = z.object({
  text: z.string().min(1),
  expectedRole: z.string().min(1),
  category: z.string().min(1),
  severity: z.enum(MISSED_SEVERITIES),
});
const FalsePositiveSchema = z.object({
  text: z.string().min(1),
  assignedRole: z.string().min(1),
  reason: z.enum(FALSE_POSITIVE_REASONS),
  spanIndex: SpanIndexSchema.optional(),
});
const TaxonomyErrorSchema = z.object({
  text: z.string().min(1),
  assignedRole: z.string().min(1),
  expectedRole: z.string().min(1),
  spanIndex: SpanIndexSchema.optional(),
});
const GranularityErrorSchema = z.object({
  text: z.string().min(1),
  spanIndex: SpanIndexSchema.optional(),
  reason: z.enum(GRANULARITY_ERROR_TYPES),
});
const CategoryScoreSchema = z.object({
  coverage: SCORE_SCHEMA,
  precision: SCORE_SCHEMA,
});
const CategoryScoresSchema = z
  .object({
    shot: CategoryScoreSchema.optional(),
    subject: CategoryScoreSchema.optional(),
    action: CategoryScoreSchema.optional(),
    environment: CategoryScoreSchema.optional(),
    lighting: CategoryScoreSchema.optional(),
    camera: CategoryScoreSchema.optional(),
    style: CategoryScoreSchema.optional(),
    technical: CategoryScoreSchema.optional(),
    audio: CategoryScoreSchema.optional(),
  })
  .partial();
const EnhancedJudgeResultSchema = z.object({
  scores: JudgeScoresSchema,
  totalScore: z.coerce.number().optional(),
  missedElements: z.array(MissedElementSchema).optional(),
  falsePositives: z.array(FalsePositiveSchema).optional(),
  taxonomyErrors: z.array(TaxonomyErrorSchema).optional(),
  granularityErrors: z.array(GranularityErrorSchema).optional(),
  categoryScores: CategoryScoresSchema.optional(),
  notes: z.string().optional(),
});
const LegacyJudgeResultSchema = z.object({
  scores: JudgeScoresSchema,
  totalScore: z.coerce.number().optional(),
  missedElements: z.array(z.string()).optional(),
  incorrectExtractions: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

/**
 * OpenAI Structured Outputs Schema (Strict Mode)
 */
const JUDGE_JSON_SCHEMA = {
  type: "object",
  properties: {
    scores: {
      type: "object",
      properties: {
        coverage: { type: "number" },
        precision: { type: "number" },
        granularity: { type: "number" },
        taxonomy: { type: "number" },
        technicalSpecs: { type: "number" },
      },
      required: [
        "coverage",
        "precision",
        "granularity",
        "taxonomy",
        "technicalSpecs",
      ],
      additionalProperties: false,
    },
    totalScore: { type: "number" },
    missedElements: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          expectedRole: { type: "string" },
          category: { type: "string", enum: [...CATEGORY_NAMES, "unknown"] },
          severity: { type: "string", enum: MISSED_SEVERITIES },
        },
        required: ["text", "expectedRole", "category", "severity"],
        additionalProperties: false,
      },
    },
    falsePositives: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          assignedRole: { type: "string" },
          reason: { type: "string", enum: FALSE_POSITIVE_REASONS },
          spanIndex: { type: ["number", "null"] },
        },
        required: ["text", "assignedRole", "reason", "spanIndex"],
        additionalProperties: false,
      },
    },
    taxonomyErrors: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          assignedRole: { type: "string" },
          expectedRole: { type: "string" },
          spanIndex: { type: ["number", "null"] },
        },
        required: ["text", "assignedRole", "expectedRole", "spanIndex"],
        additionalProperties: false,
      },
    },
    granularityErrors: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          spanIndex: { type: ["number", "null"] },
          reason: { type: "string", enum: GRANULARITY_ERROR_TYPES },
        },
        required: ["text", "spanIndex", "reason"],
        additionalProperties: false,
      },
    },
    categoryScores: {
      type: "object",
      properties: Object.fromEntries(
        CATEGORY_NAMES.map((cat) => [
          cat,
          {
            type: "object",
            properties: {
              coverage: { type: "number" },
              precision: { type: "number" },
            },
            required: ["coverage", "precision"],
            additionalProperties: false,
          },
        ]),
      ),
      required: [...CATEGORY_NAMES],
      additionalProperties: false,
    },
    notes: { type: "string" },
  },
  required: [
    "scores",
    "totalScore",
    "missedElements",
    "falsePositives",
    "taxonomyErrors",
    "granularityErrors",
    "categoryScores",
    "notes",
  ],
  additionalProperties: false,
};

function createEmptyCategoryScores(): CategoryScores {
  return {
    shot: { coverage: 0, precision: 0 },
    subject: { coverage: 0, precision: 0 },
    action: { coverage: 0, precision: 0 },
    environment: { coverage: 0, precision: 0 },
    lighting: { coverage: 0, precision: 0 },
    camera: { coverage: 0, precision: 0 },
    style: { coverage: 0, precision: 0 },
    technical: { coverage: 0, precision: 0 },
    audio: { coverage: 0, precision: 0 },
  };
}

function createEmptyFalsePositiveReasons(): FalsePositiveReasonCounts {
  return {
    section_header: 0,
    abstract_concept: 0,
    non_visual: 0,
    instruction_text: 0,
    duplicate: 0,
    other: 0,
  };
}

function createEmptyFalsePositiveExamples(): FalsePositivesByReason {
  return {
    section_header: [],
    abstract_concept: [],
    non_visual: [],
    instruction_text: [],
    duplicate: [],
    other: [],
  };
}

function createEmptyErrorsBySection(): ErrorsBySection {
  return {
    main: { falsePositives: 0, missed: 0 },
    technicalSpecs: { falsePositives: 0, missed: 0 },
    alternatives: { falsePositives: 0, missed: 0 },
  };
}

function clampScore(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(5, Math.round(value * 100) / 100));
}

function normalizeScores(
  scores: EnhancedJudgeResult["scores"],
): EnhancedJudgeResult["scores"] {
  return {
    coverage: clampScore(scores.coverage),
    precision: clampScore(scores.precision),
    granularity: clampScore(scores.granularity),
    taxonomy: clampScore(scores.taxonomy),
    technicalSpecs: clampScore(scores.technicalSpecs),
  };
}

function normalizeCategoryScores(
  input?: Partial<CategoryScores>,
): CategoryScores {
  const normalized = createEmptyCategoryScores();
  if (!input) {
    return normalized;
  }
  for (const category of CATEGORY_NAMES) {
    const entry = input[category];
    if (!entry) continue;
    normalized[category] = {
      coverage: clampScore(entry.coverage),
      precision: clampScore(entry.precision),
    };
  }
  return normalized;
}

function isEnhancedResult(result: AnyJudgeResult): boolean {
  const candidate = result as Partial<EnhancedJudgeResult>;
  if (
    Array.isArray(candidate.falsePositives) ||
    Array.isArray(candidate.taxonomyErrors)
  ) {
    return true;
  }
  if (Array.isArray(candidate.granularityErrors)) {
    return true;
  }
  if (
    candidate.categoryScores &&
    typeof candidate.categoryScores === "object"
  ) {
    return true;
  }
  if (
    Array.isArray(candidate.missedElements) &&
    candidate.missedElements.length > 0
  ) {
    const first = candidate.missedElements[0] as { text?: unknown } | string;
    return typeof first === "object" && first !== null && "text" in first;
  }
  return false;
}

function normalizeJudgeResult(
  result: AnyJudgeResult,
  assumeEnhanced = false,
): EnhancedJudgeResult {
  const scores = normalizeScores(result.scores);
  const totalScore =
    scores.coverage +
    scores.precision +
    scores.granularity +
    scores.taxonomy +
    scores.technicalSpecs;
  const notes = "notes" in result && result.notes ? result.notes : "";

  if (assumeEnhanced || isEnhancedResult(result)) {
    const enhanced = result as Partial<EnhancedJudgeResult>;
    return {
      scores,
      totalScore,
      missedElements: enhanced.missedElements ?? [],
      falsePositives: enhanced.falsePositives ?? [],
      taxonomyErrors: enhanced.taxonomyErrors ?? [],
      granularityErrors: enhanced.granularityErrors ?? [],
      categoryScores: normalizeCategoryScores(enhanced.categoryScores),
      notes,
    };
  }

  const legacy = result as LegacyJudgeResult;
  return {
    scores,
    totalScore,
    missedElements: (legacy.missedElements ?? []).map((text) => ({
      text,
      expectedRole: "unknown",
      category: "unknown",
      severity: "minor",
    })),
    falsePositives: (legacy.incorrectExtractions ?? []).map((text) => ({
      text,
      assignedRole: "unknown",
      reason: "other",
    })),
    taxonomyErrors: [],
    granularityErrors: [],
    categoryScores: createEmptyCategoryScores(),
    notes,
  };
}

function parseJudgeResponse(content: string): EnhancedJudgeResult {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON in judge response");
  }

  const parsed = JSON.parse(jsonMatch[0]);

  const enhanced = EnhancedJudgeResultSchema.safeParse(parsed);
  if (enhanced.success) {
    return normalizeJudgeResult(enhanced.data, true);
  }

  const legacy = LegacyJudgeResultSchema.safeParse(parsed);
  if (legacy.success) {
    return normalizeJudgeResult(legacy.data, false);
  }

  console.error(
    "Judge schema validation failed:",
    JSON.stringify(enhanced.error.format(), null, 2),
  );
  console.error("Parsed object:", JSON.stringify(parsed, null, 2));
  throw new Error("Judge response did not match expected schemas");
}

function findHeaderIndex(text: string, regex: RegExp): number | null {
  const match = text.match(regex);
  return typeof match?.index === "number" ? match.index : null;
}

function detectSections(promptText: string): PromptSections {
  const technicalIndex = findHeaderIndex(
    promptText,
    /(^|\n)\s*\*\*\s*(technical specs|technical specifications)\s*\*\*/i,
  );
  const alternativesIndex = findHeaderIndex(
    promptText,
    /(^|\n)\s*\*\*\s*(alternative[^*]*|variations)\s*\*\*/i,
  );

  const headers: Array<{ key: SectionName; index: number }> = [];
  if (technicalIndex !== null) {
    headers.push({ key: "technicalSpecs", index: technicalIndex });
  }
  if (alternativesIndex !== null) {
    headers.push({ key: "alternatives", index: alternativesIndex });
  }

  headers.sort((a, b) => a.index - b.index);

  const mainEnd = headers.length > 0 ? headers[0].index : promptText.length;
  const sections: PromptSections = {
    main: { start: 0, end: mainEnd },
    technicalSpecs: null,
    alternatives: null,
  };

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    const end =
      i + 1 < headers.length ? headers[i + 1].index : promptText.length;
    if (header.key === "technicalSpecs") {
      sections.technicalSpecs = { start: header.index, end };
    } else if (header.key === "alternatives") {
      sections.alternatives = { start: header.index, end };
    }
  }

  return sections;
}

function getSectionForOffset(
  offset: number,
  sections: PromptSections,
): SectionName {
  if (
    sections.technicalSpecs &&
    offset >= sections.technicalSpecs.start &&
    offset < sections.technicalSpecs.end
  ) {
    return "technicalSpecs";
  }
  if (
    sections.alternatives &&
    offset >= sections.alternatives.start &&
    offset < sections.alternatives.end
  ) {
    return "alternatives";
  }
  return "main";
}

function getSectionForText(
  text: string,
  promptText: string,
  sections: PromptSections,
): SectionName {
  const normalizedPrompt = promptText.toLowerCase();
  const normalizedText = text.trim().toLowerCase();
  if (!normalizedText) {
    return "main";
  }
  const index = normalizedPrompt.indexOf(normalizedText);
  if (index === -1) {
    return "main";
  }
  return getSectionForOffset(index, sections);
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function matchFalsePositivesToSpans(
  spans: SpanResult[],
  falsePositives: FalsePositive[],
): {
  matches: Array<{ fp: FalsePositive; spanIndex: number | null }>;
  matchedIndexes: Set<number>;
  unmatchedCount: number;
} {
  const spanIndexByText = new Map<string, number[]>();
  spans.forEach((span, index) => {
    const key = normalizeText(span.text);
    if (!key) return;
    const list = spanIndexByText.get(key) ?? [];
    list.push(index);
    spanIndexByText.set(key, list);
  });

  const usedIndexes = new Set<number>();
  const matchedIndexes = new Set<number>();
  const matches: Array<{ fp: FalsePositive; spanIndex: number | null }> = [];
  let unmatchedCount = 0;

  for (const fp of falsePositives) {
    const key = normalizeText(fp.text);
    const candidates = key ? spanIndexByText.get(key) : undefined;
    let matchedIndex: number | null = null;

    if (
      typeof fp.spanIndex === "number" &&
      Number.isFinite(fp.spanIndex) &&
      fp.spanIndex >= 0 &&
      fp.spanIndex < spans.length
    ) {
      matchedIndex = fp.spanIndex;
    } else if (candidates) {
      for (const idx of candidates) {
        if (!usedIndexes.has(idx)) {
          matchedIndex = idx;
          break;
        }
      }
    }

    if (matchedIndex === null) {
      unmatchedCount++;
      matches.push({ fp, spanIndex: null });
      continue;
    }

    usedIndexes.add(matchedIndex);
    matchedIndexes.add(matchedIndex);
    matches.push({ fp, spanIndex: matchedIndex });
  }

  return { matches, matchedIndexes, unmatchedCount };
}

function computeConfidenceAnalysis(
  results: EvaluationResult[],
): ConfidenceAnalysis {
  const buckets = {
    high: {
      range: [0.8, 1.0] as [number, number],
      total: 0,
      errors: 0,
      errorRate: 0,
      examples: [] as string[],
    },
    medium: {
      range: [0.6, 0.8] as [number, number],
      total: 0,
      errors: 0,
      errorRate: 0,
      examples: [] as string[],
    },
    low: {
      range: [0.0, 0.6] as [number, number],
      total: 0,
      errors: 0,
      errorRate: 0,
      examples: [] as string[],
    },
  };

  let unmatchedFalsePositives = 0;
  let totalFalsePositives = 0;

  for (const result of results) {
    if (!result.judgeResult) continue;
    const judgeResult = normalizeJudgeResult(result.judgeResult);
    const { matchedIndexes, unmatchedCount } = matchFalsePositivesToSpans(
      result.spans,
      judgeResult.falsePositives,
    );

    unmatchedFalsePositives += unmatchedCount;
    totalFalsePositives += judgeResult.falsePositives.length;

    result.spans.forEach((span, index) => {
      const confidence = Number.isFinite(span.confidence) ? span.confidence : 0;
      const bucket =
        confidence >= 0.8
          ? buckets.high
          : confidence >= 0.6
            ? buckets.medium
            : buckets.low;
      bucket.total += 1;
      if (matchedIndexes.has(index)) {
        bucket.errors += 1;
        if (bucket.examples.length < 3) {
          bucket.examples.push(`"${span.text}" (${span.role})`);
        }
      }
    });
  }

  for (const bucket of Object.values(buckets)) {
    bucket.errorRate = bucket.total > 0 ? bucket.errors / bucket.total : 0;
  }

  let recommendedThreshold: number | null = null;
  const notes: string[] = [];

  if (
    buckets.medium.total >= 5 &&
    buckets.medium.errorRate - buckets.high.errorRate >= 0.2
  ) {
    recommendedThreshold = 0.8;
  } else if (
    buckets.low.total >= 5 &&
    buckets.low.errorRate - buckets.medium.errorRate >= 0.2
  ) {
    recommendedThreshold = 0.6;
  }

  if (totalFalsePositives === 0) {
    notes.push("No false positives to analyze.");
  }
  if (unmatchedFalsePositives > 0) {
    notes.push(
      `${unmatchedFalsePositives} false positives could not be matched to spans.`,
    );
  }
  if (!recommendedThreshold) {
    notes.push("No clear confidence threshold recommendation.");
  }

  return {
    buckets,
    recommendedThreshold,
    notes: notes.join(" ").trim(),
  } as ConfidenceAnalysis;
}

function formatSpansForJudge(spans: SpanResult[]): string {
  if (spans.length === 0) {
    return "(none)";
  }

  return spans
    .map((span, index) => {
      const confidence = Number.isFinite(span.confidence)
        ? span.confidence.toFixed(2)
        : "0.00";
      const text = span.text.replace(/\s+/g, " ").trim();
      const section = span.section ?? "main";
      return `[${index}] "${text}" (${span.role}, ${confidence}, start=${span.start}, end=${span.end}, section=${section})`;
    })
    .join("\n");
}

// =============================================================================
// AI Service Setup
// =============================================================================

function createAIService(): AIModelService {
  const clients: Record<string, any> = {};
  const groqTimeoutMs = Number(process.env.GROQ_TIMEOUT_MS || 5000);
  const openaiTimeoutMs = Number(process.env.OPENAI_TIMEOUT_MS || 60000);
  const groqModel = process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL;
  const openaiModel = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const groqBaseURL =
    process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
  const openaiBaseURL =
    process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

  if (process.env.GROQ_API_KEY) {
    clients.groq = new OpenAICompatibleAdapter({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: groqBaseURL,
      defaultModel: groqModel,
      defaultTimeout: groqTimeoutMs,
      providerName: "groq",
    });
  }

  if (process.env.OPENAI_API_KEY) {
    clients.openai = new OpenAICompatibleAdapter({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: openaiBaseURL,
      defaultModel: openaiModel,
      defaultTimeout: openaiTimeoutMs,
      providerName: "openai",
    });
  }

  if (!clients.openai && clients.groq) {
    clients.openai = clients.groq;
  }

  if (Object.keys(clients).length === 0) {
    throw new Error("No AI API keys found. Set GROQ_API_KEY or OPENAI_API_KEY");
  }

  return new AIModelService({ clients });
}

/**
 * Create a dedicated judge client for LLM-as-Judge evaluation.
 */
function createJudgeClient(useFastModel = false): OpenAICompatibleAdapter {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY required for LLM-as-Judge");
  }

  const model = useFastModel
    ? "gpt-4o-mini"
    : process.env.OPENAI_JUDGE_MODEL || "gpt-4o";

  return new OpenAICompatibleAdapter({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    defaultModel: model,
    defaultTimeout: Number(process.env.OPENAI_TIMEOUT_MS || 60000),
    providerName: "openai-judge",
  });
}

// =============================================================================
// LLM Judge (GPT-4o)
// =============================================================================

async function judgeSpanQuality(
  prompt: string,
  spans: SpanResult[],
  judgeClient: OpenAICompatibleAdapter,
): Promise<EnhancedJudgeResult> {
  let content = "";
  const userMessage = `## Original Prompt
${prompt}

## Extracted Spans (${spans.length} total)
${formatSpansForJudge(spans)}

Span indices are 0-based and must be used in spanIndex fields.

Evaluate the span extraction quality using the rubric. Return only JSON.`;

  try {
    // OpenAICompatibleAdapter.complete(systemPrompt: string, options: CompletionOptions)
    // When options.messages is provided, systemPrompt is ignored, so include system in messages
    const response = await judgeClient.complete("", {
      messages: [
        { role: "system", content: JUDGE_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      schema: JUDGE_JSON_SCHEMA,
    });

    content = response.content || response.text || "";
    return parseJudgeResponse(content);
  } catch (error) {
    console.error("Judge error:", error);
    console.error("Failed to parse judge response content:", content);
    return {
      scores: {
        coverage: 0,
        precision: 0,
        granularity: 0,
        taxonomy: 0,
        technicalSpecs: 0,
      },
      totalScore: 0,
      missedElements: [],
      falsePositives: [],
      taxonomyErrors: [],
      granularityErrors: [],
      categoryScores: createEmptyCategoryScores(),
      notes: `Judge failed: ${(error as Error).message}`,
    };
  }
}

// =============================================================================
// Main Evaluation
// =============================================================================

async function evaluatePrompt(
  record: PromptRecord,
  aiService: AIModelService,
  judgeClient: OpenAICompatibleAdapter,
): Promise<EvaluationResult> {
  const startTime = Date.now();

  try {
    // Run span labeling
    const response = await labelSpans(
      {
        text: record.output,
        maxSpans: 50,
        minConfidence: 0.5,
        templateVersion: "v3.0",
      },
      aiService,
    );

    const sections = detectSections(record.output);

    // Capture spans with offsets
    const spans: SpanResult[] = (response.spans || []).map((s: any) => {
      const start = s.start ?? 0;
      return {
        text: s.text,
        role: s.role,
        confidence: s.confidence ?? 0,
        start,
        end: s.end ?? 0,
        section: getSectionForOffset(start, sections),
      };
    });

    // Capture meta for source tracking
    const meta: SpanLabelingMeta = {
      version: response.meta?.version || "unknown",
      notes: response.meta?.notes || "",
      source: (response.meta as any)?.source,
      closedVocab: (response.meta as any)?.closedVocab,
      openVocab: (response.meta as any)?.openVocab,
      latency: (response.meta as any)?.latency,
      tier1Latency: (response.meta as any)?.tier1Latency,
      tier2Latency: (response.meta as any)?.tier2Latency,
    };

    // Run LLM judge (GPT-4o)
    const judgeResult = await judgeSpanQuality(
      record.output,
      spans,
      judgeClient,
    );

    return {
      promptId: record.id,
      input: record.input,
      output: record.output,
      spanCount: spans.length,
      spans,
      meta,
      judgeResult,
      error: null,
      latencyMs: Date.now() - startTime,
      sections,
    };
  } catch (error) {
    return {
      promptId: record.id,
      input: record.input,
      output: record.output,
      spanCount: 0,
      spans: [],
      meta: null,
      judgeResult: null,
      error: (error as Error).message,
      latencyMs: Date.now() - startTime,
    };
  }
}

function computeSummary(results: EvaluationResult[]): Snapshot["summary"] {
  const successfulResults = results.filter(
    (r) => r.judgeResult && r.judgeResult.totalScore > 0,
  );

  const avgScore =
    successfulResults.length > 0
      ? successfulResults.reduce(
          (sum, r) => sum + (r.judgeResult?.totalScore || 0),
          0,
        ) / successfulResults.length
      : 0;

  const avgSpanCount =
    results.reduce((sum, r) => sum + r.spanCount, 0) / results.length;

  const scoreDistribution: Record<string, number> = {
    "excellent (23-25)": 0,
    "good (18-22)": 0,
    "acceptable (13-17)": 0,
    "poor (8-12)": 0,
    "failing (0-7)": 0,
  };

  for (const r of successfulResults) {
    const score = r.judgeResult?.totalScore || 0;
    if (score >= 23) scoreDistribution["excellent (23-25)"]++;
    else if (score >= 18) scoreDistribution["good (18-22)"]++;
    else if (score >= 13) scoreDistribution["acceptable (13-17)"]++;
    else if (score >= 8) scoreDistribution["poor (8-12)"]++;
    else scoreDistribution["failing (0-7)"]++;
  }

  const allMissed: string[] = [];
  const allIncorrect: string[] = [];
  const falsePositiveReasons = createEmptyFalsePositiveReasons();
  const falsePositiveExamples = createEmptyFalsePositiveExamples();
  const errorsBySection = createEmptyErrorsBySection();
  const confidenceAnalysis = computeConfidenceAnalysis(successfulResults);

  const taxonomyErrorCounts = new Map<
    string,
    {
      assignedRole: string;
      expectedRole: string;
      count: number;
      examples: string[];
    }
  >();
  const missedBySeverity = {
    critical: [] as string[],
    important: [] as string[],
    minor: [] as string[],
  };
  const missedCountsByCategory: Record<string, number> = {};
  const granularityErrorCounts = new Map<
    string,
    { count: number; examples: string[] }
  >();
  const categoryTotals: Record<
    string,
    { coverageSum: number; precisionSum: number; count: number }
  > = {};
  for (const category of CATEGORY_NAMES) {
    categoryTotals[category] = { coverageSum: 0, precisionSum: 0, count: 0 };
  }

  for (const r of successfulResults) {
    if (!r.judgeResult) continue;
    const judgeResult = normalizeJudgeResult(r.judgeResult);
    const sections = r.sections ?? detectSections(r.output);

    for (const missed of judgeResult.missedElements) {
      allMissed.push(missed.text);
      const section = getSectionForText(missed.text, r.output, sections);
      errorsBySection[section].missed++;

      const severity = missed.severity as keyof typeof missedBySeverity;
      if (missedBySeverity[severity] && missedBySeverity[severity].length < 5) {
        missedBySeverity[severity].push(`${missed.text} (${missed.category})`);
      }

      const cat = missed.category || "unknown";
      missedCountsByCategory[cat] = (missedCountsByCategory[cat] || 0) + 1;
    }

    const { matches } = matchFalsePositivesToSpans(
      r.spans,
      judgeResult.falsePositives,
    );
    for (const match of matches) {
      allIncorrect.push(match.fp.text);
      if (falsePositiveReasons[match.fp.reason] !== undefined) {
        falsePositiveReasons[match.fp.reason] += 1;
        if (falsePositiveExamples[match.fp.reason].length < 5) {
          falsePositiveExamples[match.fp.reason].push(match.fp.text);
        }
      } else {
        falsePositiveReasons.other += 1;
        if (falsePositiveExamples.other.length < 5) {
          falsePositiveExamples.other.push(match.fp.text);
        }
      }

      const section =
        match.spanIndex !== null
          ? (r.spans[match.spanIndex].section ??
            getSectionForOffset(r.spans[match.spanIndex].start, sections))
          : getSectionForText(match.fp.text, r.output, sections);
      errorsBySection[section].falsePositives++;
    }

    for (const err of judgeResult.taxonomyErrors) {
      const key = `${err.assignedRole}|||${err.expectedRole}`;
      const current = taxonomyErrorCounts.get(key) || {
        assignedRole: err.assignedRole,
        expectedRole: err.expectedRole,
        count: 0,
        examples: [],
      };
      current.count += 1;
      if (current.examples.length < 3) {
        current.examples.push(err.text);
      }
      taxonomyErrorCounts.set(key, current);
    }

    for (const err of judgeResult.granularityErrors) {
      const current = granularityErrorCounts.get(err.reason) || {
        count: 0,
        examples: [],
      };
      current.count += 1;
      if (current.examples.length < 3) {
        current.examples.push(err.text);
      }
      granularityErrorCounts.set(err.reason, current);
    }

    for (const category of CATEGORY_NAMES) {
      const scores = judgeResult.categoryScores?.[category];
      if (!scores || (scores.coverage === 0 && scores.precision === 0))
        continue;
      categoryTotals[category].coverageSum += scores.coverage;
      categoryTotals[category].precisionSum += scores.precision;
      categoryTotals[category].count += 1;
    }
  }

  const countFrequency = (arr: string[]): string[] => {
    const counts = new Map<string, number>();
    for (const item of arr) {
      counts.set(item, (counts.get(item) || 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([item, count]) => `${item} (${count}x)`);
  };

  const avgCategoryScores = createEmptyCategoryScores();
  for (const category of CATEGORY_NAMES) {
    const total = categoryTotals[category];
    if (total.count === 0) continue;
    avgCategoryScores[category] = {
      coverage: Math.round((total.coverageSum / total.count) * 100) / 100,
      precision: Math.round((total.precisionSum / total.count) * 100) / 100,
    };
  }

  const topTaxonomyErrors = [...taxonomyErrorCounts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const topGranularityErrors = [...granularityErrorCounts.entries()]
    .map(([reason, data]) => ({
      reason: reason as import("./types.js").GranularityErrorType,
      count: data.count,
      examples: data.examples,
    }))
    .sort((a, b) => b.count - a.count);

  const pipelineSources = { nlp: 0, llm: 0, unknown: 0 };
  const spanSources = { closedVocab: 0, openVocab: 0, llm: 0 };

  for (const r of results) {
    if (!r.meta) {
      pipelineSources.unknown++;
      continue;
    }

    const version = r.meta.version || "";
    const notes = r.meta.notes || "";
    const isNlpPath =
      version.includes("nlp") ||
      notes.includes("neuro-symbolic") ||
      notes.includes("symbolic-nlp");

    if (isNlpPath) {
      pipelineSources.nlp++;
      if (r.meta.closedVocab !== undefined) {
        spanSources.closedVocab += r.meta.closedVocab;
      }
      if (r.meta.openVocab !== undefined) {
        spanSources.openVocab += r.meta.openVocab;
      }
      if (r.meta.closedVocab === undefined && r.meta.openVocab === undefined) {
        spanSources.closedVocab += r.spanCount;
      }
    } else if (r.spanCount > 0) {
      pipelineSources.llm++;
      spanSources.llm += r.spanCount;
    } else {
      pipelineSources.unknown++;
    }
  }

  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const latencyStats = {
    avg: Math.round(
      latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1),
    ),
    p50: latencies[Math.floor(latencies.length * 0.5)] || 0,
    p95: latencies[Math.floor(latencies.length * 0.95)] || 0,
    p99: latencies[Math.floor(latencies.length * 0.99)] || 0,
  };

  return {
    avgScore: Math.round(avgScore * 100) / 100,
    avgSpanCount: Math.round(avgSpanCount * 100) / 100,
    scoreDistribution,
    commonMissedElements: countFrequency(allMissed),
    commonIncorrectExtractions: countFrequency(allIncorrect),
    errorCount: results.filter((r) => r.error).length,
    pipelineSources,
    spanSources,
    avgCategoryScores,
    falsePositiveReasons,
    topTaxonomyErrors,
    topGranularityErrors,
    errorsBySection,
    confidenceAnalysis,
    falsePositiveExamples,
    missedBySeverity,
    latencyStats,
    missedCountsByCategory,
  } as any;
}

function findLatestPromptsFile(): string | null {
  // First check for generated evaluation prompts in data directory
  const dataDir = join(__dirname, "data");
  if (existsSync(dataDir)) {
    const latestPath = join(dataDir, "evaluation-prompts-latest.json");
    if (existsSync(latestPath)) {
      return latestPath;
    }

    // Fall back to timestamped files
    const evalFiles = readdirSync(dataDir)
      .filter((f) => f.startsWith("evaluation-prompts-") && f.endsWith(".json"))
      .sort()
      .reverse();

    if (evalFiles.length > 0) {
      return join(dataDir, evalFiles[0]);
    }
  }

  // Fall back to raw prompts in project root
  const projectRoot = join(__dirname, "../..");
  const files = readdirSync(projectRoot)
    .filter((f) => f.startsWith("raw-prompts-") && f.endsWith(".json"))
    .sort()
    .reverse();

  return files.length > 0 ? join(projectRoot, files[0]) : null;
}

function loadPrompts(filePath: string): PromptRecord[] {
  const data = JSON.parse(readFileSync(filePath, "utf-8"));

  // Handle new evaluation dataset format
  if (data.metadata && data.prompts) {
    const dataset = data as EvaluationDataset;
    return (dataset.prompts || [])
      .filter((p: PromptRecord) => !p.error && p.output) // Skip failed generations
      .map((item: PromptRecord) => ({
        id: item.id,
        input: item.input || "",
        output: item.output || "",
        timestamp: item.generatedAt || item.timestamp,
      }));
  }

  // Handle legacy raw prompts format
  return data.map((item: any, index: number) => ({
    id: item.id || item.uuid || `prompt-${index}`,
    input: item.input || "",
    output: item.output || "",
    timestamp: item.timestamp,
  }));
}

/**
 * Generate the evaluation report as a string
 */
function generateReportText(snapshot: Snapshot): string {
  const lines: string[] = [];
  const add = (line = "") => lines.push(line);

  add("=".repeat(80));
  add("  SPAN LABELING EVALUATION REPORT");
  add("=".repeat(80));
  add();

  add(`📊 SUMMARY (${snapshot.promptCount} prompts evaluated):`);
  add(`  Average Score:      ${snapshot.summary.avgScore}/25`);
  add(`  Average Span Count: ${snapshot.summary.avgSpanCount}`);
  add(`  Errors:             ${snapshot.summary.errorCount}`);
  add();

  add("📈 SCORE DISTRIBUTION:");
  for (const [range, count] of Object.entries(
    snapshot.summary.scoreDistribution,
  )) {
    const bar = "█".repeat(Math.round((count / snapshot.promptCount) * 40));
    add(`  ${range.padEnd(20)} ${bar} ${count}`);
  }
  add();

  const commonMissed = snapshot.summary.commonMissedElements ?? [];
  if (commonMissed.length > 0) {
    add("❌ COMMONLY MISSED ELEMENTS:");
    for (const item of commonMissed.slice(0, 5)) {
      add(`  - ${item}`);
    }
    add();
  }

  const commonIncorrect = snapshot.summary.commonIncorrectExtractions ?? [];
  if (commonIncorrect.length > 0) {
    add("⚠️  COMMONLY INCORRECT EXTRACTIONS:");
    for (const item of commonIncorrect.slice(0, 5)) {
      add(`  - ${item}`);
    }
    add();
  }

  if (snapshot.summary.latencyStats) {
    const l = snapshot.summary.latencyStats;
    add("⏱️  LATENCY STATS (ms):");
    add(`  Avg: ${l.avg} | P50: ${l.p50} | P95: ${l.p95} | P99: ${l.p99}`);
    add();
  }

  const missedBySeverity = (snapshot.summary as any).missedBySeverity;
  if (missedBySeverity) {
    add("MISSED ELEMENTS BY SEVERITY (Examples):");
    for (const [sev, examples] of Object.entries(missedBySeverity)) {
      if ((examples as string[]).length > 0) {
        add(`  ${sev.toUpperCase()}: ${(examples as string[]).join(", ")}`);
      }
    }
    add();
  }

  if (snapshot.summary.missedCountsByCategory) {
    const counts = Object.entries(
      snapshot.summary.missedCountsByCategory as Record<string, number>,
    ).sort((a, b) => b[1] - a[1]);
    if (counts.length > 0) {
      add("📉 MISSED ELEMENTS BY CATEGORY (Count):");
      for (const [cat, count] of counts) {
        add(`  - ${cat}: ${count}`);
      }
      add();
    }
  }

  if (snapshot.summary.avgCategoryScores) {
    add("CATEGORY SCORES (avg coverage/precision):");
    for (const category of CATEGORY_NAMES) {
      const scores = snapshot.summary.avgCategoryScores[category];
      add(
        `  ${category.padEnd(12)} ${scores.coverage.toFixed(2)} / ${scores.precision.toFixed(2)}`,
      );
    }
    add();
  }

  if (snapshot.summary.falsePositiveReasons) {
    const reasons = snapshot.summary.falsePositiveReasons;
    const examples = (snapshot.summary as any).falsePositiveExamples || {};
    const hasReasons = Object.values(reasons).some((count) => count > 0);
    if (hasReasons) {
      add("FALSE POSITIVE REASONS:");
      for (const reason of FALSE_POSITIVE_REASONS) {
        const count = reasons[reason] || 0;
        if (count > 0) {
          add(`  - ${reason}: ${count}`);
          const reasonExamples = examples[reason];
          if (reasonExamples && reasonExamples.length > 0) {
            add(`      e.g.: ${reasonExamples.join(", ")}`);
          }
        }
      }
      add();
    }
  }

  if (
    snapshot.summary.topTaxonomyErrors &&
    snapshot.summary.topTaxonomyErrors.length > 0
  ) {
    add("TOP TAXONOMY ERRORS:");
    for (const item of snapshot.summary.topTaxonomyErrors.slice(0, 5)) {
      const examples = (item as any).examples || [];
      const exStr =
        examples.length > 0 ? ` (e.g. "${examples.join('", "')}")` : "";
      add(
        `  - ${item.assignedRole} → ${item.expectedRole} (${item.count}x)${exStr}`,
      );
    }
    add();
  }

  if (
    snapshot.summary.topGranularityErrors &&
    snapshot.summary.topGranularityErrors.length > 0
  ) {
    add("📐 GRANULARITY ISSUES:");
    for (const item of snapshot.summary.topGranularityErrors) {
      const example = item.examples[0] ? ` (e.g., "${item.examples[0]}")` : "";
      add(`  - ${item.reason}: ${item.count}x${example}`);
    }
    add();
  }

  if (snapshot.summary.errorsBySection) {
    add("ERRORS BY SECTION:");
    for (const section of SECTION_NAMES) {
      const counts = snapshot.summary.errorsBySection[section];
      add(
        `  ${section.padEnd(15)} missed ${counts.missed}, falsePositives ${counts.falsePositives}`,
      );
    }
    add();
  }

  if (snapshot.summary.confidenceAnalysis) {
    const analysis = snapshot.summary.confidenceAnalysis;
    add("CONFIDENCE ERROR RATES:");
    for (const [bucketName, bucket] of Object.entries(analysis.buckets)) {
      const rate =
        bucket.total > 0 ? (bucket.errorRate * 100).toFixed(1) : "0.0";
      const examples = (bucket as any).examples || [];
      add(
        `  ${bucketName.padEnd(6)} ${rate}% (${bucket.errors}/${bucket.total})`,
      );
      if (examples.length > 0) {
        add(`    Failures: ${examples.join(", ")}`);
      }
    }
    if (analysis.recommendedThreshold !== null) {
      add(
        `  Recommended minConfidence: ${analysis.recommendedThreshold.toFixed(2)}`,
      );
    }
    if (analysis.notes) {
      add(`  Notes: ${analysis.notes}`);
    }
    add();
  }

  // Show worst performers
  const worstResults = snapshot.results
    .filter((r) => r.judgeResult)
    .sort(
      (a, b) =>
        (a.judgeResult?.totalScore || 0) - (b.judgeResult?.totalScore || 0),
    )
    .slice(0, 3);

  if (worstResults.length > 0) {
    add("🔍 WORST PERFORMERS (for debugging):");
    for (const r of worstResults) {
      add(`  [${r.judgeResult?.totalScore}/25] "${r.input}"`);
      add(`    Notes: ${r.judgeResult?.notes || "No notes"}`);
    }
    add();
  }

  add("=".repeat(80));

  return lines.join("\n");
}

/**
 * Print report to console
 */
function printReport(snapshot: Snapshot): void {
  console.log("\n" + generateReportText(snapshot));
}

/**
 * Save report to text file
 */
function saveReportToFile(snapshot: Snapshot, filePath: string): void {
  const reportText = generateReportText(snapshot);
  const header = `Evaluation Report - ${snapshot.timestamp}\nSource: ${snapshot.sourceFile}\nJudge Model: ${snapshot.judgeModel}\n\n`;
  writeFileSync(filePath, header + reportText);
}

async function main(): Promise<void> {
  // Parse CLI args
  const args = process.argv.slice(2);
  let promptsFile = findLatestPromptsFile();
  let sampleSize: number | null = null;
  let lockBaseline = false;
  let concurrency = 2; // Reduced from 10 to avoid rate limits
  let useFastModel = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--prompts-file" && args[i + 1]) {
      promptsFile = args[++i];
    } else if (args[i] === "--sample" && args[i + 1]) {
      sampleSize = parseInt(args[++i], 10);
    } else if (args[i] === "--baseline") {
      lockBaseline = true;
    } else if (args[i] === "--concurrency" && args[i + 1]) {
      concurrency = parseInt(args[++i], 10);
    } else if (args[i] === "--fast") {
      useFastModel = true;
    }
  }

  if (!promptsFile || !existsSync(promptsFile)) {
    console.error(
      "No prompts file found. Specify with --prompts-file or place raw-prompts-*.json in project root.",
    );
    process.exit(1);
  }

  console.log(`Loading prompts from: ${promptsFile}`);
  let prompts = loadPrompts(promptsFile);
  console.log(`Found ${prompts.length} prompts`);

  // Sample if requested
  if (sampleSize && sampleSize < prompts.length) {
    console.log(`Sampling ${sampleSize} prompts...`);
    prompts = prompts.sort(() => Math.random() - 0.5).slice(0, sampleSize);
  }

  // Warmup all NLP services (GLiNER, Compromise, Lighting)
  console.log("Warming up NLP services...");
  const warmup = await warmupNlpServices();
  console.log(`GLiNER: ${warmup.gliner.success ? "ready" : "not ready"}`);
  console.log(
    `Compromise: ${warmup.compromise.success ? "ready" : "not ready"}`,
  );
  console.log(`Lighting: ${warmup.lighting.success ? "ready" : "not ready"}`);

  // Create AI service (for span labeling)
  const aiService = createAIService();
  console.log(`AI service ready`);

  // Create judge client
  const judgeModel = useFastModel ? "gpt-4o-mini" : "gpt-4o";
  const judgeClient = createJudgeClient(useFastModel);
  console.log(`Judge client ready (${judgeModel})`);

  // =========================================================================
  // PHASE 1: Extract spans from pre-optimized outputs
  // =========================================================================
  // Higher batch size since we're only doing span extraction (no optimization)
  const extractionBatchSize = 5;

  console.log(`\n📝 Phase 1: Extracting spans from pre-optimized outputs...`);
  console.log(
    `  Processing ${prompts.length} prompts in batches of ${extractionBatchSize}`,
  );
  const startPhase1 = Date.now();

  interface SpanExtractionResult {
    promptId: string;
    input: string;
    output: string;
    spans: SpanResult[];
    meta: SpanLabelingMeta | null;
    sections: PromptSections;
    error: string | null;
  }

  const extractionResults: SpanExtractionResult[] = new Array(prompts.length);
  let extractedCount = 0;
  let successCount = 0;
  let errorCount = 0;
  const extractionLatencies: number[] = [];
  const totalBatches = Math.ceil(prompts.length / extractionBatchSize);
  let currentBatch = 0;

  for (
    let batchStart = 0;
    batchStart < prompts.length;
    batchStart += extractionBatchSize
  ) {
    currentBatch++;
    const batchEnd = Math.min(batchStart + extractionBatchSize, prompts.length);
    const batch = prompts.slice(batchStart, batchEnd);

    if (totalBatches > 1) {
      console.log(
        `  Batch ${currentBatch}/${totalBatches} (prompts ${batchStart + 1}-${batchEnd})...`,
      );
    }

    await Promise.all(
      batch.map(async (prompt, batchIndex) => {
        const globalIndex = batchStart + batchIndex;
        const promptStartTime = Date.now();
        const promptNum = globalIndex + 1;

        try {
          // Use the pre-optimized output directly
          const currentOutput = prompt.output;

          if (!currentOutput) {
            throw new Error(
              "No output available - run generate-evaluation-prompts.ts first",
            );
          }

          // Extract spans from the existing output
          const response = await labelSpans(
            {
              text: currentOutput,
              maxSpans: 50,
              minConfidence: 0.5,
              templateVersion: "v3.0",
            },
            aiService,
          );

          const sections = detectSections(currentOutput);
          const spans: SpanResult[] = (response.spans || []).map((s: any) => {
            const start = s.start ?? 0;
            return {
              text: s.text,
              role: s.role,
              confidence: s.confidence ?? 0,
              start,
              end: s.end ?? 0,
              section: getSectionForOffset(start, sections),
            };
          });

          const promptLatency = Date.now() - promptStartTime;
          extractionLatencies.push(promptLatency);

          const meta = {
            version: response.meta?.version || "unknown",
            notes: response.meta?.notes || "",
            source: (response.meta as any)?.source,
            closedVocab: (response.meta as any)?.closedVocab,
            openVocab: (response.meta as any)?.openVocab,
            latency: (response.meta as any)?.latency,
            tier1Latency: (response.meta as any)?.tier1Latency,
            tier2Latency: (response.meta as any)?.tier2Latency,
          };

          const pipelineSource =
            meta.version.includes("nlp") ||
            meta.notes.includes("neuro-symbolic") ||
            meta.notes.includes("symbolic-nlp")
              ? "NLP"
              : "LLM";
          const sourceInfo = meta.source ? ` (${meta.source})` : "";
          const spanInfo =
            meta.closedVocab !== undefined && meta.openVocab !== undefined
              ? ` [${meta.closedVocab}C/${meta.openVocab}O]`
              : "";

          extractionResults[globalIndex] = {
            promptId: prompt.id,
            input: prompt.input,
            output: currentOutput,
            spans,
            meta,
            sections,
            error: null,
          };

          successCount++;
          const preview = prompt.input.slice(0, 40).replace(/\n/g, " ");
          console.log(
            `  [${String(promptNum).padStart(3)}/${prompts.length}] ✓ "${preview}..." → ${spans.length} spans (${pipelineSource}${sourceInfo}${spanInfo}, ${promptLatency}ms)`,
          );
        } catch (error) {
          const promptLatency = Date.now() - promptStartTime;
          errorCount++;
          const preview = prompt.input.slice(0, 40).replace(/\n/g, " ");
          console.error(
            `  [${String(promptNum).padStart(3)}/${prompts.length}] ✗ "${preview}..." → ERROR: ${(error as Error).message}`,
          );

          extractionResults[globalIndex] = {
            promptId: prompt.id,
            input: prompt.input,
            output: prompt.output || "",
            spans: [],
            meta: null,
            sections: {
              main: { start: 0, end: (prompt.output || "").length },
              technicalSpecs: null,
              alternatives: null,
            },
            error: (error as Error).message,
          };
        }
        extractedCount++;
      }),
    );

    // Small delay between batches to avoid rate limits
    if (batchEnd < prompts.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  const phase1Time = Date.now() - startPhase1;

  // Calculate Phase 1 statistics
  const totalSpans = extractionResults.reduce(
    (sum, r) => sum + r.spans.length,
    0,
  );
  const avgSpansPerPrompt =
    successCount > 0 ? (totalSpans / successCount).toFixed(1) : "0";
  const avgLatency =
    extractionLatencies.length > 0
      ? Math.round(
          extractionLatencies.reduce((a, b) => a + b, 0) /
            extractionLatencies.length,
        )
      : 0;
  const p50Latency =
    extractionLatencies.length > 0
      ? extractionLatencies.sort((a, b) => a - b)[
          Math.floor(extractionLatencies.length * 0.5)
        ]
      : 0;
  const p95Latency =
    extractionLatencies.length > 0
      ? extractionLatencies.sort((a, b) => a - b)[
          Math.floor(extractionLatencies.length * 0.95)
        ]
      : 0;

  console.log(`\n  ✓ Phase 1 complete in ${(phase1Time / 1000).toFixed(1)}s`);
  console.log(
    `  Summary: ${successCount} succeeded, ${errorCount} failed, ${totalSpans} total spans extracted`,
  );
  console.log(
    `  Avg spans/prompt: ${avgSpansPerPrompt}, Latency: avg=${avgLatency}ms, p50=${p50Latency}ms, p95=${p95Latency}ms`,
  );

  // =========================================================================
  // PHASE 2: Judge with LLM (slower, rate limited)
  // =========================================================================
  console.log(
    `\n⚖️  Phase 2: Judging quality (concurrency: ${concurrency})...`,
  );
  const totalJudgeBatches = Math.ceil(prompts.length / concurrency);
  console.log(
    `  Processing ${prompts.length} extractions in ${totalJudgeBatches} batch(es)`,
  );
  const startPhase2 = Date.now();

  const results: EvaluationResult[] = new Array(prompts.length);
  let judgedCount = 0;
  let judgeBatchNum = 0;

  for (
    let batchStart = 0;
    batchStart < prompts.length;
    batchStart += concurrency
  ) {
    judgeBatchNum++;
    const batchEnd = Math.min(batchStart + concurrency, prompts.length);

    if (totalJudgeBatches > 1) {
      console.log(
        `  Judge batch ${judgeBatchNum}/${totalJudgeBatches} (${batchEnd - batchStart} prompts)...`,
      );
    }

    await Promise.all(
      extractionResults
        .slice(batchStart, batchEnd)
        .map(async (extraction, batchIndex) => {
          const globalIndex = batchStart + batchIndex;
          const startTime = Date.now();

          let judgeResult: EnhancedJudgeResult | null = null;
          if (!extraction.error && extraction.spans.length > 0) {
            judgeResult = await judgeSpanQuality(
              extraction.output,
              extraction.spans,
              judgeClient,
            );
          }

          results[globalIndex] = {
            promptId: extraction.promptId,
            input: extraction.input,
            output: extraction.output,
            spanCount: extraction.spans.length,
            spans: extraction.spans,
            meta: extraction.meta,
            judgeResult,
            error: extraction.error,
            latencyMs: Date.now() - startTime,
            sections: extraction.sections,
          };

          judgedCount++;
          const score = judgeResult?.totalScore ?? "ERR";
          const preview = extraction.input.slice(0, 40).replace(/\n/g, " ");
          const judgeLatency = Date.now() - startTime;
          const spanCount = extraction.spans.length;
          const status = extraction.error ? "ERR" : judgeResult ? "✓" : "SKIP";
          console.log(
            `  [${String(judgedCount).padStart(3)}/${prompts.length}] ${status} "${preview}..." → ${score}/25 (${spanCount} spans, ${judgeLatency}ms)`,
          );
        }),
    );

    // Small delay between batches to avoid rate limits
    if (batchEnd < prompts.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  const phase2Time = Date.now() - startPhase2;

  // Calculate Phase 2 statistics
  const successfulJudgments = results.filter(
    (r) => r.judgeResult && r.judgeResult.totalScore > 0,
  ).length;
  const skippedJudgments = results.filter(
    (r) => !r.error && r.spans.length === 0,
  ).length;
  const failedJudgments = results.filter((r) => r.error).length;
  const avgJudgeScore =
    successfulJudgments > 0
      ? (
          results.reduce(
            (sum, r) => sum + (r.judgeResult?.totalScore || 0),
            0,
          ) / successfulJudgments
        ).toFixed(2)
      : "0.00";
  const judgeLatencies = results.map((r) => r.latencyMs).filter((l) => l > 0);
  const avgJudgeLatency =
    judgeLatencies.length > 0
      ? Math.round(
          judgeLatencies.reduce((a, b) => a + b, 0) / judgeLatencies.length,
        )
      : 0;

  console.log(`  ✓ Phase 2 complete in ${(phase2Time / 1000).toFixed(1)}s`);
  console.log(
    `  Summary: ${successfulJudgments} judged, ${skippedJudgments} skipped, ${failedJudgments} failed`,
  );
  console.log(
    `  Avg score: ${avgJudgeScore}/25, Avg judge latency: ${avgJudgeLatency}ms`,
  );
  console.log(
    `\n  Total time: ${((phase1Time + phase2Time) / 1000).toFixed(1)}s`,
  );

  // Build snapshot with timestamp
  console.log(`\n📊 Computing summary statistics...`);
  const runTimestamp = new Date();
  const snapshot: Snapshot = {
    timestamp: runTimestamp.toISOString(),
    promptCount: results.length,
    sourceFile: promptsFile,
    judgeModel,
    results,
    summary: computeSummary(results),
  };

  console.log(
    `  Summary computed: avg score ${snapshot.summary.avgScore}/25, ${snapshot.summary.avgSpanCount} avg spans/prompt`,
  );

  // Create filename-safe timestamp (e.g., 2025-12-23T17-44-21)
  const fileTimestamp = runTimestamp
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\.\d{3}Z$/, "");

  // Save timestamped snapshot (JSON)
  console.log(`\n💾 Saving results...`);
  const timestampedSnapshotPath = join(
    SNAPSHOTS_DIR,
    `snapshot-${fileTimestamp}.json`,
  );
  writeFileSync(timestampedSnapshotPath, JSON.stringify(snapshot, null, 2));
  console.log(`  ✓ Snapshot saved to: ${timestampedSnapshotPath}`);

  // Save timestamped report (text file)
  const timestampedReportPath = join(
    SNAPSHOTS_DIR,
    `report-${fileTimestamp}.txt`,
  );
  saveReportToFile(snapshot, timestampedReportPath);
  console.log(`  ✓ Report saved to: ${timestampedReportPath}`);

  // Also save as "latest" for easy access
  const latestSnapshotPath = join(SNAPSHOTS_DIR, "latest.json");
  const latestReportPath = join(SNAPSHOTS_DIR, "latest-report.txt");
  writeFileSync(latestSnapshotPath, JSON.stringify(snapshot, null, 2));
  saveReportToFile(snapshot, latestReportPath);
  console.log(`  ✓ Latest copies updated (latest.json, latest-report.txt)`);

  // Optionally lock as baseline
  if (lockBaseline) {
    const baselinePath = join(SNAPSHOTS_DIR, "baseline.json");
    writeFileSync(baselinePath, JSON.stringify(snapshot, null, 2));
    console.log(`🔒 Baseline locked at: ${baselinePath}`);

    // Also save baseline report
    const baselineReportPath = join(SNAPSHOTS_DIR, "baseline-report.txt");
    saveReportToFile(snapshot, baselineReportPath);
    console.log(`📝 Baseline report saved to: ${baselineReportPath}`);
  }

  // Print report to console
  printReport(snapshot);

  // Emit eval.completed event before exit (best-effort)
  try {
    const emitter = createEvalEmitter();
    const promptCount = snapshot.results.length;
    const errCount = snapshot.summary.errorCount;
    const outcome: Outcome =
      errCount > promptCount * 0.2 ? "setup_error" : "passed";
    const metrics: SpanLabelingJudgeMetrics = {
      avgScore: snapshot.summary.avgScore,
      maxScore: 25,
      scoreDistribution: snapshot.summary
        .scoreDistribution as SpanLabelingJudgeMetrics["scoreDistribution"],
      judgeModel: snapshot.judgeModel ?? "unknown",
      ...(snapshot.summary.latencyStats && {
        latencyStats: snapshot.summary.latencyStats,
      }),
    };
    // Per-prompt examples for the Eval Health dashboard's quality-review tile.
    // Each row carries the input prompt, the spans the model returned, the
    // judge's total score, and the judge's notes — enough to scroll and form
    // a feel for "the model is solid" vs "category X gets confused with Y".
    const examples = snapshot.results.map((r) => ({
      promptId: r.promptId,
      input: r.input,
      spans: r.spans.map((s) => ({ text: s.text, role: s.role })),
      ...(r.judgeResult
        ? {
            judgeTotalScore: r.judgeResult.totalScore,
            ...(r.judgeResult.notes ? { judgeNotes: r.judgeResult.notes } : {}),
          }
        : {}),
      ...(r.error ? { error: r.error } : {}),
    }));

    emitter.emit({
      distinctId: resolveDistinctId(),
      event: "eval.completed",
      properties: {
        evalType: "span_labeling_judge",
        outcome,
        ...(outcome === "setup_error" && {
          errorMessage: `Error rate exceeded threshold (${errCount}/${promptCount})`,
        }),
        commit: process.env.GIT_COMMIT ?? "unknown",
        ...(process.env.GITHUB_RUN_ID !== undefined && {
          runId: process.env.GITHUB_RUN_ID,
        }),
        sourceFile: snapshot.sourceFile,
        durationMs: Date.now() - mainStartedAt,
        promptCount,
        errorCount: errCount,
        metrics,
        ...(examples.length > 0 && { examples }),
      },
    });
    await emitter.shutdown();
  } catch {
    // never fail the eval on telemetry hiccup
  }

  process.exit(0);
}

main().catch(async (e) => {
  // Emit setup_error event for catastrophic failures (best-effort)
  try {
    const emitter = createEvalEmitter();
    emitter.emit({
      distinctId: resolveDistinctId(),
      event: "eval.completed",
      properties: {
        evalType: "span_labeling_judge",
        outcome: "setup_error",
        errorMessage: e instanceof Error ? e.message : String(e),
        commit: process.env.GIT_COMMIT ?? "unknown",
        ...(process.env.GITHUB_RUN_ID !== undefined && {
          runId: process.env.GITHUB_RUN_ID,
        }),
        durationMs: Date.now() - mainStartedAt,
        promptCount: 0,
        errorCount: 0,
        metrics: {
          avgScore: 0,
          maxScore: 25,
          scoreDistribution: {
            excellent: 0,
            good: 0,
            acceptable: 0,
            poor: 0,
            failing: 0,
          },
          judgeModel: "unknown",
        },
      },
    });
    await emitter.shutdown();
  } catch {
    // never let telemetry crash propagation
  }
  console.error(e);
  process.exit(1);
});
