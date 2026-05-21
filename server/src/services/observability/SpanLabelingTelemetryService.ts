import { randomUUID } from "node:crypto";
import { logger } from "@infrastructure/Logger";
import type { IPostHogClient } from "@infrastructure/PostHogClient";

export type SpanLabelingErrorStage =
  | "validation"
  | "llm_call"
  | "cache"
  | "post_processing";

/** One labeled span — what the model returned for a slice of input text. */
export interface SpanLabelSpan {
  text: string;
  category: string;
}

export interface SpanLabelingCompleteSummary {
  outcome: "success" | "error";
  promptLength: number;
  spanCount: number;
  provider: string | null;
  model: string | null;
  /** The text the model was asked to label. */
  inputText: string;
  /** The labeled spans the model returned. Empty on error. */
  spans: SpanLabelSpan[];
  /**
   * Optional variant tag set by Sub-project E's matrix runs. Null when
   * the synthetic harness runs without `--variant-tag`.
   */
  modelVariant?: string | null;
}

interface SpanLabelingEventProperties {
  requestId: string;
  userId: string | null;
  outcome: "success" | "error";
  errorMessage?: string;
  errorStage?: SpanLabelingErrorStage;
  durationMs: number;
  promptLength: number;
  spanCount: number;
  cacheHit: boolean;
  provider: string | null;
  model: string | null;
  inputText: string;
  spans: SpanLabelSpan[];
  modelVariant?: string | null;
}

export class SpanLabelingTrace {
  private readonly startedAt = performance.now();
  private cacheHit = false;
  private errorStage: SpanLabelingErrorStage | null = null;
  private errorMessage: string | null = null;
  private completed = false;

  constructor(
    private readonly client: IPostHogClient,
    private readonly distinctId: string,
    private readonly requestId: string,
    private readonly userId: string | null,
  ) {}

  recordCacheHit(): void {
    this.cacheHit = true;
  }

  recordError(stage: SpanLabelingErrorStage, err: unknown): void {
    this.errorStage = stage;
    this.errorMessage = err instanceof Error ? err.message : String(err);
  }

  complete(summary: SpanLabelingCompleteSummary): void {
    if (this.completed) return;
    this.completed = true;

    const durationMs = Math.round(performance.now() - this.startedAt);

    const properties: SpanLabelingEventProperties = {
      requestId: this.requestId,
      userId: this.userId,
      outcome: summary.outcome,
      ...(this.errorMessage ? { errorMessage: this.errorMessage } : {}),
      ...(this.errorStage ? { errorStage: this.errorStage } : {}),
      durationMs,
      promptLength: summary.promptLength,
      spanCount: summary.spanCount,
      cacheHit: this.cacheHit,
      provider: summary.provider,
      model: summary.model,
      inputText: summary.inputText,
      spans: summary.spans,
      modelVariant: summary.modelVariant ?? null,
    };

    try {
      this.client.capture({
        distinctId: this.distinctId,
        event: "label-spans.completed",
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

export class SpanLabelingTelemetryService {
  constructor(private readonly client: IPostHogClient) {}

  startSpanLabelingTrace(
    requestId: string,
    userId: string | null,
  ): SpanLabelingTrace {
    const distinctId =
      userId && userId.trim().length > 0 ? userId : `anon-${randomUUID()}`;
    return new SpanLabelingTrace(this.client, distinctId, requestId, userId);
  }
}
