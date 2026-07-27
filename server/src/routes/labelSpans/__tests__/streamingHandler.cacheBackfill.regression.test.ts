import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { Response } from "express";
import { handleLabelSpansStreamRequest } from "../streamingHandler";
import type { AIModelService } from "@services/ai-model/AIModelService";
import type { StreamParams } from "@services/ai-model/AIModelService";
import type { SpanLabelingCacheService } from "@services/cache/SpanLabelingCacheService";
import type { AIResponse } from "@interfaces/IAIClient";

/**
 * Regression: the streaming route's cache backfill must not poison the
 * blocking route.
 *
 * The backfill used to write the RAW spans collected off the wire under a
 * placeholder meta version ("stream-backfill"), discarding the real template
 * version. A later blocking request read that entry back and served it as
 * X-Cache: HIT — unvalidated spans, wrong version, indistinguishable from a
 * genuine result.
 *
 * The backfill now writes the stream's finalized set (post merge / dedupe /
 * overlap / truncation) and preserves the template version.
 *
 * Faked here: the HTTP response socket and the cache store (Redis in
 * production). The span pipeline runs for real.
 */

const TEXT =
  "The quixotic bureaucrat contemplated recursive paperwork beneath the fluorescent hum for an unspecified duration.";

interface CapturedSet {
  templateVersion: string | null;
  value: { spans: Array<{ text: string }>; meta: { version: string } };
}

function makeCache(captured: CapturedSet[]): SpanLabelingCacheService {
  return {
    async set(
      _text: string,
      _policy: unknown,
      templateVersion: string | null,
      value: CapturedSet["value"],
    ): Promise<void> {
      captured.push({ templateVersion, value });
    },
  } as unknown as SpanLabelingCacheService;
}

function makeResponse(written: string[]): Response {
  const res = {
    writableEnded: false,
    destroyed: false,
    headersSent: true,
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn(),
    writableLength: 0,
    write(chunk: string): boolean {
      written.push(chunk);
      return true;
    },
    end(): void {
      res.writableEnded = true;
    },
    destroy(): void {
      res.destroyed = true;
    },
    status: vi.fn(() => res),
    json: vi.fn(() => res),
  };
  return res as unknown as Response;
}

function makeAiService(
  rawSpans: Array<{ text: string; role: string; confidence: number }>,
): AIModelService {
  return {
    async execute(): Promise<AIResponse> {
      return {
        text: JSON.stringify({ isAdversarial: false, spans: rawSpans }),
        metadata: { model: "gemini-2.5-flash", provider: "gemini" },
      };
    },
    async stream(_operation: string, options: StreamParams): Promise<string> {
      const body = rawSpans.map((span) => JSON.stringify(span) + "\n").join("");
      options.onChunk?.(body);
      return body;
    },
    getOperationConfig() {
      return { client: "gemini", model: "gemini-2.5-flash" };
    },
  } as unknown as AIModelService;
}

describe("stream cache backfill", () => {
  beforeEach(() => {
    vi.stubEnv("SPAN_PROVIDER", "gemini");
    vi.stubEnv("SPAN_MODEL", "gemini-2.5-flash");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("caches the finalized spans under the real template version, not the raw wire spans under a placeholder", async () => {
    const captured: CapturedSet[] = [];
    const written: string[] = [];
    const rawSpans = [
      {
        text: "quixotic bureaucrat",
        role: "subject.identity",
        confidence: 0.9,
      },
      // Adjacent, same parent category — only the finalized set merges these.
      { text: "recursive", role: "subject.appearance", confidence: 0.8 },
      { text: "paperwork", role: "subject.identity", confidence: 0.8 },
      { text: "fluorescent hum", role: "lighting.source", confidence: 0.88 },
    ];

    await handleLabelSpansStreamRequest({
      res: makeResponse(written),
      payload: { text: TEXT, templateVersion: "v2.3" },
      aiService: makeAiService(rawSpans),
      spanLabelingCache: makeCache(captured),
      text: TEXT,
      policy: null,
      templateVersion: "v2.3",
    });

    expect(captured.length).toBe(1);
    const entry = captured[0];
    expect(entry?.value.meta.version).toBe("v2.3");
    expect(entry?.value.meta.version).not.toBe("stream-backfill");

    const cachedTexts = entry?.value.spans.map((span) => span.text) ?? [];
    // The whole-set merge is visible in the cached set...
    expect(cachedTexts).toContain("recursive paperwork");
    // ...and its unmerged constituents are not, which is exactly what the raw
    // wire collection used to store.
    expect(cachedTexts).not.toContain("recursive");
    expect(cachedTexts).not.toContain("paperwork");
  });

  it("does not backfill when the client disconnects mid-stream", async () => {
    const captured: CapturedSet[] = [];
    const written: string[] = [];
    const res = makeResponse(written);
    // Simulate a hang-up before any span is written.
    res.destroyed = true;

    await handleLabelSpansStreamRequest({
      res,
      payload: { text: TEXT, templateVersion: "v2.3" },
      aiService: makeAiService([
        {
          text: "quixotic bureaucrat",
          role: "subject.identity",
          confidence: 0.9,
        },
      ]),
      spanLabelingCache: makeCache(captured),
      text: TEXT,
      policy: null,
      templateVersion: "v2.3",
    });

    expect(captured).toEqual([]);
  });
});
