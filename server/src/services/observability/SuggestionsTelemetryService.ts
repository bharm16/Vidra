import { randomUUID } from "node:crypto";
import { logger } from "@infrastructure/Logger";
import type { IPostHogClient } from "@infrastructure/PostHogClient";
import type {
  SuggestionsEventProperties,
  SuggestionsEventStages,
  SuggestionsStageName,
  SuggestionsTraceCompleteSummary,
} from "./types";

export class SuggestionsTrace {
  private readonly startedAt = performance.now();
  private readonly stageMs: Record<SuggestionsStageName, number | null> = {
    video_context: null,
    span_context: null,
    cache: null,
    v2_engine: null,
    post_processing: null,
  };
  private cacheHit = false;
  private errorStage: SuggestionsStageName | null = null;
  private errorMessage: string | null = null;
  private completed = false;

  constructor(
    private readonly client: IPostHogClient,
    private readonly distinctId: string,
    private readonly requestId: string,
    private readonly userId: string | null,
  ) {}

  recordStage(name: SuggestionsStageName, durationMs: number): void {
    this.stageMs[name] = Math.round(durationMs);
  }

  recordCacheHit(): void {
    this.cacheHit = true;
  }

  recordError(stage: SuggestionsStageName, err: unknown): void {
    this.errorStage = stage;
    this.errorMessage = err instanceof Error ? err.message : String(err);
  }

  complete(summary: SuggestionsTraceCompleteSummary): void {
    if (this.completed) {
      return;
    }
    this.completed = true;

    const durationMs = Math.round(performance.now() - this.startedAt);

    const stages: SuggestionsEventStages = {
      videoContextMs: this.stageMs.video_context,
      spanContextMs: this.stageMs.span_context,
      cacheCheckMs: this.stageMs.cache,
      v2EngineMs: this.stageMs.v2_engine,
      postProcessingMs: this.stageMs.post_processing,
    };

    const properties: SuggestionsEventProperties = {
      requestId: this.requestId,
      userId: this.userId,
      outcome: summary.outcome,
      ...(this.errorMessage ? { errorMessage: this.errorMessage } : {}),
      ...(this.errorStage ? { errorStage: this.errorStage } : {}),
      durationMs,
      cacheHit: this.cacheHit,
      suggestionCount: summary.suggestionCount,
      highlightedCategory: summary.highlightedCategory,
      promptLength: summary.promptLength,
      isVideoPrompt: summary.isVideoPrompt,
      isPlaceholder: summary.isPlaceholder,
      modelTarget: summary.modelTarget,
      promptSection: summary.promptSection,
      phraseRole: summary.phraseRole,
      policyVersion: summary.policyVersion,
      categoryId: summary.categoryId,
      engineMode: summary.engineMode,
      modelCallCount: summary.modelCallCount,
      fallbackApplied: summary.fallbackApplied,
      debug: summary.debug,
      stages,
      highlightedText: summary.highlightedText,
      fullPrompt: summary.fullPrompt,
      suggestions: summary.suggestions,
      sceneSummary: summary.sceneSummary ?? null,
      modelVariant: summary.modelVariant ?? null,
    };

    try {
      this.client.capture({
        distinctId: this.distinctId,
        event: "suggestions.completed",
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

export class SuggestionsTelemetryService {
  constructor(private readonly client: IPostHogClient) {}

  startSuggestionsTrace(
    requestId: string,
    userId: string | null,
  ): SuggestionsTrace {
    const distinctId =
      userId && userId.trim().length > 0 ? userId : `anon-${randomUUID()}`;
    return new SuggestionsTrace(this.client, distinctId, requestId, userId);
  }
}
