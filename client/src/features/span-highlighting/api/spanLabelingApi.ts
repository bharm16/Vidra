/**
 * API Layer for Span Labeling
 *
 * Centralizes all API calls for span labeling operations.
 * Each method returns a Promise that resolves with the API response data.
 */

import { logger } from "@/services/LoggingService";
import { apiClient } from "@/services/ApiClient";
import type {
  LabelSpansPayload,
  LabelSpansResponse,
} from "./spanLabelingTypes";
import { buildRequestError } from "./spanLabelingErrors";
import { parseLabelSpansResponse } from "./spanLabelingResponse";
import { readSpanLabelStream } from "./spanLabelingStream";

function buildLabelSpansBody(payload: LabelSpansPayload): string {
  return JSON.stringify({
    text: payload.text,
    maxSpans: payload.maxSpans,
    minConfidence: payload.minConfidence,
    policy: payload.policy,
    templateVersion: payload.templateVersion,
    isI2VMode: payload.isI2VMode,
  });
}

/**
 * Span Labeling API
 */
export class SpanLabelingApi {
  private static log = logger.child("SpanLabelingApi");
  private static shouldFallbackToBlocking(status: number): boolean {
    return status === 404 || (status >= 500 && status < 600);
  }

  /**
   * Labels spans in the provided text
   *
   * @param payload - The span labeling request payload
   * @param signal - Optional abort signal for cancellation
   * @returns Response with spans and metadata
   * @throws Error If the request fails
   */
  static async labelSpans(
    payload: LabelSpansPayload,
    signal: AbortSignal | null = null,
  ): Promise<LabelSpansResponse> {
    // Blocking (non-streaming), so it keeps the shared client's request timeout.
    const res = await apiClient.rawRequest("/llm/label-spans", {
      method: "POST",
      body: buildLabelSpansBody(payload),
      ...(signal ? { signal } : {}),
    });

    if (!res.ok) {
      throw await buildRequestError(res);
    }

    const data: unknown = await res.json();
    return parseLabelSpansResponse(data);
  }

  /**
   * Labels spans using streaming (NDJSON)
   *
   * @param payload - The span labeling request payload
   * @param onChunk - Callback for each received span
   * @param signal - Optional abort signal for cancellation
   */
  static async labelSpansStream(
    payload: LabelSpansPayload,
    onChunk: (span: LabelSpansResponse["spans"][0]) => void,
    signal: AbortSignal | null = null,
  ): Promise<LabelSpansResponse> {
    this.log.debug("Stream started", {
      textLength: payload.text.length,
      maxSpans: payload.maxSpans,
    });

    // stream: true opts out of the request timeout (which would abort the
    // NDJSON stream mid-flight). Cancellation still works via the caller's
    // signal, and everything downstream detects it via signal.aborted.
    let res: Response;
    try {
      res = await apiClient.rawRequest("/llm/label-spans/stream", {
        method: "POST",
        body: buildLabelSpansBody(payload),
        stream: true,
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      const shouldSkipFallback =
        signal?.aborted ||
        (error instanceof DOMException && error.name === "AbortError");

      if (shouldSkipFallback) {
        throw error;
      }

      this.log.warn(
        "Stream request transport failed, falling back to blocking",
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
      const blocking = await this.labelSpans(payload, signal);
      blocking.spans.forEach(onChunk);
      return blocking;
    }

    if (!res.ok) {
      if (this.shouldFallbackToBlocking(res.status)) {
        this.log.warn("Stream request failed, falling back to blocking", {
          status: res.status,
        });
        const blocking = await this.labelSpans(payload, signal);
        blocking.spans.forEach(onChunk);
        return blocking;
      }

      const error = await buildRequestError(res);
      this.log.error("Stream request failed", error, { status: res.status });
      throw error;
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("Response body not readable");

    const { spans, linesProcessed, parseErrors } = await readSpanLabelStream(
      reader,
      onChunk,
      this.log,
    );

    this.log.info("Stream completed", {
      spanCount: spans.length,
      linesProcessed,
      parseErrors,
    });

    return { spans, meta: { streaming: true } };
  }
}
