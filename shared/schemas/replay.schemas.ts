/**
 * Record/replay cassette contracts.
 *
 * A cassette is one JSON fixture file holding the request/response pairs
 * recorded at the LLM boundary (aiService) or a provider adapter (image
 * preview) for a single surface + scenario. Cassettes are validated against
 * these schemas at BOTH record and replay time, so a contract change made
 * without re-recording fails loudly instead of silently drifting.
 *
 * Layer rule: this file is pure Zod — no I/O, no Node APIs. The server-side
 * store, key derivation, and seam decorators live in `server/src/replay/`.
 */

import { z } from 'zod';

/** Bump when the cassette file layout changes incompatibly. */
export const REPLAY_CASSETTE_FORMAT_VERSION = 1 as const;

/** The golden-path surfaces a cassette can belong to (fixture organization). */
export const REPLAY_SURFACES = [
  'label-spans',
  'suggestions',
  'optimize',
  'first-frame-preview',
  'motion-ideas',
] as const;

export const ReplaySurfaceSchema = z.enum(REPLAY_SURFACES);
export type ReplaySurface = z.infer<typeof ReplaySurfaceSchema>;

// ─── Per-entry payload contracts ─────────────────────────────────────
// Each recorded entry names the contract its response payload must satisfy.
// Validation always resolves the name against THIS registry (the live
// contracts), never against a schema copy stored in the fixture — that is
// what makes contract drift detectable.

export const REPLAY_CONTRACT_NAMES = [
  'span-labeling-payload',
  'suggestions-payload',
  'optimize-text',
  'motion-ideas-payload',
  'image-preview-result',
  'llm-text',
] as const;

export const ReplayContractNameSchema = z.enum(REPLAY_CONTRACT_NAMES);
export type ReplayContractName = z.infer<typeof ReplayContractNameSchema>;

/** One labeled span as emitted by the span-labeling LLM. */
const SpanLabelingSpanSchema = z
  .object({
    text: z.string().min(1),
    role: z.string().min(1),
    confidence: z.number().min(0).max(1).optional(),
    start: z.number().int().min(0).optional(),
    end: z.number().int().min(0).optional(),
  })
  .passthrough();

export const SpanLabelingReplayPayloadSchema = z
  .object({
    spans: z.array(SpanLabelingSpanSchema),
    analysis_trace: z.string().optional(),
    meta: z.unknown().optional(),
    isAdversarial: z.boolean().optional(),
    is_adversarial: z.boolean().optional(),
  })
  .passthrough();

/** One enhancement suggestion as emitted by the suggestions LLM. */
const SuggestionItemSchema = z
  .object({ text: z.string().min(1) })
  .passthrough();

/**
 * The suggestions LLM answers in json_object mode; the server unwraps either
 * a bare array or an object carrying the array (StructuredOutputEnforcer).
 */
export const SuggestionsReplayPayloadSchema = z.union([
  z.array(SuggestionItemSchema).min(1),
  z.object({ suggestions: z.array(SuggestionItemSchema).min(1) }).passthrough(),
]);

export const MotionIdeasReplayPayloadSchema = z
  .object({ ideas: z.array(z.string().min(1)).min(1) })
  .passthrough();

/** optimize_standard is creative free text — the contract is a non-empty body. */
export const OptimizeTextReplayPayloadSchema = z.string().min(1);

/** Mirrors ImagePreviewResult from the image preview provider seam. */
export const ImagePreviewResultReplayPayloadSchema = z
  .object({
    imageUrl: z.string().min(1),
    model: z.string().min(1),
    durationMs: z.number().min(0),
    aspectRatio: z.string().min(1),
  })
  .passthrough();

/** Default contract for operations without a dedicated payload schema. */
export const LlmTextReplayPayloadSchema = z.string().min(1);

/**
 * How a contract reads the recorded response before validating:
 * - "json": JSON.parse the AIResponse.text, validate the parsed payload
 * - "text": validate the AIResponse.text string itself
 * - "object": validate the recorded response object directly (non-LLM seams)
 */
export type ReplayPayloadEncoding = 'json' | 'text' | 'object';

export interface ReplayContract {
  encoding: ReplayPayloadEncoding;
  schema: z.ZodTypeAny;
}

export const REPLAY_CONTRACTS: Record<ReplayContractName, ReplayContract> = {
  'span-labeling-payload': {
    encoding: 'json',
    schema: SpanLabelingReplayPayloadSchema,
  },
  'suggestions-payload': {
    encoding: 'json',
    schema: SuggestionsReplayPayloadSchema,
  },
  'optimize-text': {
    encoding: 'text',
    schema: OptimizeTextReplayPayloadSchema,
  },
  'motion-ideas-payload': {
    encoding: 'json',
    schema: MotionIdeasReplayPayloadSchema,
  },
  'image-preview-result': {
    encoding: 'object',
    schema: ImagePreviewResultReplayPayloadSchema,
  },
  'llm-text': { encoding: 'text', schema: LlmTextReplayPayloadSchema },
};

// ─── Cassette entry + file envelope ──────────────────────────────────

const ReplayAiModelRequestSchema = z.object({
  operation: z.string().min(1),
  systemPrompt: z.string().min(1),
  userMessage: z.string().nullable(),
  messages: z.unknown().nullable(),
  stream: z.boolean(),
});
export type ReplayAiModelRequest = z.infer<typeof ReplayAiModelRequestSchema>;

const ReplayImagePreviewRequestSchema = z.object({
  prompt: z.string().min(1),
  aspectRatio: z.string().nullable(),
  inputImageUrl: z.string().nullable(),
  seed: z.number().nullable(),
  speedMode: z.string().nullable(),
});
export type ReplayImagePreviewRequest = z.infer<
  typeof ReplayImagePreviewRequestSchema
>;

/** Recorded AIResponse (text + provider metadata, structure-preserving). */
const RecordedAiResponseSchema = z
  .object({
    text: z.string(),
    metadata: z.record(z.string(), z.unknown()),
  })
  .passthrough();

export const ReplayCassetteEntrySchema = z.discriminatedUnion('seam', [
  z.object({
    seam: z.literal('ai-model'),
    key: z.string().min(1),
    contract: ReplayContractNameSchema,
    request: ReplayAiModelRequestSchema,
    response: RecordedAiResponseSchema,
  }),
  z.object({
    seam: z.literal('image-preview'),
    key: z.string().min(1),
    contract: ReplayContractNameSchema,
    request: ReplayImagePreviewRequestSchema,
    response: ImagePreviewResultReplayPayloadSchema,
  }),
]);

export type ReplayCassetteEntry = z.infer<typeof ReplayCassetteEntrySchema>;

export const ReplayCassetteSchema = z.object({
  formatVersion: z.literal(REPLAY_CASSETTE_FORMAT_VERSION),
  surface: ReplaySurfaceSchema,
  scenario: z.string().min(1),
  recordedAt: z.string().min(1),
  entries: z.array(ReplayCassetteEntrySchema).min(1),
});

export type ReplayCassette = z.infer<typeof ReplayCassetteSchema>;
