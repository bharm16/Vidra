import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpanLabelingCacheService } from "../SpanLabelingCacheService";

vi.mock("@infrastructure/Logger", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("SpanLabelingCacheService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("tracks misses and hits in the memory cache", async () => {
    const service = new SpanLabelingCacheService();

    const miss = await service.get("text", null, null);
    expect(miss).toBeNull();
    expect(service.getStats().misses).toBe(1);

    await service.set("text", null, null, {
      spans: [{ text: "text", role: "subject" }],
      meta: { version: "v1", notes: "ok" },
    });
    const hit = await service.get("text", null, null);
    expect(hit).toEqual({
      spans: [{ text: "text", role: "subject" }],
      meta: { version: "v1", notes: "ok" },
    });
    expect(service.getStats().hits).toBe(1);
  });

  it("writes entries to memory with TTL", async () => {
    const service = new SpanLabelingCacheService({ defaultTTL: 120 });

    const success = await service.set(
      "prompt",
      { policy: "strict" },
      "v1",
      { spans: [], meta: { version: "v1", notes: "ok" } },
      { ttl: 60, provider: "openai" },
    );

    expect(success).toBe(true);
    expect(
      await service.get("prompt", { policy: "strict" }, "v1", "openai"),
    ).toEqual({ spans: [], meta: { version: "v1", notes: "ok" } });
    expect(service.getStats().sets).toBe(1);
  });

  it("invalidates specific keys and pattern keys", async () => {
    const service = new SpanLabelingCacheService();

    await service.set("prompt", { policy: 1 }, "v1", {
      spans: [],
      meta: { version: "v1", notes: "ok" },
    });
    const specificDeleted = await service.invalidate(
      "prompt",
      { policy: 1 },
      "v1",
    );
    expect(specificDeleted).toBeGreaterThanOrEqual(1);

    await service.set("prompt", { policy: 2 }, "v1", {
      spans: [],
      meta: { version: "v1", notes: "ok" },
    });
    const patternDeleted = await service.invalidate("prompt");
    expect(patternDeleted).toBeGreaterThan(0);
  });

  it("expires in-memory entries based on ttl", async () => {
    vi.useFakeTimers();
    const service = new SpanLabelingCacheService();

    await service.set(
      "ttl-test",
      null,
      null,
      {
        spans: [],
        meta: { version: "v1", notes: "ok" },
      },
      { ttl: 1 },
    );

    await vi.advanceTimersByTimeAsync(1100);

    const result = await service.get("ttl-test", null, null);
    expect(result).toBeNull();
  });
});
