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
  domainContent?: string | null;
  useConstitutionalAI?: boolean;
  onMetadata?: (metadata: Record<string, unknown>) => void;
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

export interface CompilePromptResponse {
  compiledPrompt: string;
  metadata: Record<string, unknown> | null;
  targetModel: string;
  artifactKey?: string;
  compilation: CompilationState;
}

export interface OptimizationResponse {
  prompt: string;
  metadata?: Record<string, unknown>;
  artifactKey?: string;
  compilation?: CompilationState;
}

/**
 * Optimization strategy interface
 */
export interface OptimizationStrategy {
  optimize(request: OptimizationRequest): Promise<string>;
  optimizeStructured?(
    request: OptimizationRequest,
  ): Promise<StructuredOptimizationArtifact>;
  renderStructuredPrompt?(
    structuredPrompt: VideoPromptStructuredResponse,
  ): string;
  generateDomainContent?(
    prompt: string,
    context?: InferredContext | null,
    shotPlan?: ShotPlan | null,
  ): Promise<unknown>;
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
