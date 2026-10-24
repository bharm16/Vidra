import type { Response } from "express";
import { logger } from "@infrastructure/Logger";
import { labelSpansStream } from "@llm/span-labeling/SpanLabelingService";
import type { SpanStreamFinalization } from "@llm/span-labeling/SpanLabelingService";
import { spanCacheTtlSeconds, spanCacheIdentity } from "@llm/span-labeling/spanCache";
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
  streamVersion?: 2;
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
  streamVersion,
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
  payload = { ...payload, ...(userId ? { ownerId: userId } : {}) };
  let clientClosed = false;
  const cancellation = new AbortController();

  res.on("close", () => {
    clientClosed = true;
    cancellation.abort();
  });

  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  // Disable nginx response buffering so each NDJSON span flushes to the
  // client immediately. Without this, an upstream nginx will accumulate the
  // stream and forward it as a single chunk, defeating the streaming UX.
  res.setHeader("X-Accel-Buffering", "no");
  if (streamVersion === 2) res.setHeader("X-Span-Stream-Version", "2");
  res.flushHeaders?.();

  // Spans put on the wire. Used only for degraded-error reporting — the cache
  // backfill uses the stream's finalized set instead (see below).
  const collectedSpans: SpanLike[] = [];
  // The whole-set stages (merge, dedupe, overlap, truncation) cannot be
  // expressed on an append-only NDJSON wire, so labelSpansStream runs them
  // server-side and hands the result back as the generator's return value.
  let finalization: SpanStreamFinalization | null = null;
  let streamCompleted = false;

  const stream = labelSpansStream({ ...payload, signal: cancellation.signal }, aiService);
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
      res.write(JSON.stringify(streamVersion === 2 ? { type: "span", span: toPublicSpan(next.value) } : toPublicSpan(next.value)) + "\n");
    }

    // Stream exhausted normally — mark as completed for cache backfill.
    if (!clientClosed) {
      streamCompleted = true;
    }

    if (!res.writableEnded && !res.destroyed) {
      if (streamVersion === 2 && finalization) res.write(JSON.stringify({ type: "complete", result: { spans: finalization.spans.map(toPublicSpan), meta: finalization.meta } }) + "\n");
      res.end();
    }
  } catch (error) {
    if (clientClosed || res.writableEnded || res.destroyed) return;
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
      ...(streamVersion === 2 ? { type: "error" } : {}),
      error: "Streaming failed",
      message: errorMessage,
      degraded: collectedSpans.length > 0,
      partialCount: collectedSpans.length,
    };
    if (!res.headersSent) {
      res.status(502).json(errorPayload);
      return;
    }
    res.end(JSON.stringify(errorPayload) + "\n");
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
    userId &&
    spanLabelingCache &&
    finalizedSpans.length > 0 &&
    text
  ) {
    try {
      const ttl = spanCacheTtlSeconds(text.length);
      // This write happens after the result exists, so it keys on the provider
      // that actually produced these spans rather than a pre-flight guess.
      const provider = finalization?.meta.provider;
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
            ...finalization?.meta,
            version:
              finalization?.meta.version ||
              templateVersion ||
              payload.templateVersion ||
              "",
            notes: backfillNotes,
            ...(provider ? { provider } : {}),
          },
        },
        { ttl, ...(provider ? { provider } : {}), identity: spanCacheIdentity(payload, finalization?.meta.execution ?? aiService.resolveExecution("span_labeling")) },
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
