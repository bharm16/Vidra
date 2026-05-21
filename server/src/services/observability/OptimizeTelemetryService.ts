import { randomUUID } from "node:crypto";
import { logger } from "@infrastructure/Logger";
import type { IPostHogClient } from "@infrastructure/PostHogClient";
import type {
  OptimizeEventProperties,
  OptimizeEventStages,
  OptimizeTraceCompleteSummary,
  StageName,
} from "./types";

export class OptimizeTrace {
  private readonly startedAt = performance.now();
  private readonly stageMs: Record<StageName, number | null> = {
    shot_interpreter: null,
    strategy: null,
    constitutional: null,
    intent_lock: null,
    compilation: null,
    prompt_lint: null,
    cache: null,
  };
  private llmCallCount = 0;
  private cacheHit = false;
  private errorStage: StageName | null = null;
  private errorMessage: string | null = null;
  private completed = false;

  constructor(
    private readonly client: IPostHogClient,
    private readonly distinctId: string,
    private readonly requestId: string,
    private readonly userId: string | null,
  ) {}

  recordStage(name: StageName, durationMs: number): void {
    this.stageMs[name] = Math.round(durationMs);
  }

  recordLlmCall(): void {
    this.llmCallCount += 1;
  }

  recordCacheHit(): void {
    this.cacheHit = true;
  }

  recordError(stage: StageName, err: unknown): void {
    this.errorStage = stage;
    this.errorMessage = err instanceof Error ? err.message : String(err);
  }

  complete(summary: OptimizeTraceCompleteSummary): void {
    if (this.completed) {
      // Defensive: prevent double-emission if both success and finally paths
      // call complete().
      return;
    }
    this.completed = true;

    const durationMs = Math.round(performance.now() - this.startedAt);

    const stages: OptimizeEventStages = {
      shotInterpreterMs: this.stageMs.shot_interpreter,
      strategyOptimizeMs: this.stageMs.strategy,
      constitutionalMs: this.stageMs.constitutional,
      intentLockMs: this.stageMs.intent_lock,
      compilationMs: this.stageMs.compilation,
      promptLintMs: this.stageMs.prompt_lint,
    };

    const properties: OptimizeEventProperties = {
      requestId: this.requestId,
      userId: this.userId,
      outcome: summary.outcome,
      ...(this.errorMessage ? { errorMessage: this.errorMessage } : {}),
      ...(this.errorStage ? { errorStage: this.errorStage } : {}),
      durationMs,
      llmCallCount: this.llmCallCount,
      cacheHit: this.cacheHit,
      targetModel: summary.targetModel,
      mode: summary.mode,
      promptLength: summary.promptLength,
      outputLength: summary.outputLength,
      lockedSpanCount: summary.lockedSpanCount,
      hasContext: summary.hasContext,
      hasBrainstormContext: summary.hasBrainstormContext,
      hasShotPlan: summary.hasShotPlan,
      useConstitutionalAI: summary.useConstitutionalAI,
      stages,
      inputPrompt: summary.inputPrompt,
      outputPrompt: summary.outputPrompt,
      modelVariant: summary.modelVariant ?? null,
    };

    try {
      this.client.capture({
        distinctId: this.distinctId,
        event: "optimize.completed",
        properties: { ...properties },
      });
    } catch (err) {
      logger.debug("Telemetry emission failed (non-fatal)", {
        error: err instanceof Error ? err.message : String(err),
        requestId: this.requestId,
      });
    }
  }
}

export class OptimizeTelemetryService {
  constructor(private readonly client: IPostHogClient) {}

  startOptimizeTrace(requestId: string, userId: string | null): OptimizeTrace {
    const distinctId =
      userId && userId.trim().length > 0 ? userId : `anon-${randomUUID()}`;
    return new OptimizeTrace(this.client, distinctId, requestId, userId);
  }
}
