import { SubstringPositionCache } from "./cache/SubstringPositionCache";
import SpanLabelingConfig from "./config/SpanLabelingConfig";
import { sanitizePolicy, sanitizeOptions } from "./utils/policyUtils";
import { TextChunker, countWords } from "./utils/chunkingUtils";
import { NlpSpanStrategy } from "./strategies/NlpSpanStrategy";
import { createLlmClient, spanProfileIdFor } from "./services/LlmClientFactory";
import { resolveOverlaps } from "./processing/OverlapResolver";
import { SpanProcessor } from "./processing/SpanProcessor";
import { validateSpans } from "./validation/SpanValidator";
import { detectInjectionPatterns } from "@utils/SecurityPrompts";
import { logger } from "@infrastructure/Logger";
import type { AIExecutionPort } from "@services/ai-model/ports/AIExecutionPort";
import type { ProviderType } from "@utils/provider/ProviderDetector";
import type {
  LabelSpansParams,
  LabelSpansResult,
  LLMMeta,
  SpanLike,
} from "./types";

/**
 * Span Labeling Service - Refactored Architecture
 *
 * Orchestrates LLM-based span labeling with validation and optional repair.
 * This service is a thin orchestrator delegating to specialized modules:
 * - NlpSpanStrategy: NLP fast-path extraction
 * - LlmClientFactory: Creates provider-specific LLM clients (Groq, OpenAI)
 * - Validation: Schema and span validation
 * - Processing: Pipeline of span transformations (dedupe, overlap, filter, truncate)
 *
 * Provider Isolation:
 * - Groq/Llama 3: logprobs confidence capping, few-shot examples
 * - OpenAI/GPT-4o: strict schema, developer role
 * - Provider comes from `aiService.resolveExecution("span_labeling")` — the
 *   router's answer, which accounts for client availability and circuit state.
 *   Every result is stamped with it via `meta.provider` so callers (cache keys,
 *   telemetry) read the provider instead of re-deriving it.
 */

/**
 * Stamp a result with the provider responsible for it.
 *
 * Downstream cache keys and telemetry need to know which provider a result
 * came from. Carrying it on the result is what stops each of them from
 * re-deriving it out of `ModelConfig`, which cannot see routing.
 */
function withExecutionProvenance(
  result: LabelSpansResult,
  provider: ProviderType,
): LabelSpansResult {
  return {
    ...result,
    meta: { ...result.meta, provider },
  };
}

/**
 * Label spans using an LLM with validation and optional repair attempt.
 * Routes to chunked processing for large texts.
 */
export async function labelSpans(
  params: LabelSpansParams,
  aiService: AIExecutionPort,
): Promise<LabelSpansResult> {
  if (!params || typeof params.text !== "string" || !params.text.trim()) {
    throw new Error("text is required");
  }

  if (!aiService) {
    throw new Error("aiService is required");
  }

  const adversarialCheck = detectInjectionPatterns(params.text);
  if (adversarialCheck.hasPatterns) {
    logger.warn("Span labeling precheck flagged adversarial input", {
      operation: "labelSpans",
      patterns: adversarialCheck.patterns,
      textLength: params.text.length,
    });

    return {
      spans: [],
      meta: {
        version:
          params.templateVersion ||
          SpanLabelingConfig.DEFAULT_OPTIONS.templateVersion,
        notes: "adversarial input flagged",
      },
      isAdversarial: true,
      analysisTrace: adversarialCheck.patterns.length
        ? `adversarial precheck: ${adversarialCheck.patterns.join(", ")}`
        : "adversarial precheck",
    };
  }

  // Check if text needs chunking
  const wordCount = countWords(params.text);
  const maxWordsPerChunk = SpanLabelingConfig.CHUNKING.MAX_WORDS_PER_CHUNK;

  if (wordCount > maxWordsPerChunk) {
    logger.debug("Large text detected, using chunked processing", {
      operation: "labelSpans",
      wordCount,
      provider: aiService.resolveExecution("span_labeling").provider,
    });
    const result = await labelSpansChunked(params, aiService);
    return applyI2VFilterIfNeeded(result, params.templateVersion);
  }

  // For smaller texts, use single-pass processing
  const result = await labelSpansSingle(params, aiService);
  return applyI2VFilterIfNeeded(result, params.templateVersion);
}

/**
 * Label spans for a single chunk of text (original implementation)
 *
 * Uses provider-specific LLM client via factory pattern:
 * - Groq: Llama 3 optimizations
 * - OpenAI: GPT-4o optimizations
 */
async function labelSpansSingle(
  params: LabelSpansParams,
  aiService: AIExecutionPort,
): Promise<LabelSpansResult> {
  if (!params || typeof params.text !== "string" || !params.text.trim()) {
    throw new Error("text is required");
  }

  // Create request-scoped cache for concurrent request safety
  const cache = new SubstringPositionCache();

  try {
    const policy = sanitizePolicy(params.policy ?? null);
    const sanitizedOptions = sanitizeOptions({
      ...(params.maxSpans !== undefined && { maxSpans: params.maxSpans }),
      ...(params.minConfidence !== undefined && {
        minConfidence: params.minConfidence,
      }),
      ...(params.templateVersion !== undefined && {
        templateVersion: params.templateVersion,
      }),
    });

    // Try NLP fast-path first
    const nlpStrategy = new NlpSpanStrategy();
    const nlpResult = await nlpStrategy.extractSpans(
      params.text,
      policy,
      sanitizedOptions,
      cache,
    );

    // Shape the request for the provider the router will actually dispatch to,
    // not the one the config table names. Resolved before the NLP fast-path so
    // every result carries provenance, including results no LLM produced.
    const executedBy = aiService.resolveExecution("span_labeling");

    if (nlpResult) {
      // NLP fast-path succeeded
      return withExecutionProvenance(nlpResult, executedBy.provider);
    }

    // Fall back to LLM-based extraction with repair loop.
    const llmClient = createLlmClient(executedBy.provider);

    const result = await llmClient.getSpans({
      text: params.text,
      policy,
      options: sanitizedOptions,
      enableRepair: params.enableRepair === true,
      aiService,
      cache,
      nlpSpansAttempted: 0, // Could track NLP attempt count if needed
    });

    return withExecutionProvenance(result, executedBy.provider);
  } catch (error) {
    // Re-throw errors to let caller handle them
    throw error;
  }
  // Cache is automatically garbage collected when function returns
}

interface ChunkResult {
  spans?: SpanLike[];
  chunkOffset: number;
  meta: { version: string; notes: string; [key: string]: unknown } | null;
  isAdversarial: boolean;
}

const I2V_ALLOWED_CATEGORIES = new Set([
  "action.movement",
  "action.gesture",
  "action.state",
  "camera.movement",
  "camera.focus",
  "subject.emotion",
]);

function applyI2VFilterIfNeeded(
  result: LabelSpansResult,
  templateVersion?: string,
): LabelSpansResult {
  if (!templateVersion || !templateVersion.toLowerCase().startsWith("i2v")) {
    return result;
  }

  const spans = Array.isArray(result.spans) ? result.spans : [];
  const filtered = spans.filter((span) =>
    span?.role ? I2V_ALLOWED_CATEGORIES.has(span.role) : false,
  );

  if (filtered.length === spans.length) {
    return result;
  }

  const meta = result.meta
    ? {
        ...result.meta,
        notes: result.meta.notes
          ? `${result.meta.notes}; i2v motion filter applied`
          : "i2v motion filter applied",
      }
    : { version: templateVersion, notes: "i2v motion filter applied" };

  return {
    ...result,
    spans: filtered,
    meta,
  };
}

/**
 * Label spans for large texts using chunking strategy
 * Splits text into processable chunks, processes them, then merges results
 */
async function labelSpansChunked(
  params: LabelSpansParams,
  aiService: AIExecutionPort,
): Promise<LabelSpansResult> {
  const chunker = new TextChunker(
    SpanLabelingConfig.CHUNKING.MAX_WORDS_PER_CHUNK,
    SpanLabelingConfig.CHUNKING.OVERLAP_WORDS,
  );
  const chunks = chunker.chunkText(params.text);

  const wordCount = countWords(params.text);
  const { provider } = aiService.resolveExecution("span_labeling");
  logger.debug("Processing chunks", {
    operation: "labelSpansChunked",
    wordCount,
    chunkCount: chunks.length,
    provider,
  });

  // Process chunks (parallel or serial based on config)
  const processChunk = async (chunk: {
    text: string;
    startOffset: number;
  }): Promise<ChunkResult> => {
    try {
      const result = await labelSpansSingle(
        {
          ...params,
          text: chunk.text,
        },
        aiService,
      );

      const spans: SpanLike[] = (result.spans || [])
        .filter(
          (span) =>
            typeof span.start === "number" && typeof span.end === "number",
        )
        .map((span) => ({
          ...span,
          start: span.start as number,
          end: span.end as number,
        }));

      return {
        spans,
        chunkOffset: chunk.startOffset,
        meta: result.meta,
        isAdversarial: result.isAdversarial === true,
      };
    } catch (error) {
      const err = error as Error;
      logger.error("Error processing chunk", err as Error, {
        operation: "labelSpansChunked",
        chunkOffset: chunk.startOffset,
        provider,
      });
      // Return empty spans for failed chunks to avoid blocking entire request
      return {
        spans: [],
        chunkOffset: chunk.startOffset,
        meta: null,
        isAdversarial: false,
      };
    }
  };

  let chunkResults: ChunkResult[];

  if (SpanLabelingConfig.CHUNKING.PROCESS_CHUNKS_IN_PARALLEL) {
    // Process chunks in parallel with concurrency limit
    const maxConcurrent = SpanLabelingConfig.CHUNKING.MAX_CONCURRENT_CHUNKS;
    chunkResults = [];

    for (let i = 0; i < chunks.length; i += maxConcurrent) {
      const batch = chunks.slice(i, i + maxConcurrent);
      const batchResults = await Promise.all(batch.map(processChunk));
      chunkResults.push(...batchResults);
    }
  } else {
    // Process chunks serially
    chunkResults = [];
    for (const chunk of chunks) {
      const result = await processChunk(chunk);
      chunkResults.push(result);
    }
  }

  // Merge spans from all chunks
  let mergedSpans = chunker.mergeChunkedSpans(chunkResults);
  const policy = sanitizePolicy(params.policy ?? null);
  const sanitizedOptions = sanitizeOptions({
    ...(params.maxSpans !== undefined && { maxSpans: params.maxSpans }),
    ...(params.minConfidence !== undefined && {
      minConfidence: params.minConfidence,
    }),
    ...(params.templateVersion !== undefined && {
      templateVersion: params.templateVersion,
    }),
  });
  const overlapResolved = resolveOverlaps(
    mergedSpans.map((span) => ({
      ...span,
      confidence: typeof span.confidence === "number" ? span.confidence : 0,
      text:
        typeof span.text === "string" ? span.text : String(span.quote ?? ""),
    })),
    policy.allowOverlap === true,
  );

  mergedSpans = overlapResolved.spans;
  const isAdversarial = chunkResults.some((r) => r.isAdversarial);

  if (isAdversarial) {
    mergedSpans = [];
  }

  const combinedMeta = {
    version: params.templateVersion || "v1",
    notes: `Processed ${chunks.length} chunks, ${mergedSpans.length} total spans${isAdversarial ? " | adversarial input flagged" : ""}`,
    chunked: true,
    chunkCount: chunks.length,
    totalWords: wordCount,
    provider,
  };

  const cache = new SubstringPositionCache();
  const validation = validateSpans({
    spans: mergedSpans,
    meta: combinedMeta,
    text: params.text,
    policy,
    options: sanitizedOptions,
    attempt: 2,
    cache,
    isAdversarial,
  });

  logger.info("Chunked processing complete", {
    operation: "labelSpansChunked",
    spanCount: validation.result.spans.length,
    chunkCount: chunks.length,
    provider,
  });

  return {
    spans: validation.result.spans,
    meta: validation.result.meta,
    ...(validation.result.isAdversarial !== undefined && {
      isAdversarial: validation.result.isAdversarial,
    }),
    ...(validation.result.analysisTrace !== undefined && {
      analysisTrace: validation.result.analysisTrace,
    }),
  };
}

/**
 * Terminal payload of {@link labelSpansStream}.
 *
 * The NDJSON wire is append-only — the client accumulates every line it
 * receives and has no way to retract one — so the stream cannot emit a
 * correction event for spans that the whole-set stages (merge, dedupe, overlap
 * resolution, truncation) decide to drop. Those stages therefore run
 * server-side at end of stream and their result is delivered here, as the
 * generator's return value, rather than as a new wire event. Callers that
 * persist the stream result (the cache backfill) must use this set: it is the
 * same set the blocking path would have produced.
 */
export interface SpanStreamFinalization {
  spans: SpanLike[];
  meta: LLMMeta;
}

/**
 * Stream spans using an LLM.
 * Bypasses NLP fast-path for immediate feedback.
 *
 * Yielded spans are what the per-span stages of {@link SpanProcessor} admit —
 * normalized, index-corrected, id-bearing, header/non-visual filtered, above
 * `minConfidence`, and capped at `maxSpans`. The generator's return value
 * carries the fully finalized set.
 */
export async function* labelSpansStream(
  params: LabelSpansParams,
  aiService: AIExecutionPort,
): AsyncGenerator<SpanLike, SpanStreamFinalization, unknown> {
  if (!params || typeof params.text !== "string" || !params.text.trim()) {
    throw new Error("text is required");
  }

  if (!aiService) {
    throw new Error("aiService is required");
  }

  const templateVersion =
    params.templateVersion ||
    SpanLabelingConfig.DEFAULT_OPTIONS.templateVersion;

  // Shape the stream for the provider the router will dispatch to. Resolved
  // before the adversarial short-circuit so every finalization is stamped.
  const executedBy = aiService.resolveExecution("span_labeling");

  // Pre-check for adversarial input
  const adversarialCheck = detectInjectionPatterns(params.text);
  if (adversarialCheck.hasPatterns) {
    logger.warn("Adversarial input detected in stream", {
      operation: "labelSpansStream",
      patterns: adversarialCheck.patterns,
    });
    return {
      spans: [],
      meta: {
        version: templateVersion,
        notes: "adversarial input flagged",
        provider: executedBy.provider,
      },
    };
  }

  const llmClient = createLlmClient(executedBy.provider);

  // Fallback if streaming not supported
  if (!llmClient.streamSpans) {
    logger.debug(
      "Client does not support streaming, falling back to blocking",
      {
        operation: "labelSpansStream",
        client: spanProfileIdFor(executedBy.provider),
      },
    );
    const result = await labelSpans(params, aiService);
    const positioned: SpanLike[] = result.spans
      .filter(
        (span) =>
          typeof span.start === "number" && typeof span.end === "number",
      )
      .map((span) => ({
        ...span,
        start: span.start as number,
        end: span.end as number,
      }));
    for (const span of positioned) {
      yield span;
    }
    // Already fully processed by labelSpans — no further staging to apply.
    return { spans: positioned, meta: result.meta };
  }

  // Setup params
  const policy = sanitizePolicy(params.policy ?? null);
  const sanitizedOptions = sanitizeOptions({
    ...(params.maxSpans !== undefined && { maxSpans: params.maxSpans }),
    ...(params.minConfidence !== undefined && {
      minConfidence: params.minConfidence,
    }),
    ...(params.templateVersion !== undefined && {
      templateVersion: params.templateVersion,
    }),
  });

  const cache = new SubstringPositionCache();
  const streamParams = {
    text: params.text,
    policy,
    options: sanitizedOptions,
    enableRepair: params.enableRepair === true,
    aiService,
    cache,
    nlpSpansAttempted: 0,
  };

  // The stream is a staged run of the same pipeline the blocking path runs:
  // per-span stages decide what goes on the wire now, whole-set stages run once
  // the provider is done and produce the authoritative set.
  //
  // Lenient mode matches the blocking path's effective end state — the stream
  // has no repair round-trip, so a span with an unrecognised role is coerced
  // rather than dropped, exactly as validateSpans(attempt: 2) would do.
  const processor = new SpanProcessor({
    text: params.text,
    policy,
    options: sanitizedOptions,
    cache,
    lenient: true,
  });

  for await (const rawSpan of llmClient.streamSpans(streamParams)) {
    const span = processor.accept(rawSpan);
    if (span) {
      yield span;
    }
  }

  const finalized = processor.finalize();
  return {
    spans: finalized.spans,
    meta: {
      version: sanitizedOptions.templateVersion ?? templateVersion,
      notes: finalized.notes.filter(Boolean).join(" | "),
      provider: executedBy.provider,
    },
  };
}
