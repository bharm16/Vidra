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
  mediaAssetIds: [`om1.preview-image.${id}.webp`],
  thumbnailUrl: null,
});

describe("regression: generation refresh uses opaque references", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not infer storage paths or choose a refresh endpoint from a prefix", async () => {
    mockResolveMediaUrl.mockResolvedValue({
      url: "https://storage.example.com/resolved.webp",
      source: "preview",
    });

    const dispatch = vi.fn();
    const generations = [
      buildGeneration("asset-a"),
      buildGeneration("asset-b"),
    ];

    renderHook(() => useGenerationMediaRefresh(generations, dispatch));

    // Let the effect and async work settle
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockResolveMediaUrl).toHaveBeenCalledTimes(2);
    expect(mockResolveMediaUrl).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        mediaRef: "om1.preview-image.asset-a.webp",
        preferFresh: false,
      }),
    );
    expect(mockResolveMediaUrl).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        mediaRef: "om1.preview-image.asset-b.webp",
        preferFresh: false,
      }),
    );
  });
});
