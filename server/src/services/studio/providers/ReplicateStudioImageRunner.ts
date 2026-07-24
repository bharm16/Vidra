/**
 * Generic Replicate prediction runner for studio image calls.
 *
 * One runner for the whole roster: the registry shapes per-model input
 * (buildGenerateInput/buildEditInput) and this class executes the common
 * Replicate protocol — create with rate-limit retry, poll to completion
 * within a per-call timeout budget, extract the image URL. Mirrors the
 * ImagePreviewProvider implementations (create → poll → URL, 402/429
 * mapping) without their preview-specific request shape, which cannot
 * express multi-image edit input.
 */

import Replicate from "replicate";
import { logger } from "@infrastructure/Logger";
import { sleep as sleepForMs } from "@utils/sleep";
import {
  parseRetryAfterMs,
  parseReplicateErrorDetail,
  extractImageUrl,
} from "@services/image-generation/providers/replicatePrediction";

interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output: unknown;
  error?: string | null;
  logs?: string | null;
}

interface ReplicateClient {
  predictions: {
    create: (params: {
      model: string;
      input: Record<string, unknown>;
    }) => Promise<ReplicatePrediction>;
    get: (id: string) => Promise<ReplicatePrediction>;
  };
}

export interface StudioImageCall {
  /** Replicate model id, e.g. "recraft-ai/recraft-v4.1". */
  model: string;
  input: Record<string, unknown>;
  userId: string;
  /** Hard budget for create+poll; on exceed the call fails (plan: "Timeouts"). */
  timeoutMs: number;
}

export interface StudioImageCallResult {
  imageUrl: string;
  durationMs: number;
}

export class StudioCallError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "StudioCallError";
  }
}

const MAX_CREATE_RETRIES = 2;
const DEFAULT_RETRY_AFTER_MS = 4000;
const POLL_INTERVAL_MS = 1000;

export interface ReplicateStudioImageRunnerOptions {
  apiToken?: string;
}

export class ReplicateStudioImageRunner {
  private readonly replicate: ReplicateClient | null;
  private readonly log = logger.child({
    service: "ReplicateStudioImageRunner",
  });

  constructor(options: ReplicateStudioImageRunnerOptions = {}) {
    this.replicate = options.apiToken
      ? (new Replicate({ auth: options.apiToken }) as ReplicateClient)
      : null;
  }

  isAvailable(): boolean {
    return this.replicate !== null;
  }

  async run(call: StudioImageCall): Promise<StudioImageCallResult> {
    if (!this.replicate) {
      throw new StudioCallError(
        "Replicate runner is not configured. REPLICATE_API_TOKEN is required.",
        503,
      );
    }

    const startTime = Date.now();
    const deadline = startTime + call.timeoutMs;

    try {
      const prediction = await this.createPrediction(call);

      let current = prediction;
      while (Date.now() < deadline) {
        if (current.status === "succeeded") break;
        if (current.status === "failed" || current.status === "canceled") {
          throw new Error(
            `Image call failed: ${current.error || "Unknown error"}`,
          );
        }
        await this.sleep(POLL_INTERVAL_MS);
        current = await this.replicate.predictions.get(prediction.id);
      }

      if (current.status !== "succeeded") {
        throw new Error(
          `Image call timed out after ${call.timeoutMs}ms (status: ${current.status})`,
        );
      }

      const imageUrl = extractImageUrl(current.output, call.userId, this.log);
      return { imageUrl, durationMs: Date.now() - startTime };
    } catch (error) {
      throw this.toStudioError(error, call);
    }
  }

  private async createPrediction(
    call: StudioImageCall,
  ): Promise<ReplicatePrediction> {
    if (!this.replicate) {
      throw new StudioCallError("Replicate runner is not configured.", 503);
    }

    for (let attempt = 0; attempt <= MAX_CREATE_RETRIES; attempt += 1) {
      try {
        return await this.replicate.predictions.create({
          model: call.model,
          input: call.input,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const retryAfterMs = parseRetryAfterMs(message);
        const isRateLimit =
          retryAfterMs !== null || /429|throttled|rate limit/i.test(message);

        if (!isRateLimit || attempt >= MAX_CREATE_RETRIES) {
          throw error;
        }

        const delayMs = retryAfterMs ?? DEFAULT_RETRY_AFTER_MS;
        this.log.warn("Replicate rate limit on create, retrying", {
          model: call.model,
          attempt: attempt + 1,
          delayMs,
          userId: call.userId,
        });
        await this.sleep(delayMs);
      }
    }

    throw new Error("Replicate create prediction failed after retries");
  }

  /**
   * Map provider failures onto stable status codes so the turn loop can
   * surface 402/429 as visible chat errors (never silent — the fal
   * balance-lockout lesson, cd0d45e4).
   */
  private toStudioError(
    error: unknown,
    call: StudioImageCall,
  ): StudioCallError {
    if (error instanceof StudioCallError) return error;
    const message = error instanceof Error ? error.message : String(error);

    let statusCode = 500;
    let detail = message;
    if (message.includes("402") || message.includes("Insufficient credit")) {
      statusCode = 402;
      detail = parseReplicateErrorDetail(
        message,
        "Replicate account is out of credit — image calls are failing.",
      );
    } else if (/429|rate limit|throttled/i.test(message)) {
      statusCode = 429;
      detail = parseReplicateErrorDetail(
        message,
        "Rate limit exceeded. Please wait a moment and try again.",
      );
    }

    this.log.error(
      "Studio image call failed",
      error instanceof Error ? error : new Error(message),
      { model: call.model, statusCode, userId: call.userId },
    );

    return new StudioCallError(detail, statusCode);
  }

  private async sleep(ms: number): Promise<void> {
    if (!Number.isFinite(ms) || ms <= 0) return;
    await sleepForMs(ms);
  }
}
