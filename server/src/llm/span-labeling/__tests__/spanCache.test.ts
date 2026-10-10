import { describe, it, expect, vi } from "vitest";
import { computeCachedSpans } from "../spanCache";
import type { SpanLabelingCacheService } from "@services/cache/SpanLabelingCacheService";
import type { AIExecutionPort } from "@services/ai-model/ports/AIExecutionPort";
import type { LabelSpansResult } from "../types";

describe("computeCachedSpans", () => {
  it("runs compute behind getOrCompute with the shared TTL + resolved provider, returning result and source", async () => {
    const result = { spans: [] } as unknown as LabelSpansResult;
    const getOrCompute = vi
      .fn()
      .mockResolvedValue({ value: result, source: "cache" });
    const resolveExecution = vi.fn().mockReturnValue({ provider: "gemini" });
    const compute = vi.fn();

    const out = await computeCachedSpans({
      cache: { getOrCompute } as unknown as SpanLabelingCacheService,
      aiService: { resolveExecution } as unknown as AIExecutionPort,
      text: "hi",
      policy: null,
      templateVersion: null,
      compute,
    });

    expect(out).toEqual({ result, source: "cache" });
    expect(resolveExecution).toHaveBeenCalledWith("span_labeling");
    expect(getOrCompute).toHaveBeenCalledWith("hi", null, null, compute, {
      ttl: 3600,
      provider: "gemini",
    });
  });
});
