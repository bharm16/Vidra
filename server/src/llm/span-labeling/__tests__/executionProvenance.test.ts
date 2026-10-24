import { describe, it, expect, vi } from "vitest";
import { labelSpans } from "@llm/span-labeling/SpanLabelingService";
import { createLabelSpansCoordinator } from "@routes/labelSpans/coordinator";
import { SpanLabelingCacheService } from "@services/cache/SpanLabelingCacheService";
import { AIModelService } from "@services/ai-model/AIModelService";
import { LlmProviderCircuitManager } from "@llm/failover/LlmProviderCircuitManager";
import { AIClientError } from "@interfaces/IAIClient";

// Isolate routing, processing and caching from native NLP inference.
const text = "A dancer spins";
const raw = { analysis_trace: "controlled", isAdversarial: false, spans: [{ text: "dancer", role: "subject.identity", confidence: .95 }, { text: "spins", role: "action.movement", confidence: .6 }], meta: { version: "v1", notes: "controlled provider" } };
describe("execution ownership", () => {
  it("reports the actual fallback provider and uses its request profile", async () => {
    const primary = { complete: vi.fn(async () => { throw new AIClientError("controlled outage", 503); }) };
    const fallback = { complete: vi.fn(async () => ({ text: JSON.stringify(raw), metadata: { provider: "qwen" } })) };
    const ai = new AIModelService({ clients: { openai: null, gemini: primary as never, qwen: fallback as never } });
    const result = await labelSpans({ text }, ai);
    expect(primary.complete).toHaveBeenCalledTimes(1); expect(fallback.complete).toHaveBeenCalledTimes(1); expect(result.meta.provider).toBe("qwen");
  });
  it("never serves a fallback result from the healthy primary cache entry", async () => {
    const primary = { complete: vi.fn().mockRejectedValueOnce(new AIClientError("outage", 503)).mockResolvedValue({ text: JSON.stringify(raw), metadata: {} }) };
    const fallback = { complete: vi.fn(async () => ({ text: JSON.stringify({ ...raw, spans: raw.spans.slice(0, 1) }), metadata: {} })) };
    const ai = new AIModelService({ clients: { openai: null, gemini: primary as never, qwen: fallback as never } });
    const coordinator = createLabelSpansCoordinator(ai, new SpanLabelingCacheService());
    const resolve = () => coordinator.resolve({ payload: { text }, text, userId: "creator", startTimeMs: performance.now() });
    expect((await resolve()).result?.meta.provider).toBe("qwen");
    const recovered = await resolve(); expect(recovered.headers["X-Cache"]).toBe("MISS"); expect(recovered.result?.meta.provider).toBe("gemini");
    expect((await resolve()).headers["X-Cache"]).toBe("HIT");
  });

  it("stream dispatch honors the circuit-aware route", async () => {
    const circuit = new LlmProviderCircuitManager({ consecutiveFailureThreshold: 1 }); circuit.recordFailure("gemini");
    const primary = { complete: vi.fn(), streamComplete: vi.fn(async () => "primary") };
    const fallback = { complete: vi.fn(), streamComplete: vi.fn(async () => "fallback") };
    const ai = new AIModelService({ clients: { openai: null, gemini: primary as never, qwen: fallback as never }, providerCircuit: circuit });
    expect(ai.resolveExecution("span_labeling").client).toBe("qwen");
    expect(await ai.stream("span_labeling", { systemPrompt: "test", onChunk: () => undefined })).toBe("fallback");
    expect(primary.streamComplete).not.toHaveBeenCalled(); expect(fallback.streamComplete).toHaveBeenCalledTimes(1);
  });
});
