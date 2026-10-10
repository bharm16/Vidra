import { beforeEach, describe, expect, it, vi } from "vitest";
import { CacheService } from "../CacheService";

vi.mock("@infrastructure/Logger", () => ({
  logger: {
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../SemanticCacheService.js", () => ({
  SemanticCacheEnhancer: {
    generateSemanticKey: vi.fn(
      (namespace: string, data: unknown) =>
        `semantic:${namespace}:${JSON.stringify(data).substring(0, 10)}`,
    ),
  },
}));

describe("CacheService.getOrCompute (single-flight)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invokes compute exactly once when 5 concurrent callers miss the same key", async () => {
    const service = new CacheService();

    let callCount = 0;
    const slowCompute = async (): Promise<{ result: string }> => {
      callCount++;
      // Yield a few times to give all 5 callers a chance to enter inflight.
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { result: "computed-once" };
    };

    const concurrency = 5;
    const results = await Promise.all(
      Array.from({ length: concurrency }, () =>
        service.getOrCompute("burst-key", slowCompute),
      ),
    );

    // Invariant: the underlying compute ran exactly once despite N concurrent misses
    expect(callCount).toBe(1);
    expect(results).toHaveLength(concurrency);
    for (const r of results) {
      expect(r.value).toEqual({ result: "computed-once" });
    }
    const computed = results.filter((r) => r.source === "computed");
    const coalesced = results.filter((r) => r.source === "coalesced");
    expect(computed).toHaveLength(1);
    expect(coalesced).toHaveLength(concurrency - 1);
  });

  it("returns cached source on subsequent calls after the first flight populates the cache", async () => {
    const service = new CacheService();
    let callCount = 0;
    const compute = async (): Promise<string> => {
      callCount++;
      return "v1";
    };

    const first = await service.getOrCompute("k1", compute);
    expect(first.source).toBe("computed");

    const second = await service.getOrCompute("k1", compute);
    expect(second.source).toBe("cache");
    expect(second.value).toBe("v1");
    expect(callCount).toBe(1);
  });

  it("releases the in-flight slot when compute rejects so retries can re-run", async () => {
    const service = new CacheService();
    let attempts = 0;
    const flaky = async (): Promise<string> => {
      attempts++;
      if (attempts === 1) {
        throw new Error("first attempt fails");
      }
      return "ok";
    };

    await expect(service.getOrCompute("flaky", flaky)).rejects.toThrow(
      "first attempt fails",
    );

    const second = await service.getOrCompute("flaky", flaky);
    expect(second.value).toBe("ok");
    expect(second.source).toBe("computed");
    expect(attempts).toBe(2);
  });
});
