import type { AIExecutionPort } from "@services/ai-model/ports/AIExecutionPort";
import type {
  BrainstormContext,
  DiversityEnforcer,
  EnhancementResult,
  Suggestion,
  VideoConstraints,
  VideoService,
} from "../services/types.js";

export type GenerationMode = "enumerated" | "templated" | "guided_llm";

export type GrammarKind =
  | "adjective_phrase"
  | "adverb_phrase"
  | "noun_phrase"
  | "technical_phrase"
  | "time_phrase"
  | "verb_phrase"
  | "freeform";

export type SemanticFamily =
  | "action"
  | "audio"
  | "camera_angle"
  | "camera_focus"
  | "camera_lens"
  | "camera_movement"
  | "environment_context"
  | "environment_location"
  | "environment_weather"
  | "lighting_direction"
  | "lighting_quality"
  | "lighting_source"
  | "lighting_time_of_day"
  | "shot_type"
  | "style_aesthetic"
  | "style_color_grade"
  | "style_film_stock"
  | "subject_appearance"
  | "subject_identity"
  | "technical_aspect_ratio"
  | "technical_duration"
  | "technical_frame_rate"
  | "technical_resolution"
  | "visual_abstract";

export interface SlotGrammar {
  kind: GrammarKind;
  minWords: number;
  maxWords: number;
}

export interface EnumeratedOption {
  text: string;
  families?: SemanticFamily[];
}

export interface TemplateDefinition {
  name: string;
  orderedSlots: string[];
}

export interface TemplatedPolicyConfig {
  templates: TemplateDefinition[];
  slots: Record<string, string[]>;
  requiredSlots?: string[];
  optionalSlots?: string[];
  invalidCombinations?: Array<Record<string, string[]>>;
  renderRules?: {
    joinWith?: string;
    dedupeCaseInsensitive?: boolean;
  };
  dedupeRules?: {
    normalizeHyphenation?: boolean;
    trimWhitespace?: boolean;
  };
}

export interface RescueStrategy {
  enabled: boolean;
  maxCalls: number;
}

export interface ScorerWeights {
  familyFit: number;
  contextFit: number;
  literalness: number;
  overlapPenalty: number;
}

/**
 * Selects which output schema the V2 engine enforces for guided LLM calls.
 * - "enhancement" (default): requires `text` + `explanation` per suggestion.
 * - "custom": only requires `text`. Used by the custom-request flow where
 *   the user supplied free-form steering and per-suggestion explanations
 *   are not contractually expected.
 */
export type SuggestionSchemaName = "enhancement" | "custom";

export interface SlotPolicy {
  categoryId: string;
  mode: GenerationMode;
  grammar: SlotGrammar;
  targetCount: number;
  minAcceptableCount: number;
  requiredFamilies: SemanticFamily[];
  forbiddenFamilies: SemanticFamily[];
  promptGuidance: string;
  rescueStrategy?: RescueStrategy;
  enumeratedOptions?: EnumeratedOption[];
  templated?: TemplatedPolicyConfig;
  scorerWeights?: ScorerWeights;
  /**
   * Which output schema to enforce for guided_llm calls. Defaults to
   * "enhancement" when omitted. Custom-request flows set this to "custom"
   * so the V2 engine doesn't reject suggestions for missing `explanation`.
   */
  suggestionSchemaName?: SuggestionSchemaName;
}

export interface EnhancementV2Config {
  policyVersion: string;
}

export interface EnhancementV2RequestContext {
  highlightedText: string;
  contextBefore: string;
  contextAfter: string;
  fullPrompt: string;
  originalUserPrompt: string;
  brainstormContext: BrainstormContext | null;
  highlightedCategory: string | null;
  highlightedCategoryConfidence: number | null;
  isPlaceholder: boolean;
  isVideoPrompt: boolean;
  phraseRole: string | null;
  highlightWordCount: number;
  videoConstraints: VideoConstraints | null;
  modelTarget: string | null;
  promptSection: string | null;
  spanAnchors: string;
  nearbySpanHints: string;
  lockedSpanCategories: string[];
  focusGuidance?: string[];
  debug: boolean;
  /**
   * When set, the V2 engine enters custom-request mode: the prompt builder
   * emits a free-form steering prompt instead of slot guidance, the engine
   * resolves the dedicated CustomPolicy, and the custom-suggestion schema
   * is enforced.
   */
  customRequest?: string | null;
  /**
   * Optional metadata blob forwarded to the custom-request prompt
   * (span context, surrounding categories, etc).
   */
  customMetadata?: Record<string, unknown> | null;
}

export interface CandidateScoreBreakdown {
  familyFit: number;
  contextFit: number;
  literalness: number;
  overlapPenalty: number;
  total: number;
}

export interface CandidateEvaluation {
  suggestion: Suggestion;
  accepted: boolean;
  score: CandidateScoreBreakdown;
  reasons: string[];
}

export interface EnhancementV2DebugPayload {
  engineVersion: "v2";
  policyVersion: string;
  categoryId: string;
  mode: GenerationMode;
  stageCounts: Record<string, number>;
  rejectionSummary: Record<string, number>;
  modelCallCount: number;
  systemPromptSent?: string;
  /**
   * One-sentence scene constraint statement emitted by the LLM BEFORE
   * the suggestions array. Captured for telemetry; downstream code
   * does not validate or consume programmatically. Null when the
   * LLM omitted it or when the engine ran a non-guided mode.
   */
  sceneSummary?: string | null;
}

export interface EnhancementV2Execution {
  result: EnhancementResult;
  rawSuggestions: Suggestion[];
  finalSuggestions: Suggestion[];
  debug: EnhancementV2DebugPayload;
}

/**
 * Internal result shape for the V2 engine's guided-LLM generation path.
 * Carries the suggestion array (downstream consumers) plus the scene_summary
 * the LLM emitted (telemetry-only metadata).
 */
export interface GuidedGenerationResult {
  suggestions: Suggestion[];
  sceneSummary: string | null;
}

export interface EnhancementV2Dependencies {
  aiService: AIExecutionPort;
  videoPromptService: VideoService;
  diversityEnforcer: DiversityEnforcer;
  policyVersion: string;
}
