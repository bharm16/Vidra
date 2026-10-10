import { describe, expect, it, vi } from "vitest";

import {
  createFallbackResult,
  shouldHandleError,
} from "@features/span-highlighting/utils/spanLabelingErrorHandler";
import type { SpanLabelingCacheService } from "@features/span-highlighting/hooks/useSpanLabelingCache";
import type { SpanLabelingPayload } from "@features/span-highlighting/hooks/types";

vi.mock("@/services/LoggingService", () => ({
  logger: {
    child: () => ({ warn: vi.fn() }),
  },
}));

describe("spanLabelingErrorHandler", () => {
  it("checks whether an error should be handled", () => {
    expect(
      shouldHandleError({
        requestId: 1,
        requestVersion: 1,
        currentRequestId: 1,
        currentRequestVersion: 1,
        controllerAborted: false,
      }),
    ).toBe(true);

    expect(
      shouldHandleError({
        requestId: 1,
        requestVersion: 1,
        currentRequestId: 2,
        currentRequestVersion: 1,
        controllerAborted: false,
      }),
    ).toBe(false);
  });

  it("builds fallback result from cache", () => {
    const cacheService: SpanLabelingCacheService = {
      get: () => ({
        spans: [{ start: 0, end: 1, category: "style", confidence: 0.9 }],
        meta: { source: "cache" },
        cacheId: "cache-id",
        signature: "sig",
        text: "hello",
        timestamp: Date.now(),
      }),
      set: vi.fn(),
    };

    const payload: SpanLabelingPayload = { text: "hello" };
    const result = createFallbackResult(
      payload,
      new Error("Network"),
      cacheService,
    );

    expect(result?.meta?.source).toBe("cache-fallback");
    expect(result?.cacheId).toBe("cache-id");
  });
});
