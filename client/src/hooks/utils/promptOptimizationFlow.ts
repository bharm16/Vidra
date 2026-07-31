import { logger } from "../../services/LoggingService";
import type { Toast } from "../types";
import type { LockedSpan } from "@/features/prompt-optimizer/types";
import type { CapabilityValues } from "@shared/capabilities";
import type { OptimizeData } from "@shared/schemas/optimization.schemas";

export interface PromptOptimizerActions {
  setOptimizedPrompt: (prompt: string) => void;
  setDisplayedPrompt: (prompt: string) => void;
  setGenericOptimizedPrompt: (prompt: string | null) => void;
  setArtifactKey: (artifactKey: string | null) => void;
  setQualityScore: (score: number | null) => void;
  setPreviewPrompt: (prompt: string | null) => void;
  setPreviewAspectRatio: (ratio: string | null) => void;
  bumpOptimizationResultVersion: () => void;
  rollback: () => void;
}

export interface OptimizationOutcome {
  optimized: string;
  score: number;
}

type AnalyzeAndOptimize = (options: {
  prompt: string;
  targetModel?: string;
  context?: unknown | null;
  brainstormContext?: unknown | null;
  skipCache?: boolean;
  lockedSpans?: LockedSpan[];
  startImage?: string;
  sourcePrompt?: string;
  signal?: AbortSignal;
}) => Promise<OptimizeData>;

export interface RunOptimizationOptions {
  promptToOptimize: string;
  selectedMode: string;
  selectedModel?: string;
  context: unknown | null;
  brainstormContext: unknown | null;
  generationParams?: CapabilityValues;
  startImage?: string;
  sourcePrompt?: string;
  abortController: AbortController;
  skipCache?: boolean;
  lockedSpans?: LockedSpan[];
  actions: PromptOptimizerActions;
  toast: Toast;
  log: ReturnType<typeof logger.child>;
  analyzeAndOptimize: AnalyzeAndOptimize;
  calculateQualityScore: (inputPrompt: string, outputPrompt: string) => number;
}

export async function runOptimization({
  promptToOptimize,
  selectedMode,
  selectedModel,
  context,
  brainstormContext,
  generationParams,
  startImage,
  sourcePrompt,
  abortController,
  skipCache,
  lockedSpans,
  actions,
  toast,
  log,
  analyzeAndOptimize,
  calculateQualityScore,
}: RunOptimizationOptions): Promise<OptimizationOutcome | null> {
  log.debug("Starting optimization", {
    operation: "optimize",
    stage: "json",
    mode: selectedMode,
  });

  const response = await analyzeAndOptimize({
    prompt: promptToOptimize,
    context,
    brainstormContext,
    signal: abortController.signal,
    ...(selectedModel ? { targetModel: selectedModel } : {}),
    ...(generationParams ? { generationParams } : {}),
    ...(skipCache ? { skipCache } : {}),
    ...(lockedSpans && lockedSpans.length > 0 ? { lockedSpans } : {}),
    ...(startImage ? { startImage } : {}),
    ...(sourcePrompt ? { sourcePrompt } : {}),
  });

  const optimized = response.prompt || response.optimizedPrompt || "";
  const score = calculateQualityScore(promptToOptimize, optimized);

  actions.setOptimizedPrompt(optimized);
  actions.setDisplayedPrompt(optimized);
  actions.setQualityScore(score);
  if (
    response.metadata?.genericPrompt &&
    typeof response.metadata.genericPrompt === "string"
  ) {
    actions.setGenericOptimizedPrompt(response.metadata.genericPrompt);
  }
  actions.setArtifactKey(
    typeof response.artifactKey === "string"
      ? response.artifactKey
      : typeof response.metadata?.artifactKey === "string"
        ? response.metadata.artifactKey
        : null,
  );
  if (
    response.metadata?.previewPrompt &&
    typeof response.metadata.previewPrompt === "string"
  ) {
    actions.setPreviewPrompt(response.metadata.previewPrompt);
  }
  if (
    typeof response.metadata?.aspectRatio === "string" &&
    response.metadata.aspectRatio.trim()
  ) {
    actions.setPreviewAspectRatio(response.metadata.aspectRatio.trim());
  }
  actions.bumpOptimizationResultVersion();

  // The frozen quality-feedback stack never speaks in the creator loop
  // (ADR-0008, decision 3) — not even in dev. calculateQualityScore is a
  // text-optimizer heuristic (section headers, "Goal", "Return Format")
  // that video prompts can never satisfy, so the old dev-only toast fired
  // "Score: 0%" on every optimization. The score is still computed and
  // persisted with the entry; it just doesn't toast.

  const duration = logger.endTimer("optimize");
  log.info("Optimization completed", {
    operation: "optimize",
    duration,
    score,
    outputLength: optimized?.length || 0,
  });

  return { optimized, score };
}
