/**
 * Centralized configuration for span labeling
 *
 * All constants and defaults extracted from spanLabeler.js
 * This makes it easy to tune performance and behavior without
 * touching the core logic.
 */

import {
  SPAN_LABELING_DEFAULT_POLICY,
  SPAN_LABELING_TEMPLATE_VERSIONS,
} from "#shared/spanLabeling.ts";

/**
 * Performance and capacity constants
 */
export const PERFORMANCE = {
  // Hard upper bound to prevent excessive processing
  MAX_SPANS_ABSOLUTE_LIMIT: 80,

  // Conservative default for response generation
  DEFAULT_MAX_TOKENS: 800,

  // Base tokens for response structure (JSON overhead)
  TOKEN_ESTIMATION_BASE: 400,

  // Average tokens per span in response
  TOKEN_ESTIMATION_PER_SPAN: 25,

  // Absolute maximum tokens for any response
  MAX_TOKEN_RESPONSE_LIMIT: 4000,
} as const;

/**
 * Default validation policy
 *
 * Wire contract — shared with the client so evaluations validate under the
 * same limits production enforces.
 */
export const DEFAULT_POLICY = SPAN_LABELING_DEFAULT_POLICY;

/**
 * Default processing options
 */
export const DEFAULT_OPTIONS = {
  // Maximum number of spans to return
  maxSpans: 60,

  // Minimum confidence threshold (0-1)
  minConfidence: 0.5,

  // Wire contract — the client sends this same value, and it is hashed into
  // the SpanLabelingCacheService key by `generateCacheKey`.
  templateVersion: SPAN_LABELING_TEMPLATE_VERSIONS.STANDARD,
} as const;

/**
 * Default confidence value for uncertain spans
 */
export const DEFAULT_CONFIDENCE = 0.7;

/**
 * LLM model configuration
 */
export const MODEL_CONFIG = {
  // Temperature for span labeling (0 = deterministic)
  temperature: 0,

  // Default timeout for LLM calls (ms)
  timeout: 30000,
} as const;

/**
 * Validation modes
 */
export const VALIDATION_MODES = {
  // Strict validation - fails on any error
  STRICT: 1,

  // Lenient validation - drops invalid spans instead of failing
  LENIENT: 2,
} as const;

/**
 * Text chunking configuration for large prompts
 */
export const CHUNKING = {
  // Max words before chunking is triggered
  MAX_WORDS_PER_CHUNK: 400,

  // Overlap words between chunks to preserve seam context
  OVERLAP_WORDS: 50,

  // Max tokens to reserve for output (used in token estimation)
  OUTPUT_TOKEN_BUFFER: 2000,

  // Whether to process chunks in parallel
  PROCESS_CHUNKS_IN_PARALLEL: true,

  // Max concurrent chunk requests
  MAX_CONCURRENT_CHUNKS: 3,
} as const;

/**
 * NLP Fast-Path Configuration
 * Enables dictionary-based span extraction to bypass expensive LLM calls
 *
 * Uses neuro-symbolic pipeline (Aho-Corasick + GLiNER) to extract:
 * - Technical terms (camera movements, shot types, etc.) via Aho-Corasick
 * - Semantic entities (subjects, locations, actions, etc.) via GLiNER
 *
 * Bypasses LLM when sufficient spans are found (≥MIN_SPANS_THRESHOLD).
 */
export const NLP_FAST_PATH = {
  // Enable NLP-based dictionary matching
  // Combines NLP technical terms with GLiNER semantic extraction
  ENABLED: false, // ❌ Disabled - Using Gemini for span extraction

  // Minimum spans to consider NLP sufficient
  MIN_SPANS_THRESHOLD: 3,

  // Minimum coverage percentage to skip LLM (0-100)
  MIN_COVERAGE_PERCENT: 30,

  // Allow sparse but high-confidence spans to bypass expected span count
  SPARSE_MIN_SPANS: 1,
  SPARSE_HIGH_CONFIDENCE_THRESHOLD: 0.85,
  SPARSE_MIN_SIGNAL_SPANS: 1,

  // Enable detailed metrics tracking
  TRACK_METRICS: true,

  // Enable telemetry for cost savings calculation
  TRACK_COST_SAVINGS: true,
} as const;

/**
 * Compromise NLP Configuration (Tier 1.5a)
 * Verb phrase extraction for action detection
 * Positioned between Aho-Corasick (Tier 1) and GLiNER (Tier 2)
 */
export const COMPROMISE = {
  // Enable Compromise-based verb extraction
  ENABLED: false, // ❌ Disabled - Using Gemini for action extraction

  // Minimum confidence for extracted actions
  MIN_CONFIDENCE: 0.75,

  // Extract full verb phrases (e.g., "running through the park")
  EXTRACT_VERB_PHRASES: true,

  // Extract standalone gerunds (e.g., "running", "jogging")
  EXTRACT_GERUNDS: true,

  // Include adverbs in verb phrases (e.g., "running energetically")
  INCLUDE_ADVERBS: true,

  // Include objects in verb phrases (e.g., "catching a ball")
  INCLUDE_OBJECTS: true,

  // Maximum words in a verb phrase
  MAX_PHRASE_WORDS: 5,

  // Pre-warm on server startup
  PREWARM_ON_STARTUP: true,
} as const;

/**
 * Lighting Extraction Configuration (Tier 1.5b)
 * Pattern-based lighting phrase extraction using Compromise + semantic embeddings
 * Runs in parallel with COMPROMISE for action extraction
 *
 * Architecture:
 * - Extract: POS patterns (#Adjective* + lighting_noun)
 * - Classify: Semantic embeddings (LightingSemantics.ts)
 *
 * Fixes the "soft shadows", "gentle shadows" extraction issue from baseline.
 */
export const LIGHTING = {
  // Enable lighting extraction service
  ENABLED: false, // ❌ Disabled - Using Gemini for lighting extraction

  // Minimum confidence for extracted lighting spans
  MIN_CONFIDENCE: 0.7,

  // Maximum words in a lighting phrase
  MAX_PHRASE_WORDS: 5,

  // Pre-warm semantic classifier on server startup
  PREWARM_ON_STARTUP: true,
} as const;

/**
 * Neuro-Symbolic NLP Configuration
 * 4-Tier architecture: Aho-Corasick → Compromise → GLiNER → LLM
 */
export const NEURO_SYMBOLIC = {
  // Master switch for neuro-symbolic pipeline
  // ENABLED: Now uses AHO_CORASICK for technical terms (100% accurate)
  // then falls back to LLM for open vocabulary (subjects, actions, etc.)
  ENABLED: false, // ❌ Disabled - Using pure Gemini for span extraction

  // Tier 1: Aho-Corasick (Closed Vocabulary)
  AHO_CORASICK: {
    // Always enabled - O(N) single pass, 100% precision
    ENABLED: true,
  },

  // Tier 2: GLiNER (Open Vocabulary)
  GLINER: {
    // Disabled by default; keep available for controlled experiments only
    ENABLED: false,

    // Run GLiNER inference in a worker thread to avoid main-thread blocking
    USE_WORKER: true,

    // Model path (ONNX format)
    MODEL_PATH: "onnx-community/gliner_small-v2.1",

    // Confidence threshold for entity detection (0-1)
    THRESHOLD: 0.3,

    // Maximum token width for entity detection
    MAX_WIDTH: 12,

    // Timeout for GLiNER inference (ms)
    TIMEOUT: 5000,

    // Allow multiple labels per span (higher recall, more noise)
    MULTI_LABEL: false,

    // Optional per-label threshold overrides (by label or taxonomy ID)
    LABEL_THRESHOLDS: {} as Record<string, number>,

    // Pre-warm model on server startup
    PREWARM_ON_STARTUP: true,
  },

  // Merge strategy configuration
  MERGE: {
    // Priority: closed vocabulary always wins conflicts
    CLOSED_VOCAB_PRIORITY: true,

    // Overlap strategy: 'longest-match' or 'highest-confidence'
    OVERLAP_STRATEGY: "longest-match" as const,
  },

  // Fallback to LLM if neuro-symbolic produces insufficient results
  FALLBACK_TO_LLM: false, // Temporarily disabled for testing

  // Minimum spans to skip LLM fallback
  MIN_SPANS_THRESHOLD: 3,

  // Maximum processing time (ms) before LLM fallback
  MAX_PROCESSING_TIME: 200,
} as const;

/**
 * @deprecated Use NEURO_SYMBOLIC instead
 * Symbolic NLP Configuration (Legacy - kept for backward compatibility)
 */
export const SYMBOLIC_NLP = {
  // Master switch for symbolic NLP pipeline
  ENABLED: false, // Disabled - replaced by NEURO_SYMBOLIC

  // Feature flags for individual components
  FEATURES: {
    // Penn Treebank POS tagging with Brill transformation rules
    POS_TAGGING: false,

    // Shallow parsing / chunking (NP/VP/PP extraction)
    CHUNKING: false,

    // Frame semantics (Motion, Cinematography, Lighting)
    FRAME_SEMANTICS: false,

    // Semantic role labeling (Arg0/Arg1/ArgM)
    SEMANTIC_ROLES: false,
  },

  // Fallback strategy if symbolic processing fails
  FALLBACK_TO_DICTIONARY: true,

  // Fallback to LLM if symbolic processing produces insufficient results
  FALLBACK_TO_LLM: false,

  // Minimum confidence threshold for accepting symbolic spans (0-1)
  MIN_CONFIDENCE_THRESHOLD: 0.8,

  // Minimum number of semantic spans to consider successful
  MIN_SEMANTIC_SPANS: 15,

  // NEW: Require at least 3 frames matched
  MIN_FRAMES: 3,

  // NEW: At least 10% of chunks should be VPs
  MIN_VP_RATIO: 0.1,

  // Enable detailed semantic metadata in response
  INCLUDE_SEMANTIC_METADATA: true,

  // Enable relationship graph in response
  INCLUDE_RELATIONSHIPS: true,

  // Maximum processing time (ms) before fallback
  MAX_PROCESSING_TIME: 100,
} as const;

/**
 * Get estimated max tokens for a given number of spans
 */
export function estimateMaxTokens(maxSpans: number): number {
  const estimated =
    PERFORMANCE.TOKEN_ESTIMATION_BASE +
    maxSpans * PERFORMANCE.TOKEN_ESTIMATION_PER_SPAN;
  return Math.min(PERFORMANCE.MAX_TOKEN_RESPONSE_LIMIT, estimated);
}

/**
 * Configuration export
 */
const SpanLabelingConfig = {
  PERFORMANCE,
  DEFAULT_POLICY,
  DEFAULT_OPTIONS,
  DEFAULT_CONFIDENCE,
  MODEL_CONFIG,
  VALIDATION_MODES,
  CHUNKING,
  NLP_FAST_PATH,
  COMPROMISE,
  LIGHTING,
  NEURO_SYMBOLIC,
  SYMBOLIC_NLP, // @deprecated - kept for backward compatibility
  estimateMaxTokens,
};

export default SpanLabelingConfig;
