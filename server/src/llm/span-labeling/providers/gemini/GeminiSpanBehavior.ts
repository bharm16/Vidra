import {
  parseJson,
  cleanJsonEnvelope,
} from "@llm/span-labeling/utils/jsonUtils";
import type { LlmSpanParams } from "@llm/span-labeling/services/ILlmClient";
import { attemptJsonRepair } from "@clients/adapters/jsonRepair";
import { logger } from "@infrastructure/Logger";
import { buildSystemPrompt } from "@llm/span-labeling/utils/promptBuilder";

const log = logger.child({ service: "GeminiSpanBehavior" });

/**
 * Parse one NDJSON line from the model into a raw span object, tolerating the
 * envelope noise Gemini adds despite the NDJSON instruction (code fences,
 * array wrapping, trailing commas). Returns null for noise and parse failures.
 */
function parseNdjsonSpanLine(line: string): Record<string, unknown> | null {
  try {
    // Handle potential code block fences if model ignores instruction
    let cleanLine = line.replace(/^```json/, "").replace(/^```/, "");

    // Handle JSON array wrapping (Gemini often wraps in [ ... ] despite NDJSON request)
    // 1. Skip opening bracket lines
    if (cleanLine === "[") return null;
    // 2. Skip closing bracket lines
    if (cleanLine === "]") return null;

    // 3. Remove leading '[' if it starts a line (e.g. "[{...}")
    if (cleanLine.startsWith("[")) {
      cleanLine = cleanLine.substring(1).trim();
    }

    // 4. Remove trailing comma (e.g., "{...},")
    if (cleanLine.endsWith(",")) {
      cleanLine = cleanLine.slice(0, -1).trim();
    }

    // 5. Remove trailing ']' or '],' (e.g. "...}]")
    if (cleanLine.endsWith("]")) {
      cleanLine = cleanLine.slice(0, -1).trim();
    }
    // Check comma again after bracket removal
    if (cleanLine.endsWith(",")) {
      cleanLine = cleanLine.slice(0, -1).trim();
    }

    if (!cleanLine) return null;

    const span = JSON.parse(cleanLine);
    if (span && typeof span === "object") {
      // Normalize
      if (span.role && !span.category) span.category = span.role;
      return span;
    }
    return null;
  } catch {
    // Ignore parse errors for partial lines or noise
    return null;
  }
}

/**
 * Gemini's span-labeling behavior: NDJSON streaming, and the response
 * parsing/normalizing that the generic parser cannot do.
 *
 * Held by `geminiSpanProfile` rather than inherited from a client base class.
 * Gemini genuinely differs in behavior, not just configuration — it streams
 * spans one NDJSON line at a time and needs recovery for the envelope noise
 * it adds despite the instruction — so these are functions on a profile, not
 * overrides on a subclass.
 */
export class GeminiSpanBehavior {
  /**
   * Stream spans using NDJSON format
   */
  async *streamSpans(
    params: LlmSpanParams,
  ): AsyncGenerator<Record<string, unknown>, void, unknown> {
    const { text, aiService, options } = params;
    // One module decides the security preamble, the I2V-vs-standard template,
    // the taxonomy list, the output format, and the version stamp.
    const systemPrompt = buildSystemPrompt(
      text,
      true,
      "gemini",
      false,
      options?.templateVersion,
      true,
    );

    let queue: string[] = [];
    let queueHead = 0;
    let resolveNext: (() => void) | null = null;
    let done = false;
    let error: Error | null = null;

    const push = (chunk: string) => {
      queue.push(chunk);
      if (resolveNext) {
        resolveNext();
        resolveNext = null;
      }
    };

    const finish = () => {
      done = true;
      if (resolveNext) {
        resolveNext();
        resolveNext = null;
      }
    };

    const fail = (err: Error) => {
      error = err;
      if (resolveNext) {
        resolveNext();
        resolveNext = null;
      }
    };

    // Start streaming in background.
    //
    // This runs on "span_labeling", not a Gemini-pinned operation. This client
    // is only constructed when the router already resolved the operation to
    // Gemini, so pinning would only serve to defeat the failover that made the
    // resolution correct in the first place.
    if (!aiService.stream) {
      throw new Error("AI service does not support streaming");
    }

    aiService
      .stream("span_labeling", {
        systemPrompt,
        userMessage: text,
        maxTokens: 16384,
        temperature: 0.1,
        onChunk: push,
      })
      .then(() => finish())
      .catch(fail);

    let buffer = "";

    while (true) {
      while (queueHead < queue.length) {
        const chunk = queue[queueHead++];
        buffer += chunk;

        let newlineIndex;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);

          if (line) {
            const span = parseNdjsonSpanLine(line);
            if (span) {
              yield span;
            }
          }
        }
      }

      if (queueHead > 4096 && queueHead * 2 > queue.length) {
        // Periodic compaction to keep the queue from growing without O(n) shifts.
        queue = queue.slice(queueHead);
        queueHead = 0;
      }

      if (done) break;
      if (error) throw error;

      // Wait for next chunk
      await new Promise<void>((resolve) => {
        resolveNext = resolve;
      });
    }

    // NDJSON is newline-SEPARATED, not newline-terminated: the provider ends
    // the stream at the closing brace of the final span, so that line never
    // meets a "\n" and would sit in the buffer forever. A single-span
    // response (the I2V motion-only template's normal case) is all tail —
    // without this flush the entire response is swallowed.
    const tail = buffer.trim();
    if (tail) {
      const span = parseNdjsonSpanLine(tail);
      if (span) {
        yield span;
      }
    }
  }

  parseResponseText(text: string): ReturnType<typeof parseJson> {
    const parsed = parseJson(text);
    if (parsed.ok) return parsed;

    const spans = this.recoverSpansFromText(text);
    if (spans && spans.length > 0) {
      log.debug("Gemini response parsed via recovery", {
        operation: "span_labeling",
        spanCount: spans.length,
        responseLength: text.length,
        responsePreview: text.slice(0, 200),
      });
      return { ok: true, value: { spans } };
    }

    log.warn("Gemini response parse failed", {
      operation: "span_labeling",
      responseLength: text.length,
      responsePreview: text.slice(0, 200),
    });
    return parsed;
  }

  normalizeParsedResponse<T extends Record<string, unknown>>(value: T): T {
    const spanContainer = value as { spans?: unknown };
    if (!Array.isArray(spanContainer.spans)) {
      return value;
    }

    spanContainer.spans = spanContainer.spans.map((span) => {
      if (!span || typeof span !== "object") {
        return span;
      }

      const spanRecord = span as Record<string, unknown>;
      if (
        typeof spanRecord.role !== "string" &&
        typeof spanRecord.category === "string"
      ) {
        spanRecord.role = spanRecord.category;
      }
      if ("category" in spanRecord) {
        delete spanRecord.category;
      }

      return spanRecord;
    });

    return value;
  }

  private recoverSpansFromText(
    text: string,
  ): Array<Record<string, unknown>> | null {
    const cleaned = this._stripCodeFences(cleanJsonEnvelope(text));
    const trimmed = this._trimToJsonStart(cleaned);
    const arraySection = this._extractSpanArraySection(trimmed);
    const searchText = arraySection ?? trimmed;

    const objects = this._extractJsonObjects(searchText);
    if (objects.length === 0) {
      return null;
    }

    const spans = objects
      .map((objectText) => this._safeParseObject(objectText))
      .filter((span): span is Record<string, unknown> =>
        this._isSpanObject(span),
      );

    return spans.length > 0 ? spans : null;
  }

  private _stripCodeFences(text: string): string {
    return text
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();
  }

  private _trimToJsonStart(text: string): string {
    const trimmed = text.trim();
    const firstBrace = trimmed.indexOf("{");
    const firstBracket = trimmed.indexOf("[");

    if (firstBrace === -1 && firstBracket === -1) {
      return trimmed;
    }

    const startIndex =
      firstBrace === -1
        ? firstBracket
        : firstBracket === -1
          ? firstBrace
          : Math.min(firstBrace, firstBracket);

    return startIndex > 0 ? trimmed.slice(startIndex) : trimmed;
  }

  private _extractSpanArraySection(text: string): string | null {
    const spansIndex = text.indexOf('"spans"');
    const arrayStart =
      spansIndex >= 0 ? text.indexOf("[", spansIndex) : text.indexOf("[");
    if (arrayStart === -1) return null;

    const arrayEnd = this._findMatchingBracket(text, arrayStart);
    if (arrayEnd === -1) {
      return text.slice(arrayStart + 1);
    }

    return text.slice(arrayStart + 1, arrayEnd);
  }

  private _findMatchingBracket(text: string, startIndex: number): number {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = startIndex; index < text.length; index += 1) {
      const char = text[index];

      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === "\\") {
          escaped = true;
          continue;
        }
        if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === "[") {
        depth += 1;
        continue;
      }

      if (char === "]") {
        depth -= 1;
        if (depth === 0) return index;
      }
    }

    return -1;
  }

  private _extractJsonObjects(text: string): string[] {
    const objects: string[] = [];
    let depth = 0;
    let inString = false;
    let escaped = false;
    let startIndex = -1;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];

      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === "\\") {
          escaped = true;
          continue;
        }
        if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === "{") {
        if (depth === 0) {
          startIndex = index;
        }
        depth += 1;
        continue;
      }

      if (char === "}") {
        depth -= 1;
        if (depth === 0 && startIndex !== -1) {
          objects.push(text.slice(startIndex, index + 1));
          startIndex = -1;
        }
      }
    }

    return objects;
  }

  private _safeParseObject(raw: string): Record<string, unknown> | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    const { repaired } = attemptJsonRepair(trimmed);
    try {
      const parsed = JSON.parse(repaired) as Record<string, unknown>;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private _isSpanObject(value: Record<string, unknown> | null): boolean {
    if (!value) return false;
    const hasText = typeof value.text === "string";
    const hasRole =
      typeof value.role === "string" || typeof value.category === "string";
    return hasText && hasRole;
  }
}
