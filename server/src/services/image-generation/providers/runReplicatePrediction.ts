/**
 * Shared Replicate prediction protocol for the Flux preview providers.
 *
 * Schnell and Kontext Fast speak the identical Replicate prediction protocol —
 * create-with-rate-limit-retry, poll to a deadline (tolerating transient poll
 * failures), then extract the image URL — differing only in model id, input
 * shape, and aspect-ratio rules. That protocol lives here once; each provider
 * supplies its model/input and assembles its own result. The studio image
 * runner deliberately keeps its own copy (different error contract).
 */

import type { ILogger } from "@interfaces/ILogger";
import {
  parseRetryAfterMs,
  parseReplicateErrorDetail,
  extractImageUrl,
} from "./replicatePrediction";

export interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output: string | string[] | null | undefined;
  error?: string | null;
  logs?: string | null;
}

export interface ReplicatePredictionClient {
  predictions: {
    create: (params: {
      model: string;
      input: Record<string, unknown>;
    }) => Promise<ReplicatePrediction>;
    get: (id: string) => Promise<ReplicatePrediction>;
  };
}

const MAX_CREATE_RETRIES = 2;
const DEFAULT_RETRY_AFTER_MS = 4000;
const POLL_INTERVAL_MS = 1000;

interface RunReplicatePredictionOptions {
  client: ReplicatePredictionClient;
  model: string;
  input: Record<string, unknown>;
  /** Total budget for the create + poll cycle. */
  timeoutMs: number;
  userId: string;
  log: ILogger;
  /** Injected so tests can march fake timers without real delays. */
  sleep: (ms: number) => Promise<void>;
}

/**
 * Create a prediction, retrying on rate-limit errors up to MAX_CREATE_RETRIES.
 */
async function createPredictionWithRetry(
  opts: RunReplicatePredictionOptions,
): Promise<ReplicatePrediction> {
  for (let attempt = 0; attempt <= MAX_CREATE_RETRIES; attempt += 1) {
    try {
      return await opts.client.predictions.create({
        model: opts.model,
        input: opts.input,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const retryAfterMs = parseRetryAfterMs(errorMessage);
      const lower = errorMessage.toLowerCase();
      const isRateLimitError =
        retryAfterMs !== null ||
        lower.includes("429") ||
        lower.includes("throttled") ||
        lower.includes("rate limit");

      if (!isRateLimitError || attempt >= MAX_CREATE_RETRIES) {
        throw error;
      }

      const delayMs = retryAfterMs ?? DEFAULT_RETRY_AFTER_MS;
      opts.log.warn(
        "Replicate rate limit encountered, retrying create prediction",
        { attempt: attempt + 1, delayMs, userId: opts.userId },
      );
      await opts.sleep(delayMs);
    }
  }

  throw new Error("Replicate create prediction failed after retries");
}

/**
 * Run the create → poll → extract protocol and return the image URL.
 *
 * Throws the raw underlying error (SDK message intact, so callers can classify
 * 402/429 via {@link classifyReplicateError}) on failure.
 */
export async function runReplicatePrediction(
  opts: RunReplicatePredictionOptions,
): Promise<string> {
  const prediction = await createPredictionWithRetry(opts);

  opts.log.info("Prediction created", {
    predictionId: prediction.id,
    status: prediction.status,
    userId: opts.userId,
  });

  const endTime = Date.now() + opts.timeoutMs;
  let currentPrediction = prediction;

  while (Date.now() < endTime) {
    if (currentPrediction.status === "succeeded") {
      break;
    }
    if (
      currentPrediction.status === "failed" ||
      currentPrediction.status === "canceled"
    ) {
      const predictionError = new Error(
        `Image generation failed: ${currentPrediction.error || "Unknown error"}`,
      );
      opts.log.error("Prediction failed", predictionError, {
        predictionId: currentPrediction.id,
        status: currentPrediction.status,
        error: currentPrediction.error,
        logs: currentPrediction.logs,
        userId: opts.userId,
      });
      throw predictionError;
    }

    await opts.sleep(POLL_INTERVAL_MS);
    try {
      currentPrediction = await opts.client.predictions.get(prediction.id);
    } catch (pollError) {
      // A transient poll failure must not kill a healthy in-flight
      // prediction — keep the last known state and poll again; the
      // deadline bounds total exposure.
      opts.log.warn("Prediction poll failed; retrying until deadline", {
        predictionId: prediction.id,
        pollError:
          pollError instanceof Error ? pollError.message : String(pollError),
        userId: opts.userId,
      });
      continue;
    }

    opts.log.debug("Polling prediction", {
      predictionId: currentPrediction.id,
      status: currentPrediction.status,
      userId: opts.userId,
    });
  }

  if (currentPrediction.status !== "succeeded") {
    throw new Error(
      `Prediction timed out or failed. Status: ${currentPrediction.status}`,
    );
  }

  const output = currentPrediction.output;
  if (output === null || output === undefined) {
    const outputError = new Error(
      "Replicate API returned no output. The image generation may have failed silently.",
    );
    opts.log.error(
      "Replicate API returned null/undefined output",
      outputError,
      { userId: opts.userId },
    );
    throw outputError;
  }

  opts.log.info("Replicate API response received", {
    outputType: typeof output,
    isArray: Array.isArray(output),
    outputLength: Array.isArray(output) ? output.length : null,
    outputPreview: JSON.stringify(output, null, 2).substring(0, 1000),
    userId: opts.userId,
  });

  const imageUrl = extractImageUrl(output, opts.userId, opts.log);

  if (!imageUrl.startsWith("http://") && !imageUrl.startsWith("https://")) {
    const urlError = new Error(
      "Invalid image URL format returned from Replicate API",
    );
    opts.log.error("Invalid URL format returned", urlError, {
      imageUrl: imageUrl.substring(0, 100),
      userId: opts.userId,
    });
    throw urlError;
  }

  return imageUrl;
}

/**
 * Map a Replicate failure onto a caller-facing Error carrying a `statusCode`
 * (402 insufficient credit, 429 rate limit, else 500).
 */
export function classifyReplicateError(
  error: unknown,
  log: ILogger,
  context: Record<string, unknown>,
): Error & { statusCode: number } {
  const errorMessage = error instanceof Error ? error.message : String(error);
  let parsedError = errorMessage;
  let statusCode = 500;

  if (
    errorMessage.includes("402") ||
    errorMessage.includes("Insufficient credit")
  ) {
    statusCode = 402;
    parsedError = parseReplicateErrorDetail(
      errorMessage,
      "Insufficient credit. Please add payment method to your Replicate account.",
    );
  } else if (
    errorMessage.includes("429") ||
    errorMessage.includes("rate limit") ||
    errorMessage.includes("throttled")
  ) {
    statusCode = 429;
    parsedError = parseReplicateErrorDetail(
      errorMessage,
      "Rate limit exceeded. Please wait a moment and try again.",
    );
  }

  log.error(
    "Image generation failed",
    error instanceof Error ? error : new Error(errorMessage),
    { parsedError, statusCode, ...context },
  );

  const enhancedError = new Error(parsedError) as Error & {
    statusCode: number;
  };
  enhancedError.statusCode = statusCode;
  return enhancedError;
}
