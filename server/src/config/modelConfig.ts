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

type OperationName = keyof typeof ModelConfig;

const QWEN_FALLBACK = {
  model: process.env.QWEN_MODEL || "qwen/qwen3-32b",
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
export const ModelConfig: Record<string, ModelConfigEntry> = {
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
   * Context inference for reasoning mode
   */
  optimize_context_inference: {
    client: "openai",
    model: "gpt-4o-mini-2024-07-18",
    temperature: 0.2,
    maxTokens: 1024,
    timeout: 30000,
    useSeed: true, // Deterministic context detection
  },

  /**
   * Mode detection (determine optimal optimization strategy)
   */
  optimize_mode_detection: {
    client: "openai",
    model: "gpt-4o-mini-2024-07-18",
    temperature: 0.2,
    maxTokens: 512,
    timeout: 20000,
    useSeed: true, // Same prompt should detect same mode
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
   * Intent preservation check (evaluation-only)
   * Deterministic JSON output for pass/fail gating.
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
    model: process.env.ENHANCE_MODEL || "qwen/qwen3-32b",
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
    model: process.env.ENHANCE_MODEL || "qwen/qwen3-32b",
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
  // Video Concept Operations
  // ============================================================================

  /**
   * Video concept suggestion generation
   */
  video_concept_suggestions: {
    client: process.env.VIDEO_PROVIDER || "openai",
    model: process.env.VIDEO_MODEL || "gpt-4o-2024-08-06",
    temperature: 0.8,
    maxTokens: 2048,
    timeout: 45000,
    fallbackTo: "qwen",
    fallbackConfig: QWEN_FALLBACK,
    useDeveloperMessage: true,
  },

  /**
   * Scene completion (fill empty elements)
   */
  video_scene_completion: {
    client: "openai",
    model: "gpt-4o-mini-2024-07-18",
    temperature: 0.7,
    maxTokens: 1024,
    timeout: 30000,
  },

  /**
   * Scene variation generation
   * Note: High temperature for creativity, no seed (want variation)
   */
  video_scene_variation: {
    client: "openai",
    model: "gpt-4o-2024-08-06",
    temperature: 0.9,
    maxTokens: 1536,
    timeout: 40000,
  },

  /**
   * Concept parsing (text to structured elements)
   * Temperature 0.0 for deterministic parsing
   */
  video_concept_parsing: {
    client: "openai",
    model: "gpt-4o-mini-2024-07-18",
    temperature: 0.0,
    maxTokens: 1024,
    timeout: 25000,
    responseFormat: "json_object",
    useSeed: true, // Same concept should parse identically
    useDeveloperMessage: true,
  },

  /**
   * Element refinement for coherence
   */
  video_refinement: {
    client: "openai",
    model: "gpt-4o-2024-08-06",
    temperature: 0.6,
    maxTokens: 1536,
    timeout: 35000,
  },

  /**
   * Technical parameter generation (camera, lighting)
   */
  video_technical_params: {
    client: "openai",
    model: "gpt-4o-mini-2024-07-18",
    temperature: 0.2,
    maxTokens: 1024,
    timeout: 25000,
    useSeed: true, // Consistent technical params
  },

  /**
   * Prompt validation and smart defaults
   */
  video_validation: {
    client: "openai",
    model: "gpt-4o-mini-2024-07-18",
    temperature: 0.2,
    maxTokens: 1024,
    timeout: 25000,
    useSeed: true, // Consistent validation
  },

  /**
   * Compatibility checking (semantic + thematic)
   */
  video_compatibility: {
    client: "openai",
    model: "gpt-4o-mini",
    temperature: 0.2,
    maxTokens: 512,
    timeout: 20000,
    useSeed: true, // Consistent compatibility scores
  },

  /**
   * Conflict detection between elements
   */
  video_conflict_detection: {
    client: "openai",
    model: "gpt-4o-mini-2024-07-18",
    temperature: 0.2,
    maxTokens: 1024,
    timeout: 25000,
    useSeed: true, // Consistent conflict detection
  },

  /**
   * Scene change detection
   */
  video_scene_detection: {
    client: "openai",
    model: "gpt-4o-mini-2024-07-18",
    temperature: 0.2,
    maxTokens: 1024,
    timeout: 25000,
    useSeed: true, // Consistent scene detection
  },

  // ============================================================================
  // Question Generation Operations
  // ============================================================================

  /**
   * Generate clarifying questions for prompt improvement
   * Temperature 0.0 for structured output
   */
  question_generation: {
    client: process.env.QUESTION_PROVIDER || "openai",
    model: process.env.QUESTION_MODEL || "gpt-4o-mini-2024-07-18",
    temperature: 0.0, // Deterministic question generation
    maxTokens: 2048,
    timeout: 30000,
    responseFormat: "json_object",
    fallbackTo: "qwen",
    fallbackConfig: QWEN_FALLBACK,
    useSeed: true, // Same prompt should generate same questions
    useDeveloperMessage: true,
  },

  // ============================================================================
  // Text Categorization Operations
  // ============================================================================

  /**
   * Categorize text into taxonomy
   * Temperature 0.0 for deterministic categorization
   */
  text_categorization: {
    client: process.env.CATEGORIZE_PROVIDER || "openai",
    model: process.env.CATEGORIZE_MODEL || "gpt-4o-mini-2024-07-18",
    temperature: 0.0,
    maxTokens: 1024,
    timeout: 25000,
    responseFormat: "json_object",
    useSeed: true, // Same text should categorize identically
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
      model: "qwen/qwen3-32b",
      timeout: 45000,
    },
    useSeed: true, // Same text should label identically
  },

  /**
   * Explicit Gemini configuration for span labeling
   * Used by GeminiLlmClient to force Gemini usage regardless of SPAN_PROVIDER
   */
  span_labeling_gemini: {
    client: "gemini",
    model: "gemini-2.5-flash",
    temperature: 0.1,
    maxTokens: 16384,
    timeout: 45000,
    useSeed: true,
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
   * Frame verification: per-span presence verdicts against a generated frame.
   * Requires a vision-capable model. Temperature 0 for deterministic judging.
   */
  frame_verification: {
    client: process.env.FRAME_VERIFICATION_PROVIDER || "openai",
    model: process.env.FRAME_VERIFICATION_MODEL || "gpt-4o-mini-2024-07-18",
    temperature: 0,
    maxTokens: 2048,
    timeout: 45000,
    responseFormat: "json_object",
    useSeed: true, // Same (spans, frame) should judge identically
  },

  /**
   * Generate motion idea phrases from an image observation (I2V).
   * Fast model favored for short JSON outputs.
   */
  i2v_motion_ideas: {
    client: process.env.MOTION_IDEAS_PROVIDER || "groq",
    model: process.env.MOTION_IDEAS_MODEL || "llama-3.3-70b-versatile",
    temperature: 0.4,
    maxTokens: 200,
    timeout: 15000,
    responseFormat: "json_object",
    useSeed: false,
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
    fallbackTo: "anthropic",
    useSeed: true, // Consistent evaluation scores
    useDeveloperMessage: true,
  },

  /**
   * LLM-as-a-Judge for general text evaluation
   */
  llm_judge_general: {
    client: process.env.JUDGE_GENERAL_PROVIDER || "anthropic",
    model: process.env.JUDGE_GENERAL_MODEL || "claude-sonnet-4",
    temperature: 0.3,
    maxTokens: 2048,
    timeout: 45000,
    fallbackTo: "openai",
    useSeed: true, // Consistent evaluation
  },
};

const WAN_2_2_T2V_FAST = "wan-video/wan-2.2-t2v-fast";
const WAN_2_2_I2V_FAST = "wan-video/wan-2.2-i2v-fast";
const WAN_2_5_I2V = process.env.WAN_2_5_I2V_MODEL || "wan-video/wan-2.5-i2v";
const DEFAULT_DRAFT_I2V_MODEL = process.env.DRAFT_I2V_MODEL || WAN_2_5_I2V;

/**
 * Video Models Configuration (Dec 2025 Update)
 *
 * Defines the hierarchy of video generation models used in the application.
 */
export const VIDEO_MODELS = {
  /** ⚡ DRAFT TIER: Extremely cheap ($0.01), fast, decent motion. */
  DRAFT: WAN_2_2_T2V_FAST,

  /** ⚡ DRAFT TIER i2v: image-to-video fast (toggle via DRAFT_I2V_MODEL). */
  DRAFT_I2V: DEFAULT_DRAFT_I2V_MODEL,

  /** ⚡ DRAFT TIER i2v (legacy Wan 2.2). */
  DRAFT_I2V_LEGACY: WAN_2_2_I2V_FAST,

  /** ⚡ DRAFT TIER i2v (Wan 2.5). */
  DRAFT_I2V_WAN_2_5: WAN_2_5_I2V,

  /** 🎬 PRO TIER: Cinematic 1080p, MoE Architecture. Default for paid subscribers. */
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
 * Default configuration for operations not explicitly defined
 * Temperature 0.0 for structured outputs by default
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
export function getModelConfig(operation: string): ModelConfigEntry {
  return ModelConfig[operation] || DEFAULT_CONFIG;
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
export function shouldUseSeed(operation: string): boolean {
  const config = ModelConfig[operation];
  return config?.useSeed ?? false;
}

/**
 * Check if an operation should use developer message (OpenAI)
 */
export function shouldUseDeveloperMessage(operation: string): boolean {
  const config = ModelConfig[operation];
  return config?.useDeveloperMessage ?? false;
}
