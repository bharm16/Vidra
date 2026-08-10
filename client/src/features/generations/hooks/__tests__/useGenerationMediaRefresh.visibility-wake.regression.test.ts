import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Generation } from "@features/generations/types";
import { useGenerationMediaRefresh } from "@features/generations/hooks/useGenerationMediaRefresh";
import { resolveMediaUrl } from "@/services/media/MediaUrlResolver";

vi.mock("@/services/media/MediaUrlResolver", () => ({
  resolveMediaUrl: vi.fn(),
  isMediaCircuitOpen: vi.fn().mockReturnValue(false),
}));

const mockResolveMediaUrl = vi.mocked(resolveMediaUrl);

const buildGeneration = (id: string): Generation => ({
  id,
  tier: "draft",
  status: "completed",
  model: "flux",
  prompt: "test prompt",
  promptVersionId: "version-1",
  createdAt: Date.now(),
  completedAt: Date.now(),
  mediaType: "image",
  mediaUrls: [`/api/preview/image/view?assetId=${id}`],
  mediaAssetIds: [id],
  thumbnailUrl: null,
});

/**
 * Simulate a page visibility change event (laptop sleep → wake).
 * Uses Object.defineProperty because jsdom doesn't support setting
 * document.visibilityState directly.
 */
const simulateVisibilityChange = (state: "visible" | "hidden"): void => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
};

describe("regression: gallery thumbnails re-resolve media URLs after laptop sleep", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    // Start with page visible
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("re-resolves already-processed generations when page becomes visible after extended sleep", async () => {
    const freshSignedUrl = "https://storage.example.com/fresh-signed-url";
    mockResolveMediaUrl.mockResolvedValue({
      url: freshSignedUrl,
      source: "preview",
    });

    const dispatch = vi.fn();
    const generations = [
      buildGeneration("asset-a"),
      buildGeneration("asset-b"),
    ];

    renderHook(() => useGenerationMediaRefresh(generations, dispatch));

    // Let the initial effect settle — all generations get processed
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const initialResolveCallCount = mockResolveMediaUrl.mock.calls.length;
    expect(initialResolveCallCount).toBeGreaterThan(0);

    // Clear mocks to track only new calls after wake
    mockResolveMediaUrl.mockClear();
    dispatch.mockClear();

    mockResolveMediaUrl.mockResolvedValue({
      url: "https://storage.example.com/re-resolved-after-wake",
      source: "preview",
    });

    // Simulate laptop sleep (page hidden) then wake (page visible) after >60s
    act(() => {
      simulateVisibilityChange("hidden");
    });
    await act(async () => {
      // Advance time to simulate extended sleep (2 minutes)
      await vi.advanceTimersByTimeAsync(120_000);
    });
    await act(async () => {
      simulateVisibilityChange("visible");
    });

    // Let the visibility-triggered refresh settle
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // The hook must re-resolve media URLs for all previously-processed generations.
    // Before the fix, processedRef still holds signatures for all generations so
    // they are skipped — no new calls are made and thumbnails remain broken.
    expect(mockResolveMediaUrl.mock.calls.length).toBeGreaterThan(0);
  });
});
