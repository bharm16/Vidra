import type { Response } from "express";
import { logger } from "@infrastructure/Logger";
import { createSseWriter } from "@middleware/sseBackpressure";
import { labelSpansStream } from "@llm/span-labeling/SpanLabelingService";
import type { SpanStreamFinalization } from "@llm/span-labeling/SpanLabelingService";
import { getCurrentSpanProvider } from "@llm/span-labeling/services/LlmClientFactory";
import type { AIModelService } from "@services/ai-model/AIModelService";
import type { SpanLabelingCacheService } from "@services/cache/SpanLabelingCacheService";
import type {
  LabelSpansParams,
  SpanLike,
  ValidationPolicy,
} from "@llm/span-labeling/types";
import { toPublicSpan } from "./transform";

interface StreamHandlerInput {
  res: Response;
  payload: LabelSpansParams;
  aiService: AIModelService;
  requestId?: string;
  userId?: string;
  /** Optional cache service — when provided, completed stream results are
   *  written to the same cache the blocking route uses, so subsequent
   *  identical requests (streaming or blocking) get a hit. */
  spanLabelingCache?: SpanLabelingCacheService | null;
  /** Raw text for cache key computation. */
  text?: string;
  /** Validation policy for cache key. */
  policy?: ValidationPolicy | null;
  /** Template version for cache key. */
  templateVersion?: string | null;
}

export async function handleLabelSpansStreamRequest({
  res,
  payload,
  aiService,
  requestId,
  userId,
  spanLabelingCache = null,
  text = "",
  policy = null,
  templateVersion = null,
}: StreamHandlerInput): Promise<void> {
  const operation = "labelSpansStream";
  let clientClosed = false;

  res.on("close", () => {
    clientClosed = true;
  });

  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  // Disable nginx response buffering so each NDJSON span flushes to the
  // client immediately. Without this, an upstream nginx will accumulate the
  // stream and forward it as a single chunk, defeating the streaming UX.
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const writer = createSseWriter(res, { label: "labelSpans.stream" });

  // Spans put on the wire. Used only for degraded-error reporting — the cache
  // backfill uses the stream's finalized set instead (see below).
  const collectedSpans: SpanLike[] = [];
  // The whole-set stages (merge, dedupe, overlap, truncation) cannot be
  // expressed on an append-only NDJSON wire, so labelSpansStream runs them
  // server-side and hands the result back as the generator's return value.
  let finalization: SpanStreamFinalization | null = null;
  let streamCompleted = false;

  const stream = labelSpansStream(payload, aiService);
  let drained = false;

  try {
    while (true) {
      const next = await stream.next();
      if (next.done) {
        finalization = next.value;
        drained = true;
        break;
      }
      if (clientClosed || res.writableEnded || res.destroyed) {
        break;
      }
      collectedSpans.push(next.value);
      const writeResult = await writer.write(
        JSON.stringify(toPublicSpan(next.value)) + "\n",
      );
      if (!writeResult.ok) {
        clientClosed = true;
        break;
      }
    }

    // Stream exhausted normally — mark as completed for cache backfill.
    if (!clientClosed) {
      streamCompleted = true;
    }

    if (!res.writableEnded && !res.destroyed) {
      res.end();
    }
  } catch (error) {
    logger.error("Operation failed.", error as Error, {
      operation,
      requestId,
      userId,
    });
    if (clientClosed || res.writableEnded || res.destroyed) {
      return;
    }
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const errorPayload = {
      error: "Streaming failed",
      message: errorMessage,
      degraded: collectedSpans.length > 0,
      partialCount: collectedSpans.length,
    };
    if (!res.headersSent) {
      res.status(502).json(errorPayload);
      return;
    }
    try {
      await writer.write(JSON.stringify(errorPayload) + "\n");
    } finally {
      if (!res.writableEnded && !res.destroyed) {
        res.end();
      }
    }
  } finally {
    // Abandoning the loop early (client hung up, write failed) leaves the
    // generator suspended — close it so the provider stream is torn down.
    if (!drained) {
      await stream.return({
        spans: [],
        meta: { version: "", notes: "stream abandoned" },
      });
    }
  }

  // Cache backfill: write the completed result so subsequent identical
  // requests (streaming or blocking) get a cache hit.
  //
  // The blocking route serves this entry verbatim as X-Cache: HIT, so it must
  // hold the finalized set and the real template version — the wire's
  // per-span-staged spans have not been through merge/dedupe/overlap/truncate,
  // and a placeholder version would make the entry indistinguishable from a
  // genuine one.
  const finalizedSpans = finalization?.spans ?? [];
  if (
    streamCompleted &&
    spanLabelingCache &&
    finalizedSpans.length > 0 &&
    text
  ) {
    try {
      const ttl = text.length > 2000 ? 300 : 3600;
      const provider = getCurrentSpanProvider();
      const backfillNotes = [finalization?.meta.notes, "stream backfill"]
        .filter(Boolean)
        .join(" | ");
      await spanLabelingCache.set(
        text,
        policy ?? null,
        templateVersion ?? null,
        {
          spans: finalizedSpans,
          meta: {
            version:
              finalization?.meta.version ||
              templateVersion ||
              payload.templateVersion ||
              "",
            notes: backfillNotes,
          },
        },
        { ttl, provider },
      );
      logger.debug("Stream cache backfill completed", {
        operation,
        requestId,
        spanCount: finalizedSpans.length,
        streamedCount: collectedSpans.length,
        textLength: text.length,
        ttl,
      });
    } catch (cacheError) {
      // Non-fatal — log and move on.
      logger.warn("Stream cache backfill failed", {
        operation,
        requestId,
        error: (cacheError as Error).message,
      });
    }
  }
}
