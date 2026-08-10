/**
 * AI Model Configuration
 *
 * Centralized configuration for routing LLM operations to specific providers.
 * This enables zero-code provider switching via configuration or environment variables.
 *
 * Architecture: Dead Simple Router Pattern
 * - Each operation maps to a specific client + model configuration
 * - Supports automatic fallback to alternative providers
 * - Environment variables override defaults for production flexibility
 *
 * Provider-Specific Optimizations:
 * - OpenAI: Temperature 0.0 for structured outputs (grammar-constrained)
 * - Groq/Qwen: Temperature 0.1 for structured outputs (avoids repetition loops)
 * - Seed parameter for reproducibility where determinism matters
 *
 * Entry status: this file is the lookup agents and humans grep to answer
 * "which provider/model does operation X actually run on", so every entry
 * must resolve to something real. An operation belongs here only if it is
 * either (a) wired — some `aiService.execute("<op>", …)` call site exists —
 * or (b) explicitly marked RESERVED / FROZEN on the entry, with the reason.
 * Unmarked operations with no call site are fiction; delete them.
 */

interface ModelConfigEntry {
  client: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeout: number;
  fallbackTo?: string;
  fallbackConfig?: {
    model: string;
    timeout: number;
  };
  strictClient?: boolean;
  responseFormat?: "json_object";
  /** Enable seed-based reproducibility for this operation */
  useSeed?: boolean;
  /** Use developer message for hard constraints (OpenAI only) */
  useDeveloperMessage?: boolean;
  /** Gemini 2.5+ only: caps thinking tokens, which count against maxTokens. 0 disables thinking. */
  thinkingBudget?: number;
}

/**
 * The Groq-hosted Qwen model every Qwen-routed operation defaults to.
 * Groq retires model ids out from under us (qwen/qwen3-32b started
 * 404ing 2026-07-31, which silently disabled the whole adapter at boot);
 * this constant is the single source the config sites share, and the
 * qwen-model regression test pins llmCosts and the adapter default to it.
 */
export const DEFAULT_QWEN_MODEL = "qwen/qwen3.6-27b";

const QWEN_FALLBACK = {
  model: process.env.QWEN_MODEL || DEFAULT_QWEN_MODEL,
  timeout: parseInt(process.env.QWEN_TIMEOUT_MS || "10000", 10),
};

/**
 * Model Configuration Object
 *
 * Each operation defines:
 * - client: Which API client to use ('openai', 'qwen', 'groq', or 'gemini')
 * - model: Specific model identifier
 * - temperature: Sampling temperature (0-2)
 * - maxTokens: Maximum tokens to generate
 * - timeout: Request timeout in milliseconds
 * - fallbackTo: (Optional) Alternative client if primary fails
 * - useSeed: (Optional) Enable seed-based reproducibility
 * - useDeveloperMessage: (Optional) Use developer role for constraints
 */
const MODEL_CONFIG_ENTRIES = {
  // ============================================================================
  // Prompt Optimization Operations
  // ============================================================================

  /**
   * Standard prompt optimization (quality-focused)
   * Uses OpenAI GPT-4o for best results
   * Note: Temperature kept at 0.7 for creative text generation (not structured output)
   */
  optimize_standard: {
    client: process.env.OPTIMIZE_PROVIDER || "openai",
    model: process.env.OPTIMIZE_MODEL || "gpt-4o-2024-08-06",
    temperature: 0.7,
    maxTokens: 4096,
    timeout: 60000,
    fallbackTo: "qwen",
    fallbackConfig: QWEN_FALLBACK,
    useDeveloperMessage: true, // GPT-4o: Use developer role for format constraints
  },

  /**
   * Quality assessment of prompts
   */
  optimize_quality_assessment: {
    client: "openai",
    model: "gpt-4o-mini",
    temperature: 0.2,
    maxTokens: 1024,
    timeout: 30000,
    useSeed: true, // Consistent quality scores
  },

  /**
   * Shot interpretation (maps raw concept to flexible shot plan)
   * Uses structured output - temperature 0.0 per GPT-4o best practices
   */
  optimize_shot_interpreter: {
    client: "openai",
    model: "gpt-4o-mini-2024-07-18",
    temperature: 0.0, // Deterministic mapping for structured output
    maxTokens: 600,
    timeout: 15000,
    responseFormat: "json_object",
    useSeed: true, // Same concept should produce same shot plan
    useDeveloperMessage: true,
  },

  /**
   * RESERVED — no caller yet. Intent preservation check (evaluation-only),
   * deterministic JSON output for pass/fail gating. Kept because it is the
   * sanctioned LLM replacement for the wordlist-based intent classifier;
   * delete only if that plan is abandoned.
   */
  optimize_intent_check: {
    client: "openai",
    model: "gpt-4o-mini-2024-07-18",
    temperature: 0.0,
    maxTokens: 700,
    timeout: 20000,
    responseFormat: "json_object",
    useSeed: true,
    useDeveloperMessage: true,
  },

  // ============================================================================
  // Enhancement Operations (Suggestion Generation)
  // ============================================================================

  /**
   * Main enhancement suggestion generation
   *
   * Provider-specific temperature:
   * - OpenAI (when used): 0.0 for structured output
   * - Qwen: 0.1 (configured here, adapter may override)
   *
   * Diversity is achieved through:
   * - Prompt: "Generate 12 DIVERSE alternatives"
   * - V2 slot-policy scoring + diversity enforcement post-processing
   */
  enhance_suggestions: {
    client: process.env.ENHANCE_PROVIDER || "qwen",
    model: process.env.ENHANCE_MODEL || DEFAULT_QWEN_MODEL,
    temperature: 0.1, // Keep low temp for reliable JSON; diversity enforced by prompting/post-processing
    maxTokens: 1024,
    timeout: 8000,
    responseFormat: "json_object",
    fallbackTo: "openai",
    // Note: Seed not used - we want variation in suggestions
    useDeveloperMessage: true,
  },

  /**
   * Custom suggestion requests (user-directed replacements)
   */
  custom_suggestions: {
    client: process.env.ENHANCE_PROVIDER || "qwen",
    model: process.env.ENHANCE_MODEL || DEFAULT_QWEN_MODEL,
    temperature: 0.1,
    maxTokens: 1024,
    timeout: 8000,
    responseFormat: "json_object",
    fallbackTo: "openai",
    useDeveloperMessage: true,
  },

  /**
   * Suggestion deduplication (diversity enforcement)
   */
  enhance_diversity: {
    client: "openai",
    model: "gpt-4o-mini-2024-07-18",
    temperature: 0.2,
    maxTokens: 512,
    timeout: 20000,
    useSeed: true, // Consistent deduplication
  },

  /**
   * Scene-change detection between two prompt revisions.
   *
   * Reached through StructuredOutputEnforcer from the
   * /api/enhancement/scene-change route. It had no entry here and silently
   * resolved to DEFAULT_CONFIG; these values are that fallback made explicit,
   * so the operation now declares the provider it has always run on.
   */
  video_scene_change_detection: {
    client: "openai",
    model: "gpt-4o-mini-2024-07-18",
    temperature: 0.0,
    maxTokens: 2048,
    timeout: 30000,
    useSeed: false,
    useDeveloperMessage: false,
  },

  /**
   * Prompt-wide coherence checks after span edits
   */
  prompt_coherence_check: {
    client: "openai",
    model: "gpt-4o-mini-2024-07-18",
    temperature: 0.2,
    maxTokens: 2048,
    timeout: 25000,
    responseFormat: "json_object",
    useSeed: true, // Consistent coherence findings
    useDeveloperMessage: true,
  },

  // ============================================================================
  // Span Labeling Operations (Video Prompt Analysis)
  // ============================================================================

  /**
   * Label spans in video prompts
   *
   * Qwen/Groq best practices (via Groq-hosted Qwen models):
   * - Temperature 0.1 (not 0.0 - avoids repetition loops)
   * - Sandwich prompting for format adherence
   * - XML tagging for data segmentation
   */
  span_labeling: {
    client: process.env.SPAN_PROVIDER || "gemini",
    model: process.env.SPAN_MODEL || "gemini-2.5-flash",
    temperature: 0.1, // Low temperature for reliable JSON
    maxTokens: 4096,
    timeout: 30000,
    responseFormat: "json_object",
    fallbackTo: "qwen",
    fallbackConfig: {
      model: DEFAULT_QWEN_MODEL,
      timeout: 45000,
    },
    useSeed: true, // Same text should label identically
  },

  // ============================================================================
  // Video Prompt Analysis Operations
  // ============================================================================

  /**
   * Structured IR extraction for video prompt analysis.
   */
  video_prompt_ir_extraction: {
    client: "gemini",
    model: process.env.VIDEO_PROMPT_IR_MODEL || "gemini-2.5-flash",
    temperature: 0.1,
    maxTokens: 4096,
    timeout: 30000,
    responseFormat: "json_object",
    // Expansion is the product's core loop — never let a single dead
    // provider silently degrade it to the deterministic template.
    fallbackTo: "openai",
    useSeed: true,
    useDeveloperMessage: true,
  },

  /**
   * Prompt rewrite for model-specific video prompt optimization.
   */
  video_prompt_rewrite: {
    client: "gemini",
    model: process.env.VIDEO_PROMPT_REWRITE_MODEL || "gemini-2.5-flash",
    temperature: 0.4,
    maxTokens: 8192,
    timeout: 45000,
    // Expansion is the product's core loop — never let a single dead
    // provider silently degrade it to the deterministic template.
    fallbackTo: "openai",
    useDeveloperMessage: true,
    // Thinking tokens count against maxTokens on Gemini 2.5; uncapped dynamic
    // thinking consumed most of the budget and truncated rewrites mid-sentence.
    thinkingBudget: 0,
  },

  // ============================================================================
  // Image Observation (I2V)
  // ============================================================================

  /**
   * Image observation for i2v constraints
   * Requires a vision-capable model.
   */
  image_observation: {
    client: process.env.IMAGE_OBSERVATION_PROVIDER || "openai",
    model: process.env.IMAGE_OBSERVATION_MODEL || "gpt-4o-mini-2024-07-18",
    temperature: 0.1,
    maxTokens: 800,
    timeout: 30000,
    responseFormat: "json_object",
    useSeed: false,
  },

  /**
   * FROZEN (ADR-0002) — no caller today; retained, not swept.
   * Frame verification: per-span presence verdicts against a generated frame.
   * Requires a vision-capable model. Temperature 0 for deterministic judging.
   */
  frame_verification: {
    client: process.env.FRAME_VERIFICATION_PROVIDER || "openai",
    // gpt-4o (not mini): the eval gate (P>=0.85, R>=0.75) only passes with
    // gpt-4o + detail:"high" — mini stalls at R~0.64 on fine-detail spans.
    model: process.env.FRAME_VERIFICATION_MODEL || "gpt-4o-2024-08-06",
    temperature: 0,
    maxTokens: 2048,
    timeout: 45000,
    responseFormat: "json_object",
    useSeed: true, // Same (spans, frame) should judge identically
  },

  /**
   * FROZEN (ADR-0002) — continuity's display-only style read of a reference
   * image. Wired (StyleAnalysisService) but inside a frozen stack.
   * Requires a vision-capable model. It had no entry here and silently
   * resolved to DEFAULT_CONFIG; these values are that fallback made explicit.
   */
  style_analysis: {
    client: "openai",
    model: "gpt-4o-mini-2024-07-18",
    temperature: 0.0,
    maxTokens: 2048,
    timeout: 30000,
    useSeed: false,
    useDeveloperMessage: false,
  },

  /**
   * Role classification for spans
   * Temperature 0.0 for deterministic classification
   */
  role_classification: {
    client: process.env.ROLE_PROVIDER || "openai",
    model: process.env.ROLE_MODEL || "gpt-4o-mini-2024-07-18",
    temperature: 0,
    maxTokens: 600,
    timeout: 20000,
    fallbackTo: "qwen",
    fallbackConfig: QWEN_FALLBACK,
    useSeed: true, // Same spans should classify identically
    useDeveloperMessage: true,
  },

  /**
   * Requirements extraction for model-intelligence recommendations.
   * Reads a prompt and reports objective visual/physical observations as JSON.
   * Full GPT-4o (not mini) — recommendation quality hinges on this perception
   * correctly handling negation, synonyms, and inflected forms. Temperature 0
   * for deterministic perception.
   */
  requirements_extraction: {
    client: process.env.REQUIREMENTS_PROVIDER || "openai",
    model: process.env.REQUIREMENTS_MODEL || "gpt-4o-2024-08-06",
    temperature: 0,
    maxTokens: 1024,
    timeout: 30000,
    responseFormat: "json_object",
    fallbackTo: "qwen",
    fallbackConfig: QWEN_FALLBACK,
    useSeed: true, // Same prompt should perceive identically
    useDeveloperMessage: true,
  },

  // ============================================================================
  // Studio (ADR-0019 — conversational image workspace)
  // ============================================================================

  /**
   * Studio conversation policy: one JSON decision per turn (clarify /
   * generate / edit / transform / diagnose / negotiate), with the
   * `thinking` field streamed to the client as it generates.
   * gpt-5.6-luna (owner-directed 2026-07-25, verified against the live
   * models API) carries the routing and prompt-writing judgment; still
   * env-swappable per operation. Temperature 0.7 — the decision includes
   * creative prompt writing.
   */
  studio_turn: {
    client: process.env.STUDIO_TURN_PROVIDER || "openai",
    model: process.env.STUDIO_TURN_MODEL || "gpt-5.6-luna",
    // luna (gpt-5 reasoning family) accepts only the default temperature,
    // and its internal reasoning tokens count against the completion
    // budget — 8000 leaves the ~1k-token JSON decision plenty of headroom.
    temperature: 1,
    maxTokens: 8000,
    timeout: 60000,
    responseFormat: "json_object",
  },

  // ============================================================================
  // LLM-as-a-Judge Operations
  // ============================================================================

  /**
   * LLM-as-a-Judge for video prompt evaluation
   */
  llm_judge_video: {
    client: process.env.JUDGE_PROVIDER || "openai",
    model: process.env.JUDGE_MODEL || "gpt-4o-2024-08-06",
    temperature: 0.2,
    maxTokens: 2048,
    timeout: 45000,
    fallbackTo: "gemini",
    useSeed: true, // Consistent evaluation scores
    useDeveloperMessage: true,
  },

  /**
   * LLM-as-a-Judge for general text evaluation
   *
   * Was `client: "anthropic"` / `model: "claude-sonnet-4"` — a provider with
   * no adapter, no DI registration and no API key. The router silently
   * remapped it to OpenAI with OpenAI's *default* model, so the declared
   * judge never ran and the entry was fiction (the rule at the top of this
   * file forbids exactly that). Naming the provider that actually runs it
   * also makes the judge model deliberate rather than inherited.
   */
  llm_judge_general: {
    client: process.env.JUDGE_GENERAL_PROVIDER || "openai",
    model: process.env.JUDGE_GENERAL_MODEL || "gpt-4o-2024-08-06",
    temperature: 0.3,
    maxTokens: 2048,
    timeout: 45000,
    fallbackTo: "gemini",
    useSeed: true, // Consistent evaluation
  },
} as const satisfies Record<string, ModelConfigEntry>;

/**
 * Every configured operation, as a literal union.
 *
 * Use it to constrain call sites that pass an operation LITERAL — a
 * misspelling is then a compile error instead of a silent fall-through to
 * DEFAULT_CONFIG (gpt-4o-mini at temperature 0). Call sites holding a runtime
 * string narrow with `isOperationName` rather than casting.
 */
export type OperationName = keyof typeof MODEL_CONFIG_ENTRIES;

/**
 * Keyed by the literal union, so indexing it with an unconfigured operation is
 * a compile error rather than an `undefined` that falls through to
 * DEFAULT_CONFIG. Code holding a runtime string narrows with `isOperationName`
 * first.
 */
export const ModelConfig: Record<OperationName, ModelConfigEntry> =
  MODEL_CONFIG_ENTRIES;

/** Narrow a runtime string to a configured operation. */
export function isOperationName(operation: string): operation is OperationName {
  return Object.hasOwn(MODEL_CONFIG_ENTRIES, operation);
}

const WAN_2_2_T2V_FAST = "wan-video/wan-2.2-t2v-fast";
const WAN_2_2_I2V_FAST = "wan-video/wan-2.2-i2v-fast";
const WAN_2_5_I2V = process.env.WAN_2_5_I2V_MODEL || "wan-video/wan-2.5-i2v";
const DEFAULT_DRAFT_I2V_MODEL = process.env.DRAFT_I2V_MODEL || WAN_2_5_I2V;

/**
 * Video Models Configuration (Dec 2025 Update)
 *
 * The catalogue of video generation models. These keys are *labels for model
 * ids*, not a lifecycle: a clip generated with `DRAFT` is not superseded by
 * one generated with `PRO`. Both are takes. The creator-facing tier is the
 * `draft | render` choice the client makes per generation — see the "Draft
 * tier" row in the CLAUDE.md Domain Glossary.
 *
 * `DRAFT` and `PRO` currently resolve to the SAME model. Anything that needs
 * to tell them apart must key off something other than these two constants.
 */
export const VIDEO_MODELS = {
  /** ⚡ Cheap, fast t2v. Same id as `PRO` — see the note above. */
  DRAFT: WAN_2_2_T2V_FAST,

  /** ⚡ DRAFT TIER i2v: image-to-video fast (toggle via DRAFT_I2V_MODEL). */
  DRAFT_I2V: DEFAULT_DRAFT_I2V_MODEL,

  /** ⚡ DRAFT TIER i2v (legacy Wan 2.2). */
  DRAFT_I2V_LEGACY: WAN_2_2_I2V_FAST,

  /** ⚡ DRAFT TIER i2v (Wan 2.5). */
  DRAFT_I2V_WAN_2_5: WAN_2_5_I2V,

  /**
   * 🎬 The process-wide default video model (`videoModelRegistry`). Despite the
   * name it is the same cheap t2v id as `DRAFT` — it is NOT a cinematic 1080p
   * tier, and nothing paid gates on it.
   */
  PRO: WAN_2_2_T2V_FAST,

  /** 🌌 FLAGSHIP: OpenAI Sora 2 (text/image → video, audio-capable). */
  SORA_2: "sora-2",

  /** 🌌 FLAGSHIP (PRO): OpenAI Sora 2 Pro (higher quality, slower). */
  SORA_2_PRO: "sora-2-pro",

  /** 🎥 TEXT → VIDEO: Kling v2.1 (official API). */
  KLING_V2_1: "kling-v2-1-master",

  /** 🌈 HDR / REASONING: Luma Ray-3 (Dream Machine). */
  LUMA_RAY3: "luma-ray3",

  /** 🔊 AUDIO: Google Veo 3.1 (official Gemini API, text → video with audio). */
  VEO_3: "google/veo-3",

  /** 🎨 ARTISTIC / SPECIALIZED: High style adherence. */
  ARTISTIC: "genmo/mochi-1-final",

  /** 🔒 PROPRIETARY FALLBACKS (API Wrappers / BYOK) */
  TIER_1: "minimax/video-02", // Hailuo-02
  TIER_2: "google/veo-3", // Google Veo
};

/**
 * Baseline settings for a provider that has no per-operation entry — used when
 * routing remaps an operation onto a fallback client. It is no longer reachable
 * as an operation lookup result: an unconfigured operation is a compile error.
 * Temperature 0.0 for structured outputs by default.
 */
export const DEFAULT_CONFIG: ModelConfigEntry = {
  client: "openai",
  model: "gpt-4o-mini-2024-07-18",
  temperature: 0.0,
  maxTokens: 2048,
  timeout: 30000,
  useSeed: false,
  useDeveloperMessage: false,
};

/**
 * Helper function to get configuration for an operation
 */
export function getModelConfig(operation: OperationName): ModelConfigEntry {
  return ModelConfig[operation];
}

/**
 * Helper function to list all configured operations
 */
export function listOperations(): string[] {
  return Object.keys(ModelConfig);
}

/**
 * Check if an operation should use seed for reproducibility
 */
export function shouldUseSeed(operation: OperationName): boolean {
  return ModelConfig[operation].useSeed ?? false;
}

/**
 * Check if an operation should use developer message (OpenAI)
 */
export function shouldUseDeveloperMessage(operation: OperationName): boolean {
  return ModelConfig[operation].useDeveloperMessage ?? false;
}
