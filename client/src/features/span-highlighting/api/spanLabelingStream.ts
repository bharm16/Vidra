import { isRecord } from "@shared/utils/typeGuards";
import type { SpanLabel } from "./spanLabelingTypes";
import { parseSpanLabel } from "./spanLabelingResponse";

export interface SpanStreamResult {
  spans: SpanLabel[];
  linesProcessed: number;
  parseErrors: number;
}

export async function readSpanLabelStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onChunk: (span: SpanLabel) => void,
  log: {
    debug: (message: string, meta?: Record<string, unknown>) => void;
    warn: (message: string, meta?: Record<string, unknown>) => void;
  },
  options: { progressLogIntervalMs?: number; maxParseErrorLogs?: number } = {},
): Promise<SpanStreamResult> {
  const decoder = new TextDecoder();
  let buffer = "";
  const spans: SpanLabel[] = [];
  let linesProcessed = 0;
  let parseErrors = 0;
  let lastProgressLogAt = Date.now();
  const progressLogIntervalMs = options.progressLogIntervalMs ?? 1000;
  const maxParseErrorLogs = options.maxParseErrorLogs ?? 3;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        linesProcessed++;
        try {
          const parsed: unknown = JSON.parse(line);
          if (isRecord(parsed) && typeof parsed.error === "string") {
            throw new Error(parsed.error);
          }

          const span = parseSpanLabel(parsed);
          if (span) {
            onChunk(span);
            spans.push(span);
          }
        } catch (error) {
          parseErrors++;
          if (parseErrors <= maxParseErrorLogs) {
            const message =
              error instanceof Error ? error.message : String(error);
            log.warn("JSON parse failed", {
              linePreview: line.slice(0, 200),
              error: message,
            });
          }
        }

        if (Date.now() - lastProgressLogAt >= progressLogIntervalMs) {
          log.debug("Stream progress", {
            linesProcessed,
            spanCount: spans.length,
          });
          lastProgressLogAt = Date.now();
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { spans, linesProcessed, parseErrors };
}
