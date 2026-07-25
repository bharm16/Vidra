import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createLabelSpansRoute } from "@routes/labelSpansRoute";
import { toPublicLabelSpansResult } from "@routes/labelSpans/transform";
import { SpanLabelingCacheService } from "@services/cache/SpanLabelingCacheService";
import type { AIModelService } from "@services/ai-model/AIModelService";
import type { AIExecutionPort } from "@services/ai-model/ports/AIExecutionPort";
import type { AIResponse } from "@interfaces/IAIClient";
import { runSupertestOrSkip } from "./test-helpers/supertestSafeRequest";

/**
 * Route-seam tests for POST /api/llm/label-spans.
 *
 * The real router, request parser, coordinator, cache service (in-memory),
 * span-labeling pipeline and public transform all run; the only stub is the
 * scripted AIExecutionPort instance injected where DI injects aiService.
 * Replaces the route-pipeline and contract tests that mocked
 * SpanLabelingService itself.
 */

// No video-taxonomy vocabulary, so the NLP fast-path declines and the
// pipeline reaches the scripted LLM port.
const LLM_ONLY_TEXT =
  "The quixotic bureaucrat contemplated recursive paperwork beneath the fluorescent hum.";

interface ScriptedPort extends AIExecutionPort {
  calls: Array<{ operation: string }>;
}

function spanPayload(
  spans: Array<{ text: string; role: string; confidence?: number }>,
): string {
  return JSON.stringify({
    analysis_trace: "route-seam trace",
    isAdversarial: false,
    spans: spans.map((s) => ({ confidence: 0.9, ...s })),
  });
}

function makePort(responses: string[], delayMs = 0): ScriptedPort {
  const calls: Array<{ operation: string }> = [];
  return {
    calls,
    async execute(operation: string): Promise<AIResponse> {
      calls.push({ operation });
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      const index = Math.min(calls.length - 1, responses.length - 1);
      return {
        text: responses[index] ?? "",
        metadata: { model: "gpt-4o-2024-08-06", provider: "openai" },
      };
    },
    getOperationConfig() {
      return { client: "openai", model: "gpt-4o-2024-08-06" } as never;
    },
  };
}

function makeApp(
  port: ScriptedPort,
  cache: SpanLabelingCacheService | null = null,
): express.Express {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/llm/label-spans",
    createLabelSpansRoute(port as unknown as AIModelService, cache),
  );
  return app;
}

describe("label-spans route seam", () => {
  it("returns the success envelope with transformed public spans under data", async () => {
    const port = makePort([
      spanPayload([{ text: "quixotic bureaucrat", role: "subject.identity" }]),
    ]);
    const app = makeApp(port);

    const response = await runSupertestOrSkip(() =>
      request(app)
        .post("/api/llm/label-spans")
        .send({ text: LLM_ONLY_TEXT })
        .expect(200),
    );
    if (!response) return;

    expect(response.body.success).toBe(true);
    const spans = response.body.data?.spans as Array<{
      text: string;
      category?: string;
      start?: number;
      end?: number;
    }>;
    expect(Array.isArray(spans)).toBe(true);
    expect(spans.length).toBeGreaterThan(0);
    expect(spans[0]?.text).toBe("quixotic bureaucrat");
    expect(spans[0]?.category).toBe("subject.identity");
    expect(typeof spans[0]?.start).toBe("number");
    expect(typeof spans[0]?.end).toBe("number");
  });

  it("returns the canonical 400 error envelope for an invalid body", async () => {
    const port = makePort([]);
    const app = makeApp(port);

    const response = await runSupertestOrSkip(() =>
      request(app).post("/api/llm/label-spans").send({}).expect(400),
    );
    if (!response) return;

    expect(response.body.success).toBe(false);
    expect(typeof response.body.error).toBe("string");
    expect(port.calls.length).toBe(0);
  });

  it("returns the 502 error envelope when the LLM output is unusable", async () => {
    const port = makePort(["definitely not json {{{"]);
    const app = makeApp(port);

    const response = await runSupertestOrSkip(() =>
      request(app)
        .post("/api/llm/label-spans")
        .send({ text: LLM_ONLY_TEXT })
        .expect(502),
    );
    if (!response) return;

    expect(response.body.success).toBe(false);
    expect(typeof response.body.error).toBe("string");
  });

  it("returns the canonical error envelope for an invalid /stream body", async () => {
    const port = makePort([]);
    const app = makeApp(port);

    const response = await runSupertestOrSkip(() =>
      request(app).post("/api/llm/label-spans/stream").send({}).expect(400),
    );
    if (!response) return;

    expect(response.body.success).toBe(false);
    expect(port.calls.length).toBe(0);
  });

  it("streams NDJSON spans for a valid /stream request", async () => {
    const port = makePort([
      spanPayload([{ text: "quixotic bureaucrat", role: "subject.identity" }]),
    ]);
    const app = makeApp(port);

    const response = await runSupertestOrSkip(() =>
      request(app)
        .post("/api/llm/label-spans/stream")
        .send({ text: LLM_ONLY_TEXT })
        .expect(200),
    );
    if (!response) return;

    expect(response.text).toContain("quixotic bureaucrat");
  });

  it("fails the /stream request loudly when the LLM output is unusable", async () => {
    const port = makePort(["definitely not json {{{"]);
    const app = makeApp(port);

    const response = await runSupertestOrSkip(() =>
      request(app)
        .post("/api/llm/label-spans/stream")
        .send({ text: LLM_ONLY_TEXT }),
    );
    if (!response) return;

    // Before any bytes are streamed the handler still owns the status line —
    // the failure must surface as an error status or an NDJSON error record,
    // never a silent empty 200 stream.
    if (response.status === 200) {
      expect(response.text).toMatch(/error/i);
    } else {
      expect(response.status).toBeGreaterThanOrEqual(500);
    }
  });

  it("serves the second identical request from cache: MISS then HIT, one LLM call total", async () => {
    const port = makePort([
      spanPayload([{ text: "quixotic bureaucrat", role: "subject.identity" }]),
    ]);
    const cache = new SpanLabelingCacheService({});
    const app = makeApp(port, cache);
    const body = { text: LLM_ONLY_TEXT };

    const results = await runSupertestOrSkip(async () => {
      const first = await request(app)
        .post("/api/llm/label-spans")
        .send(body)
        .expect(200);
      const second = await request(app)
        .post("/api/llm/label-spans")
        .send(body)
        .expect(200);
      return { first, second };
    });
    if (!results) return;

    expect(results.first.headers["x-cache"]).toBe("MISS");
    expect(results.second.headers["x-cache"]).toBe("HIT");
    expect(results.second.body.data.spans).toEqual(
      results.first.body.data.spans,
    );
    expect(port.calls.length).toBe(1);
  });

  it("coalesces concurrent identical requests into a single LLM call", async () => {
    const port = makePort(
      [
        spanPayload([
          { text: "quixotic bureaucrat", role: "subject.identity" },
        ]),
      ],
      50,
    );
    const cache = new SpanLabelingCacheService({});
    const app = makeApp(port, cache);
    const body = { text: LLM_ONLY_TEXT };

    const results = await runSupertestOrSkip(() =>
      Promise.all([
        request(app).post("/api/llm/label-spans").send(body).expect(200),
        request(app).post("/api/llm/label-spans").send(body).expect(200),
      ]),
    );
    if (!results) return;

    // Single-flight is the invariant: one upstream call serves both
    // responses with identical payloads. (Which layer reports the dedup —
    // coordinator COALESCED header vs cache-level in-flight sharing —
    // depends on timing and is not the contract.)
    expect(port.calls.length).toBe(1);
    for (const response of results) {
      expect(response.body.success).toBe(true);
    }
    expect(results[0]?.body.data.spans).toEqual(results[1]?.body.data.spans);
  });
});

describe("label-spans public transform (pure)", () => {
  it("maps role into public category and keeps positional metadata", () => {
    const result = toPublicLabelSpansResult({
      spans: [
        {
          text: "quixotic bureaucrat",
          role: "subject.identity",
          confidence: 0.9,
          start: 4,
          end: 23,
        },
      ],
      meta: { version: "v1", notes: "" },
    } as never);

    expect(result.spans[0]?.category).toBe("subject.identity");
    expect(result.spans[0]?.start).toBe(4);
    expect(result.spans[0]?.end).toBe(23);
  });

  it("falls back to a valid taxonomy id when role is unavailable", () => {
    const result = toPublicLabelSpansResult({
      spans: [{ text: "something", confidence: 0.5, start: 0, end: 9 }],
      meta: { version: "v1", notes: "" },
    } as never);

    expect(typeof result.spans[0]?.category).toBe("string");
    expect((result.spans[0]?.category ?? "").length).toBeGreaterThan(0);
  });
});
