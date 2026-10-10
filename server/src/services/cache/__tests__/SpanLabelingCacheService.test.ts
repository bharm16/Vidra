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

function createRedisMock() {
  return {
    status: "ready" as const,
    get: vi.fn(async (_key: string): Promise<string | null> => null),
    set: vi.fn(
      async (
        ..._args: [string, string | number, ...(string | number)[]]
      ): Promise<unknown> => "OK",
    ),
    del: vi.fn(async (...keys: string[]): Promise<number> => keys.length),
    keys: vi.fn(async (_pattern: string): Promise<string[]> => []),
  };
}

describe("SpanLabelingCacheService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns cached result from redis when available", async () => {
    const redis = createRedisMock();
    redis.get.mockResolvedValueOnce(
      JSON.stringify({
        spans: [{ text: "shot", role: "subject" }],
        meta: { version: "v1", notes: "ok" },
      }),
    );
    const service = new SpanLabelingCacheService({ redis });

    const cached = await service.get("shot prompt", { strict: true }, "v1");

    expect(cached).toEqual({
      spans: [{ text: "shot", role: "subject" }],
      meta: { version: "v1", notes: "ok" },
    });
    expect(redis.get).toHaveBeenCalledTimes(1);
    expect(service.getStats().hits).toBe(1);
  });

  it("falls back to memory cache and tracks misses/hits", async () => {
    const service = new SpanLabelingCacheService({ redis: null });

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

  it("writes entries to redis and memory with TTL", async () => {
    const redis = createRedisMock();
    const service = new SpanLabelingCacheService({ redis, defaultTTL: 120 });

    const success = await service.set(
      "prompt",
      { policy: "strict" },
      "v1",
      { spans: [], meta: { version: "v1", notes: "ok" } },
      { ttl: 60, provider: "openai" },
    );

    expect(success).toBe(true);
    expect(redis.set).toHaveBeenCalledTimes(1);
    expect(service.getStats().sets).toBe(1);
  });

  it("invalidates specific keys and pattern keys", async () => {
    const redis = createRedisMock();
    redis.keys.mockResolvedValue(["k1", "k2"]);
    const service = new SpanLabelingCacheService({ redis });

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
    expect(redis.keys).toHaveBeenCalledTimes(1);
  });

  it("expires in-memory entries based on ttl", async () => {
    vi.useFakeTimers();
    const service = new SpanLabelingCacheService({ redis: null });

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
