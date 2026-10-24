import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpanLabelingCacheService } from "../SpanLabelingCacheService";

vi.mock("@infrastructure/Logger", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("SpanLabelingCacheService single-flight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invokes compute exactly once when 5 concurrent callers miss the same key", async () => {
    const service = new SpanLabelingCacheService();

    let callCount = 0;
    const slowCompute = async (): Promise<{ spans: string[] }> => {
      callCount++;
      // Simulate an expensive LLM call by yielding to the event loop a few times
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { spans: ["subject"] };
    };

    const concurrency = 5;
    const text = "prompt-under-contention";
    const policy = null;
    const templateVersion = "v1";

    const results = await Promise.all(
      Array.from({ length: concurrency }, () =>
        service.getOrCompute(text, policy, templateVersion, slowCompute),
      ),
    );

    // Invariant: the underlying compute ran exactly once despite N concurrent misses
    expect(callCount).toBe(1);
    // All callers receive the same result
    expect(results).toHaveLength(concurrency);
    for (const r of results) {
      expect(r.value).toEqual({ spans: ["subject"] });
    }
    // Exactly one caller is the "computed" source, the rest are "coalesced"
    const computed = results.filter((r) => r.source === "computed");
    const coalesced = results.filter((r) => r.source === "coalesced");
    expect(computed).toHaveLength(1);
    expect(coalesced).toHaveLength(concurrency - 1);
  });

  it("runs compute a second time after the first flight completes and cache expires", async () => {
    const service = new SpanLabelingCacheService();

    let callCount = 0;
    const compute = async (): Promise<{ value: number }> => {
      callCount++;
      return { value: callCount };
    };

    const first = await service.getOrCompute("k", null, "v1", compute);
    expect(first.source).toBe("computed");
    // Invalidate to simulate fresh miss
    await service.invalidate("k", null, "v1");
    const second = await service.getOrCompute("k", null, "v1", compute);
    expect(second.source).toBe("computed");

    expect(callCount).toBe(2);
  });

  it("releases inflight slot after compute rejects so retries can re-run", async () => {
    const service = new SpanLabelingCacheService();

    let attempts = 0;
    const flaky = async (): Promise<string> => {
      attempts++;
      if (attempts === 1) {
        throw new Error("first attempt fails");
      }
      return "ok";
    };

    await expect(
      service.getOrCompute("flaky-key", null, "v1", flaky),
    ).rejects.toThrow("first attempt fails");

    // Second attempt should run compute again (not a stale rejected promise)
    const result = await service.getOrCompute("flaky-key", null, "v1", flaky);
    expect(result.value).toBe("ok");
    expect(result.source).toBe("computed");
    expect(attempts).toBe(2);
  });
});

it("keeps a shared provider alive when only one request cancels", async () => {
  const cache = new SpanLabelingCacheService();
  const first = new AbortController(); const second = new AbortController();
  let finish!: (value: string) => void; let providerSignal: AbortSignal | undefined;
  const compute = vi.fn(async (signal?: AbortSignal): Promise<string> => { providerSignal = signal; return new Promise(resolve => { finish = resolve; }); });
  const abandoned = cache.getOrCompute("same words", null, null, compute, { signal: first.signal });
  const retained = cache.getOrCompute("same words", null, null, compute, { signal: second.signal });
  const cancelled = expect(abandoned).rejects.toMatchObject({ name: "AbortError" });
  await vi.waitFor(() => expect(compute).toHaveBeenCalledTimes(1)); first.abort(); await cancelled;
  expect(providerSignal?.aborted).toBe(false); finish("complete");
  await expect(retained).resolves.toMatchObject({ value: "complete", source: "coalesced" });
});

it("aborts shared provider work when its final request leaves", async () => {
  const cache = new SpanLabelingCacheService(); const cancellation = new AbortController(); let providerSignal: AbortSignal | undefined;
  const compute = vi.fn(async (signal?: AbortSignal): Promise<never> => { providerSignal = signal; return new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(signal.reason), { once: true })); });
  const result = cache.getOrCompute("same words", null, null, compute, { signal: cancellation.signal });
  const cancelled = expect(result).rejects.toMatchObject({ name: "AbortError" }); await vi.waitFor(() => expect(compute).toHaveBeenCalled()); cancellation.abort(); await cancelled;
  expect(providerSignal?.aborted).toBe(true);
});
