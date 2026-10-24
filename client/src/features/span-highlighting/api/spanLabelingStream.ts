import { isRecord } from "@shared/utils/typeGuards";
import { SpanLabelStreamEventSchema } from "@shared/spanLabelStream";
import type { SpanLabel } from "./spanLabelingTypes";
import { parseSpanLabel } from "./spanLabelingResponse";

export interface SpanStreamResult { spans: SpanLabel[]; meta?: Record<string, unknown> | null; linesProcessed: number; parseErrors: number; }
export class SpanStreamError extends Error { constructor(message: string, readonly partialCount: number) { super(message); this.name = "SpanStreamError"; } }

/** Progress is provisional; only a completed versioned stream is authoritative. */
export async function readSpanLabelStream(
  reader: ReadableStreamDefaultReader<Uint8Array>, onChunk: (span: SpanLabel) => void,
  log: { debug(message: string, meta?: Record<string, unknown>): void; warn(message: string, meta?: Record<string, unknown>): void },
  options: { progressLogIntervalMs?: number; maxParseErrorLogs?: number; requireCompletion?: boolean } = {},
): Promise<SpanStreamResult> {
  const decoder = new TextDecoder(); let buffer = ""; let spans: SpanLabel[] = []; let meta: Record<string, unknown> | null | undefined;
  let linesProcessed = 0; let parseErrors = 0; let completed = false; let versioned = options.requireCompletion === true;
  const consume = (line: string): void => {
    if (!line.trim()) return;
    linesProcessed += 1;
    let parsed: unknown;
    try { parsed = JSON.parse(line); }
    catch { parseErrors += 1; if (parseErrors <= (options.maxParseErrorLogs ?? 3)) log.warn("Invalid span stream JSON", { linesProcessed }); if (versioned) throw new SpanStreamError("The highlight response was interrupted.", spans.length); return; }
    if (completed) throw new SpanStreamError("The highlight stream continued after completion.", spans.length);
    if (isRecord(parsed) && typeof parsed.error === "string") throw new SpanStreamError(typeof parsed.message === "string" ? parsed.message : parsed.error, spans.length);
    if (isRecord(parsed) && "type" in parsed) {
      versioned = true;
      const event = SpanLabelStreamEventSchema.parse(parsed);
      if (event.type === "error") throw new SpanStreamError(event.message ?? event.error, spans.length);
      if (event.type === "complete") { spans = event.result.spans.flatMap(value => { const span = parseSpanLabel(value); return span ? [span] : []; }); meta = event.result.meta; completed = true; return; }
      const span = parseSpanLabel(event.span); if (span) { onChunk(span); spans.push(span); } return;
    }
    if (versioned) throw new SpanStreamError("The highlight response used an unexpected protocol.", spans.length);
    const span = parseSpanLabel(parsed); if (span) { onChunk(span); spans.push(span); }
  };
  try {
    for (;;) {
      const next = await reader.read();
      buffer += next.done ? decoder.decode() : decoder.decode(next.value, { stream: true });
      if (buffer.length > 1024 * 1024) throw new SpanStreamError("The highlight response exceeded its limit.", spans.length);
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) { consume(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1); }
      if (next.done) { consume(buffer); break; }
    }
    if (versioned && !completed) throw new SpanStreamError("The highlight response ended before completion.", spans.length);
    return { spans, ...(meta === undefined ? {} : { meta }), linesProcessed, parseErrors };
  } catch (error) { await reader.cancel(error).catch(() => undefined); throw error; }
  finally { reader.releaseLock(); }
}
