import { describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import { createLabelSpansCoordinator } from "../coordinator";
import { handleLabelSpansStreamRequest } from "../streamingHandler";
import type { AIModelService } from "@services/ai-model/AIModelService";
import type { StreamParams } from "@services/ai-model/AIModelService";
import type { SpanLabelingCacheService } from "@services/cache/SpanLabelingCacheService";
import type { ResolvedExecution } from "@services/ai-model/types";

/**
 * Regression: a span-labeling result must be cached under the provider
 * responsible for it, never under the provider ModelConfig happens to name.
 *
 * The provider is a component of the span cache key
 * (SpanLabelingCacheService.generateCacheKey). Both cache-writing routes used
 * to obtain it by calling `getCurrentSpanProvider()`, which re-derived it from
 * `process.env` and `ModelConfig` — neither of which can see whether the
 * primary client is registered or whether its circuit is open. When the router
 * rerouted `span_labeling` to its fallback, the fallback's labels were written
 * under the primary's key and served to later requests as the primary's work.
 *
 * The invariant pinned here: whatever provider the router reports is the
 * provider the entry is keyed under. `span_labeling` is configured as
 * client "gemini" (see modelConfig.ts), so a port reporting a rerouted "qwen"
 * is exactly the divergence that used to be invisible.
 *
 * Faked here: the AIExecutionPort (the LLM SDK boundary), the cache store
 * (Redis in production) and the HTTP response socket. The span pipeline and
 * both route paths run for real.
 */

const TEXT =
  "The quixotic bureaucrat contemplated recursive paperwork beneath the fluorescent hum for an unspecified duration.";

const RAW_SPANS = [
  { text: "quixotic bureaucrat", role: "subject.identity", confidence: 0.9 },
  { text: "fluorescent hum", role: "lighting.source", confidence: 0.88 },
];

/**
 * The router rerouted away from the configured primary — the case where a
 * ModelConfig read gives the wrong answer.
 */
const REROUTED_TO_QWEN: ResolvedExecution = {
  client: "qwen",
  provider: "qwen",
  model: "qwen-3-32b",
  viaFallback: true,
};

interface CapturedWrite {
  provider: string | null | undefined;
}

function makeAiService(executedBy: ResolvedExecution): AIModelService {
  return {
    resolveExecution: () => executedBy,
    async execute() {
      return {
        text: JSON.stringify({ isAdversarial: false, spans: RAW_SPANS }),
        metadata: { model: executedBy.model, provider: executedBy.provider },
        executedBy,
      };
    },
    async stream(_operation: string, options: StreamParams): Promise<string> {
      const body = RAW_SPANS.map((span) => JSON.stringify(span) + "\n").join(
        "",
      );
      options.onChunk?.(body);
      return body;
    },
    getOperationConfig() {
      // Deliberately the configured primary, NOT the rerouted provider: this
      // is the stale answer the old code trusted.
      return { client: "gemini", model: "gemini-2.5-flash" };
    },
  } as unknown as AIModelService;
}

function makeResponse(): Response {
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
    write: () => true,
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

describe("span cache key provider", () => {
  it("keys the streaming backfill on the provider that produced the spans", async () => {
    const writes: CapturedWrite[] = [];
    const cache = {
      async set(
        _text: string,
        _policy: unknown,
        _templateVersion: string | null,
        _value: unknown,
        options?: { provider?: string | null },
      ): Promise<void> {
        writes.push({ provider: options?.provider });
      },
    } as unknown as SpanLabelingCacheService;

    await handleLabelSpansStreamRequest({
      payload: { text: TEXT, templateVersion: "v1" },
      text: TEXT,
      policy: null,
      templateVersion: "v1",
      res: makeResponse(),
      aiService: makeAiService(REROUTED_TO_QWEN),
      spanLabelingCache: cache,
      requestId: "req-stream",
    });

    expect(writes).toHaveLength(1);
    expect(writes[0]?.provider).toBe("qwen");
    expect(writes[0]?.provider).not.toBe("gemini");
  });

  it("keys the blocking route's cache entry on the router's answer, not ModelConfig's", async () => {
    const writes: CapturedWrite[] = [];
    const cache = {
      async getOrCompute(
        _text: string,
        _policy: unknown,
        _templateVersion: string | null,
        compute: () => Promise<unknown>,
        options?: { provider?: string | null },
      ): Promise<{ value: unknown; source: string }> {
        writes.push({ provider: options?.provider });
        return { value: await compute(), source: "compute" };
      },
    } as unknown as SpanLabelingCacheService;

    const coordinator = createLabelSpansCoordinator(
      makeAiService(REROUTED_TO_QWEN),
      cache,
    );

    await coordinator.resolve({
      payload: { text: TEXT, templateVersion: "v1" },
      text: TEXT,
      policy: null,
      templateVersion: "v1",
      requestId: "req-blocking",
      startTimeMs: Date.now(),
    });

    expect(writes).toHaveLength(1);
    expect(writes[0]?.provider).toBe("qwen");
    expect(writes[0]?.provider).not.toBe("gemini");
  });
});
