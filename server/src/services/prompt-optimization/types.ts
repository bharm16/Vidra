/**
 * Types for prompt optimization services
 * Shared type definitions used across prompt optimization modules
 */
import type { VideoPromptStructuredResponse } from "@server/contracts/prompt-analysis/structuredPrompt";
import type { AIExecutionPort } from "@services/ai-model/ports/AIExecutionPort";
import type { OptimizeTrace } from "@services/observability/OptimizeTelemetryService";
import type { CapabilityValues } from "@shared/capabilities";
import type { LockedSpan } from "@shared/schemas/optimization.schemas";

/**
 * Optimization mode type
 */
export type OptimizationMode = "video";

/**
 * Context inferred from prompt
 */
export interface InferredContext {
  specificAspects: string;
  backgroundLevel: "beginner" | "intermediate" | "advanced";
  intendedUse: string;
}

// Canonical definition lives in the shared contract layer; re-exported here
// so service-internal consumers (strategies, cache, template builders) keep
// their existing import path.
export type { LockedSpan };

/**
 * Shot plan from interpreter
 */
export interface ShotPlan {
  shot_type: string;
  core_intent: string;
  subject?: string | null;
  action?: string | null;
  visual_focus?: string | null;
  setting?: string | null;
  time?: string | null;
  mood?: string | null;
  style?: string | null;
  camera_move?: string | null;
  camera_angle?: string | null;
  lighting?: string | null;
  audio?: string | null;
  duration_hint?: string | null;
  risks?: string[];
  confidence?: number;
}

/**
 * Optimization request parameters
 */
export interface OptimizationRequest {
  prompt: string;
  mode?: OptimizationMode;
  targetModel?: string; // e.g., 'runway', 'luma', 'veo'
  context?: InferredContext | null;
  brainstormContext?: Record<string, unknown> | null;
  generationParams?: CapabilityValues | null;
  skipCache?: boolean;
  lockedSpans?: LockedSpan[];
  shotPlan?: ShotPlan | null;
  shotPlanAttempted?: boolean;
  useConstitutionalAI?: boolean;
  signal?: AbortSignal;
  /** Present in legacy I2V calls; ignored after the I2V pipeline removal. */
  startImage?: string;
  /** Present in legacy I2V calls; ignored after the I2V pipeline removal. */
  sourcePrompt?: string;
  /**
   * Telemetry trace, created at the route layer. When omitted, optimization
   * proceeds with no telemetry (test paths and direct service consumers).
   */
  trace?: OptimizeTrace;
}

export interface StructuredOptimizationArtifact {
  sourcePrompt: string;
  structuredPrompt: VideoPromptStructuredResponse;
  previewPrompt: string;
  aspectRatio?: string;
  fallbackUsed: boolean;
  lintPassed: boolean;
}

export type CompileSource =
  | { kind: "artifact"; artifact: StructuredOptimizationArtifact }
  | { kind: "artifactKey"; artifactKey: string }
  | { kind: "prompt"; prompt: string };

export type CompilationStatus =
  | "compiled"
  | "generic-fallback"
  | "compile-skipped";

export interface CompilationIntentLockState {
  passed: boolean;
  repaired: boolean;
  skippedRepair: boolean;
  warning?: string;
  required: { subject: string | null; action: string | null };
}

export interface CompilationState {
  status: CompilationStatus;
  usedFallback: boolean;
  reason?: string;
  sourceKind: CompileSource["kind"];
  structuredArtifactReused: boolean;
  analyzerBypassed: boolean;
  compiledFor: string | null;
  intentLock?: CompilationIntentLockState;
}

export interface CompileContext {
  originalPrompt?: string;
  originalUserPrompt?: string;
  specificAspects?: string;
  backgroundLevel?: string;
  intendedUse?: string;
  constraints?: Record<string, unknown>;
  apiParams?: Record<string, unknown>;
  assets?: Array<Record<string, unknown>>;
}

/**
 * Quality verdicts produced by the finishing stages.
 *
 * Server-internal: telemetry is the consumer (see OptimizeTraceCompleteSummary),
 * and the intent verdict additionally reaches the client inside
 * `CompilationState.intentLock`, which is already on the wire. Deliberately NOT
 * a wire field of its own — that would ship the same verdict twice for no reader.
 */
export interface PromptQualityReport {
  intentLock: CompilationIntentLockState;
  lint: PromptLintReport;
}

export interface PromptLintReport {
  ok: boolean;
  errors: string[];
  warnings: string[];
  wordCount: number;
  repaired: boolean;
  overBudget?: { modelId: string; wordCount: number; limit: number };
}

export interface CompilePromptResponse {
  compiledPrompt: string;
  metadata: Record<string, unknown> | null;
  targetModel: string;
  artifactKey?: string;
  compilation: CompilationState;
}

export interface OptimizationResponse {
  prompt: string;
  /**
   * Renderer output before any model-specific compile. Present whenever the
   * structured branch ran.
   */
  previewPrompt?: string;
  aspectRatio?: string;
  /**
   * The prompt as it stands before any model-specific compile. Equal to
   * `prompt` when no compile ran. The canvas keeps it so a re-compile for
   * another model starts from generic text rather than from compiled,
   * model-shaped output.
   */
  genericPrompt?: string;
  artifactKey?: string;
  compilation?: CompilationState;
  quality: PromptQualityReport;
  /**
   * Free-form additions from the compile stage (provider phase details). Not a
   * home for anything a caller needs — put that on a typed field.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Optimization strategy interface.
 *
 * Structured-first: every strategy produces a slot artifact and renders it. The
 * previous shape made both optional and kept a third `optimize()` entrypoint,
 * so the flow probed for methods that its one adapter always defined.
 */
export interface OptimizationStrategy {
  optimizeStructured(
    request: OptimizationRequest,
  ): Promise<StructuredOptimizationArtifact>;
  renderStructuredPrompt(
    structuredPrompt: VideoPromptStructuredResponse,
  ): string;
  name: string;
}

/** @deprecated Use AIExecutionPort from @services/ai-model/ports/AIExecutionPort */
export type AIService = AIExecutionPort;

/**
 * Template service interface (minimal)
 */
export interface TemplateService {
  getTemplate?(name: string, version?: string): Promise<string>;
  load?(
    templateName: string,
    variables?: Record<string, string | number | null | undefined>,
  ): Promise<string>;
  loadSection?(
    sectionName: string,
    variables?: Record<string, string | number | null | undefined>,
  ): Promise<string>;
}
