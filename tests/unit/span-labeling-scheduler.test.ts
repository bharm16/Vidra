import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  calculateEffectiveDebounce,
  checkCache,
} from "@features/span-highlighting/utils/spanLabelingScheduler";
import { spanLabelingCache } from "@features/span-highlighting/services/index.ts";
import { calculateSmartDebounce } from "@features/span-highlighting/config/index.ts";
import type { SpanLabelingPayload } from "@features/span-highlighting/hooks/types";

vi.mock("@features/span-highlighting/services/index.ts", () => ({
  spanLabelingCache: {
    get: vi.fn(),
  },
}));

vi.mock("@features/span-highlighting/config/index.ts", () => ({
  calculateSmartDebounce: vi.fn(),
}));

const mockCache = vi.mocked(spanLabelingCache);
const mockCalculateSmartDebounce = vi.mocked(calculateSmartDebounce);

const payload: SpanLabelingPayload = { text: "hello", maxSpans: 5 };

describe("spanLabelingScheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns cached result when available", () => {
    const performanceSpy = vi.spyOn(performance, "now");
    performanceSpy.mockReturnValueOnce(10).mockReturnValueOnce(20);

    mockCache.get.mockReturnValue({
      spans: [],
      meta: null,
      version: "test",
      cacheId: "cache",
      signature: "sig",
      text: "hello",
      timestamp: Date.now(),
    });

    const result = checkCache(payload);

    expect(result.cached).toEqual({
      spans: [],
      meta: null,
      cacheId: "cache",
      signature: "sig",
    });
    expect(result.cacheCheckDuration).toBe(10);
  });

  it("returns zero debounce when immediate", () => {
    expect(
      calculateEffectiveDebounce(payload, {
        enabled: true,
        debounceMs: 500,
        useSmartDebounce: false,
        immediate: true,
      }),
    ).toBe(0);
  });
});
