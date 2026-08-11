import type { ILogger } from "@interfaces/ILogger";
import type { OptimizeTrace } from "@services/observability/OptimizeTelemetryService";
import type { PromptLintResult } from "../services/PromptLintGateService";
import type {
  AIService,
  CompilationState,
  CompileContext,
  CompileSource,
  InferredContext,
  LockedSpan,
  OptimizationMode,
  OptimizationRequest,
  OptimizationResponse,
  ShotPlan,
  StructuredOptimizationArtifact,
} from "../types";

export type MetadataMap = Record<string, unknown>;

export type OptimizationCacheLike = {
  buildCacheKey(
    prompt: string,
    mode: OptimizationMode,
    context: InferredContext | null,
    brainstormContext: Record<string, unknown> | null,
    targetModel?: string,
    generationParams?: Record<string, unknown> | null,
    lockedSpans?: LockedSpan[],
  ): string;
  buildStructuredArtifactKeyFromInputs(params: {
    prompt: string;
    sourcePrompt?: string | null;
    shotPlan?: ShotPlan | null;
    generationParams?: Record<string, unknown> | null;
    lockedSpans?: LockedSpan[];
  }): string;
  getCachedOutcome(key: string): Promise<OptimizationResponse | null>;
  getStructuredArtifact(
    key: string,
  ): Promise<StructuredOptimizationArtifact | null>;
  cacheOutcome(key: string, outcome: OptimizationResponse): Promise<void>;
  cacheStructuredArtifact(
    key: string,
    artifact: StructuredOptimizationArtifact,
  ): Promise<void>;
};

export type ShotInterpreterLike = {
  interpret(prompt: string, signal?: AbortSignal): Promise<ShotPlan | null>;
};

export type OptimizationStrategyLike = {
  optimizeStructured(
    request: OptimizationRequest,
  ): Promise<StructuredOptimizationArtifact>;
  renderStructuredPrompt(
    structuredPrompt: StructuredOptimizationArtifact["structuredPrompt"],
  ): string;
};

export type CompilationServiceLike = {
  compile(args: {
    operation: string;
    targetModel?: string;
    source: CompileSource;
    context?: CompileContext | null;
    fallbackPrompt?: string;
    artifactKey?: string;
  }): Promise<{
    prompt: string;
    metadata: MetadataMap | null;
    compilation: CompilationState;
    artifactKey?: string;
  }>;
};

export type ConstitutionalReviewLike = (
  prompt: string,
  mode: OptimizationMode,
  signal?: AbortSignal | undefined,
) => Promise<string>;

export type IntentLockLike = {
  enforceIntentLock(params: {
    originalPrompt: string;
    optimizedPrompt: string;
    shotPlan: ShotPlan | null;
  }): {
    prompt: string;
    passed: boolean;
    repaired: boolean;
    required: { subject: string | null; action: string | null };
  };
  validateIntentPreservation(params: {
    originalPrompt: string;
    optimizedPrompt: string;
    shotPlan: ShotPlan | null;
  }): {
    passed: boolean;
    required: { subject: string | null; action: string | null };
  };
};

export type PromptLintLike = {
  sanitize(params: { prompt: string; modelId?: string | null }): {
    prompt: string;
    lint: PromptLintResult;
    repaired: boolean;
  };
};

export interface OptimizeFlowArgs {
  request: OptimizationRequest;
  log: ILogger;
  optimizationCache: OptimizationCacheLike;
  shotInterpreter: ShotInterpreterLike;
  strategy: OptimizationStrategyLike;
  compilationService: CompilationServiceLike | null;
  applyConstitutionalAI: ConstitutionalReviewLike;
  logOptimizationMetrics: (
    originalPrompt: string,
    optimizedPrompt: string,
    mode: OptimizationMode,
  ) => void;
  intentLock: IntentLockLike;
  promptLint: PromptLintLike;
  telemetry: OptimizeTrace;
}

export interface ConstitutionalReviewFlowArgs {
  prompt: string;
  mode: OptimizationMode;
  signal?: AbortSignal | undefined;
  log: ILogger;
  ai: AIService;
}
