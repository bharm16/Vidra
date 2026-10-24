import { describe, it, expect, vi } from "vitest";
import { labelSpans } from "@llm/span-labeling/SpanLabelingService";
import { createLabelSpansCoordinator } from "@routes/labelSpans/coordinator";
import { SpanLabelingCacheService } from "@services/cache/SpanLabelingCacheService";

// Isolate routing, processing and caching from native NLP inference.
const text = "A dancer spins";
const raw = { analysis_trace: "controlled", isAdversarial: false, spans: [{ text: "dancer", role: "subject.identity", confidence: .95 }, { text: "spins", role: "action.movement", confidence: .6 }], meta: { version: "v1", notes: "controlled provider" } };
function mockAi() {
  return { resolveExecution: vi.fn(() => ({ client: "openai", provider: "openai", model: "gpt-4o", viaFallback: false })), execute: vi.fn(async () => ({ text: JSON.stringify(raw), metadata: {}, executedBy: { client: "openai", provider: "openai", model: "gpt-4o", viaFallback: false } })) };
}
describe("effective labeling requests", () => {
  it("keeps different span budgets independent on a warm cache", async () => {
    const ai = mockAi(); const coordinator = createLabelSpansCoordinator(ai as never, new SpanLabelingCacheService());
    const resolve = (maxSpans: number) => coordinator.resolve({ payload: { text, maxSpans }, text, userId: "creator", startTimeMs: performance.now() });
    const first = await resolve(1); const second = await resolve(80);
    expect(first.result?.spans).toHaveLength(1); expect(second.headers["X-Cache"]).toBe("MISS"); expect(second.result?.spans).toHaveLength(2); expect(ai.execute).toHaveBeenCalledTimes(2);
    const uncached = await labelSpans({ text, maxSpans: 80 }, ai as never); expect(uncached.spans).toHaveLength(2);
  });
  it("keeps identical private labeling requests in separate owner scopes", async () => {
    const ai = mockAi(); const coordinator = createLabelSpansCoordinator(ai as never, new SpanLabelingCacheService());
    const resolve = (userId: string) => coordinator.resolve({ payload: { text }, text, userId, startTimeMs: performance.now() });
    expect((await resolve("alice")).headers["X-Cache"]).toBe("MISS");
    expect((await resolve("bob")).headers["X-Cache"]).toBe("MISS");
    expect((await resolve("alice")).headers["X-Cache"]).toBe("HIT");
    expect(ai.execute).toHaveBeenCalledTimes(2);
  });

  it("keeps different confidence thresholds independent on a warm cache", async () => {
    const ai = mockAi(); const coordinator = createLabelSpansCoordinator(ai as never, new SpanLabelingCacheService());
    const resolve = (minConfidence: number) => coordinator.resolve({ payload: { text, minConfidence }, text, userId: "creator", startTimeMs: performance.now() });
    const first = await resolve(.9); const second = await resolve(.2);
    expect(first.result?.spans).toHaveLength(1); expect(second.headers["X-Cache"]).toBe("MISS"); expect(second.result?.spans).toHaveLength(2);
    expect((await labelSpans({ text, minConfidence: .2 }, ai as never)).spans).toHaveLength(2);
  });
});
