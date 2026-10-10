import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "promptBuilder.spanLabelingCache.v2";

interface CacheModule {
  spanLabelingCache: {
    clear: () => void;
    get: (payload: Record<string, unknown>) => unknown;
    set: (
      payload: Record<string, unknown>,
      data: {
        spans: unknown[];
        meta: Record<string, unknown> | null;
        signature?: string;
      },
    ) => void;
    hydrate: () => void;
    getSnapshot: () => Array<{ key: string; textPreview: string }>;
  };
}

async function loadCacheModule(): Promise<CacheModule> {
  vi.resetModules();
  return import("../SpanLabelingCache") as unknown as Promise<CacheModule>;
}

describe("SpanLabelingCache service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    localStorage.clear();
    delete (globalThis as { requestIdleCallback?: unknown })
      .requestIdleCallback;
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it("validates version at initialization and resets stale cache", async () => {
    localStorage.setItem("span_cache_version", "stale-version");
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([["x", { text: "stale" }]]),
    );

    await loadCacheModule();

    expect(localStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
    expect(localStorage.setItem).toHaveBeenCalledWith(
      "span_cache_version",
      expect.any(String),
    );
  });

  it("hydrates asynchronously from storage and loads valid entries only", async () => {
    const { spanLabelingCache } = await loadCacheModule();

    const payload = {
      text: "Hydrate me from storage",
      cacheId: "hydrate-1",
      maxSpans: 10,
    };

    spanLabelingCache.set(payload, {
      spans: [{ start: 0, end: 7, category: "subject", confidence: 0.8 }],
      meta: { source: "seed" },
      signature: "sig-hydrate",
    });

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();

    spanLabelingCache.clear();
    localStorage.setItem(STORAGE_KEY, raw as string);

    expect(spanLabelingCache.get(payload)).toBeNull();

    spanLabelingCache.hydrate();
    await vi.advanceTimersByTimeAsync(100);

    const hydrated = spanLabelingCache.get(payload) as {
      signature: string;
    } | null;
    expect(hydrated).not.toBeNull();
    expect(hydrated?.signature).toBe("sig-hydrate");
  });

  it("invalidates cache entries older than max age", async () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);

    const { spanLabelingCache } = await loadCacheModule();

    const payload = {
      text: "expiring entry",
      cacheId: "exp-1",
      maxSpans: 5,
    };

    spanLabelingCache.set(payload, {
      spans: [{ start: 0, end: 7, category: "subject", confidence: 0.8 }],
      meta: null,
    });

    vi.spyOn(Date, "now").mockReturnValue(now + 25 * 60 * 60 * 1000);

    const expired = spanLabelingCache.get(payload);
    expect(expired).toBeNull();
  });

  it("applies LRU eviction when cache exceeds configured limit", async () => {
    const { spanLabelingCache } = await loadCacheModule();

    for (let i = 0; i < 55; i += 1) {
      spanLabelingCache.set(
        {
          text: `entry-${i}`,
          cacheId: `cache-${i}`,
          maxSpans: 5,
        },
        {
          spans: [{ start: 0, end: 3, category: "subject", confidence: 0.7 }],
          meta: null,
        },
      );
    }

    const snapshot = spanLabelingCache.getSnapshot();

    expect(snapshot.length).toBeLessThanOrEqual(50);
    expect(
      snapshot.some((entry) => entry.textPreview.includes("entry-54")),
    ).toBe(true);
    expect(
      snapshot.some((entry) => entry.textPreview.includes("entry-0")),
    ).toBe(false);
  });
});
