import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { labelSpansStream } from "../SpanLabelingService";
import type { SpanStreamFinalization } from "../SpanLabelingService";
import type { AIExecutionPort } from "@services/ai-model/ports/AIExecutionPort";
import type { StreamParams } from "@services/ai-model/AIModelService";
import type { AIResponse } from "@interfaces/IAIClient";
import type { LabelSpansParams, SpanLike } from "../types";

/**
 * Regression: a span line the provider ends the stream on — with no trailing
 * newline — must still be parsed and yielded.
 *
 * NDJSON is newline-SEPARATED, but the streaming line parser treated it as
 * newline-TERMINATED: it only parsed buffer content up to a "\n" and never
 * flushed what remained when the provider finished. Gemini ends its output at
 * the closing brace of the last span, so the final span of every streaming
 * response sat unparsed in the buffer. For the I2V template — motion-only
 * labeling that typically produces exactly ONE span — that meant the entire
 * response was swallowed: HTTP 200, empty body, zero spans, no error. Since
 * the primary authoring flow enters I2V mode as soon as a first frame exists,
 * span highlights and click-to-enhance died in the state users actually
 * inhabit. (Live capture, Gemini 2.5 Flash, i2v-v2: chunks
 * '{"text": "rehearses", "role": "action' + '.movement", "confidence": 0.9}'
 * — valid NDJSON, no trailing newline, zero spans yielded.)
 *
 * Only the process-external LLM boundary is faked, exactly like the
 * pipeline-parity suite. Everything inside — client selection, prompt
 * assembly, NDJSON parsing, normalization, per-span processing — runs real.
 */

// Motion-heavy so the scripted spans anchor in the source text; the streaming
// path always reaches the LLM client (it bypasses the NLP fast path).
const TEXT =
  "The archivist slowly turns toward the window while the camera dollies closer through drifting dust.";

interface RawSpan {
  text: string;
  role: string;
  confidence: number;
}

/**
 * A port that streams spans the way the real provider does: newline-separated
 * NDJSON with NO newline after the final line, delivered in chunks that split
 * mid-token.
 */
function makeUnterminatedStreamPort(rawSpans: RawSpan[]): AIExecutionPort {
  return {
    async execute(): Promise<AIResponse> {
      return {
        text: JSON.stringify({ spans: rawSpans }),
        metadata: { model: "gemini-2.5-flash", provider: "gemini" },
      };
    },
    async stream(_operation: string, options: StreamParams): Promise<string> {
      const body = rawSpans.map((span) => JSON.stringify(span)).join("\n"); // newline-separated — nothing after the last span
      // Split mid-line like a real transport does.
      const mid = Math.floor(body.length / 2);
      options.onChunk?.(body.slice(0, mid));
      options.onChunk?.(body.slice(mid));
      return body;
    },
    getOperationConfig() {
      return { client: "gemini", model: "gemini-2.5-flash" } as never;
    },
  };
}

async function drainStream(
  params: LabelSpansParams,
  port: AIExecutionPort,
): Promise<{ streamed: SpanLike[]; finalization: SpanStreamFinalization }> {
  const iterator = labelSpansStream(params, port);
  const streamed: SpanLike[] = [];
  for (;;) {
    const next = await iterator.next();
    if (next.done) {
      return { streamed, finalization: next.value };
    }
    streamed.push(next.value);
  }
}

describe("streaming span labeling flushes the final unterminated line", () => {
  beforeEach(() => {
    vi.stubEnv("SPAN_PROVIDER", "gemini");
    vi.stubEnv("SPAN_MODEL", "gemini-2.5-flash");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("a single-span response with no trailing newline still yields its span (the I2V presentation)", async () => {
    const { streamed, finalization } = await drainStream(
      { text: TEXT, templateVersion: "i2v-v2" },
      makeUnterminatedStreamPort([
        { text: "slowly turns", role: "action.movement", confidence: 0.9 },
      ]),
    );

    expect(streamed.length).toBe(1);
    expect(streamed[0]?.text).toBe("slowly turns");
    expect(TEXT.slice(streamed[0]!.start, streamed[0]!.end)).toBe(
      "slowly turns",
    );
    expect(finalization.spans.length).toBe(1);
    expect(finalization.meta.version).toBe("i2v-v2");
  });

  it("the last span of a multi-span response is not dropped", async () => {
    const { streamed } = await drainStream(
      { text: TEXT },
      makeUnterminatedStreamPort([
        { text: "slowly turns", role: "action.movement", confidence: 0.9 },
        { text: "camera dollies", role: "camera.movement", confidence: 0.85 },
      ]),
    );

    const texts = streamed.map((span) => span.text);
    expect(texts).toContain("slowly turns");
    expect(texts).toContain("camera dollies");
  });
});
