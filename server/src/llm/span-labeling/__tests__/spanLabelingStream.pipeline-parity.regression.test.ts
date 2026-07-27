import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { labelSpans, labelSpansStream } from "../SpanLabelingService";
import type { SpanStreamFinalization } from "../SpanLabelingService";
import type { AIExecutionPort } from "@services/ai-model/ports/AIExecutionPort";
import type { StreamParams } from "@services/ai-model/AIModelService";
import type { AIResponse } from "@interfaces/IAIClient";
import type { LabelSpansParams, SpanLike } from "../types";

/**
 * Regression: the streaming route and the blocking route must run ONE span
 * pipeline, not two.
 *
 * Streaming is the path the client actually takes
 * (client/src/features/span-highlighting/hooks/useSpanLabeling.ts calls
 * labelSpansStream unconditionally; blocking is only reached via fallback).
 * The stream used to apply none of the processing phases the blocking route
 * applies — no normalization, no stable ids, no header filter, no non-visual
 * filter, no confidence threshold, no maxSpans cap. Every filter fix therefore
 * landed on code creators never executed.
 *
 * Only the process boundary is faked: the AIExecutionPort that the span
 * clients call (`execute` for blocking, `stream` for streaming). Everything
 * inside — client selection, prompt assembly, NDJSON parsing, normalization,
 * every processing phase — runs for real.
 */

// Deliberately low on video-taxonomy vocabulary so the NLP fast path declines
// and the request reaches the LLM client, while still containing every span
// text the scenarios below reference.
const TEXT =
  "The quixotic bureaucrat contemplated recursive paperwork beneath the fluorescent hum for an unspecified duration.";

interface RawSpan {
  text: string;
  role: string;
  confidence: number;
}

interface ScriptedPort extends AIExecutionPort {
  executeCalls: number;
  streamCalls: number;
}

/**
 * One port that can serve the same raw spans through either transport:
 * `execute` returns them as a JSON payload (blocking), `stream` pushes them as
 * NDJSON lines (streaming). That is what makes the two routes comparable.
 */
function makePort(rawSpans: RawSpan[]): ScriptedPort {
  const port: ScriptedPort = {
    executeCalls: 0,
    streamCalls: 0,
    async execute(): Promise<AIResponse> {
      port.executeCalls += 1;
      return {
        text: JSON.stringify({
          analysis_trace: "parity trace",
          isAdversarial: false,
          spans: rawSpans,
        }),
        metadata: { model: "gemini-2.5-flash", provider: "gemini" },
      };
    },
    async stream(_operation: string, options: StreamParams): Promise<string> {
      port.streamCalls += 1;
      const body = rawSpans.map((span) => JSON.stringify(span) + "\n").join("");
      options.onChunk?.(body);
      return body;
    },
    getOperationConfig() {
      return { client: "gemini", model: "gemini-2.5-flash" } as never;
    },
  };
  return port;
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

const identity = (span: { text: string; role?: string }): string =>
  `${span.text}::${span.role ?? ""}`;

describe("span labeling stream applies the blocking pipeline", () => {
  beforeEach(() => {
    // Provider selection reads the environment before it reads the model, so
    // pin it: the streaming client is the Gemini one.
    vi.stubEnv("SPAN_PROVIDER", "gemini");
    vi.stubEnv("SPAN_MODEL", "gemini-2.5-flash");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("drops the spans the blocking pipeline rejects instead of streaming them raw", async () => {
    const rawSpans: RawSpan[] = [
      {
        text: "quixotic bureaucrat",
        role: "subject.identity",
        confidence: 0.9,
      },
      // Section-header word — HeaderFilter rejects it on the blocking path.
      { text: "duration", role: "technical.duration", confidence: 0.9 },
      // Below the default 0.5 threshold — ConfidenceFilter rejects it.
      { text: "recursive", role: "subject.appearance", confidence: 0.2 },
      // Hallucinated — normalization cannot anchor it in the source text.
      {
        text: "a phrase that is simply not there",
        role: "style",
        confidence: 0.9,
      },
      { text: "fluorescent hum", role: "lighting.source", confidence: 0.88 },
    ];

    const { streamed } = await drainStream({ text: TEXT }, makePort(rawSpans));

    const streamedTexts = streamed.map((span) => span.text);
    expect(streamedTexts).toContain("quixotic bureaucrat");
    expect(streamedTexts).toContain("fluorescent hum");
    expect(streamedTexts).not.toContain("duration");
    expect(streamedTexts).not.toContain("recursive");
    expect(streamedTexts).not.toContain("a phrase that is simply not there");
  });

  it("gives every streamed span the normalization the blocking path gives it", async () => {
    const rawSpans: RawSpan[] = [
      {
        text: "quixotic bureaucrat",
        role: "subject.identity",
        confidence: 0.9,
      },
      { text: "fluorescent hum", role: "lighting.source", confidence: 0.88 },
    ];

    const { streamed } = await drainStream({ text: TEXT }, makePort(rawSpans));

    expect(streamed.length).toBe(2);
    for (const span of streamed) {
      // Indices resolved against the real source text, not trusted from the LLM.
      expect(TEXT.slice(span.start, span.end)).toBe(span.text);
      // Stable id assigned by SpanNormalizer — the stream produced none before.
      expect(typeof span.id).toBe("string");
      expect(span.id).toBeTruthy();
    }
  });

  it("finalizes to the same span set the blocking route returns", async () => {
    const rawSpans: RawSpan[] = [
      {
        text: "quixotic bureaucrat",
        role: "subject.identity",
        confidence: 0.9,
      },
      // Exact duplicate — the blocking path deduplicates it.
      {
        text: "quixotic bureaucrat",
        role: "subject.identity",
        confidence: 0.9,
      },
      // Adjacent, same parent category — the blocking path merges these two.
      { text: "recursive", role: "subject.appearance", confidence: 0.8 },
      { text: "paperwork", role: "subject.identity", confidence: 0.8 },
      { text: "duration", role: "technical.duration", confidence: 0.9 },
      { text: "fluorescent hum", role: "lighting.source", confidence: 0.88 },
    ];

    const blockingPort = makePort(rawSpans);
    const blocking = await labelSpans({ text: TEXT }, blockingPort);
    // Guard the premise of the comparison: the NLP fast path must not have
    // short-circuited the LLM call, or the two sides aren't comparable.
    expect(blockingPort.executeCalls).toBeGreaterThan(0);

    const { finalization } = await drainStream(
      { text: TEXT },
      makePort(rawSpans),
    );

    expect(finalization.spans.map(identity)).toEqual(
      blocking.spans.map(identity),
    );
    // And the merge actually happened, so the comparison has teeth.
    expect(finalization.spans.map((span) => span.text)).toContain(
      "recursive paperwork",
    );
    // The real template version travels with the finalized set.
    expect(finalization.meta.version).toBe(blocking.meta.version);
  });
});

describe("span labeling stream honours maxSpans and minConfidence", () => {
  beforeEach(() => {
    vi.stubEnv("SPAN_PROVIDER", "gemini");
    vi.stubEnv("SPAN_MODEL", "gemini-2.5-flash");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("never streams more than maxSpans spans", async () => {
    const rawSpans: RawSpan[] = [
      {
        text: "quixotic bureaucrat",
        role: "subject.identity",
        confidence: 0.9,
      },
      { text: "recursive", role: "subject.appearance", confidence: 0.85 },
      { text: "fluorescent hum", role: "lighting.source", confidence: 0.8 },
      { text: "contemplated", role: "action.movement", confidence: 0.75 },
    ];

    const { streamed, finalization } = await drainStream(
      { text: TEXT, maxSpans: 2 },
      makePort(rawSpans),
    );

    expect(streamed.length).toBe(2);
    expect(finalization.spans.length).toBeLessThanOrEqual(2);
  });

  it("excludes spans below minConfidence from the wire and the finalized set", async () => {
    const rawSpans: RawSpan[] = [
      {
        text: "quixotic bureaucrat",
        role: "subject.identity",
        confidence: 0.95,
      },
      { text: "fluorescent hum", role: "lighting.source", confidence: 0.6 },
      { text: "contemplated", role: "action.movement", confidence: 0.4 },
    ];

    const { streamed, finalization } = await drainStream(
      { text: TEXT, minConfidence: 0.9 },
      makePort(rawSpans),
    );

    expect(streamed.map((span) => span.text)).toEqual(["quixotic bureaucrat"]);
    expect(finalization.spans.map((span) => span.text)).toEqual([
      "quixotic bureaucrat",
    ]);
  });
});
