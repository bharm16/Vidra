import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VIDEO_DRAFT_MODEL } from "@components/ToolSidebar/config/modelConfig";
import { useModelRecommendation } from "@/features/model-intelligence";
import { useModelSelectionRecommendation } from "../useModelSelectionRecommendation";

vi.mock("@/features/model-intelligence", () => ({
  useModelRecommendation: vi.fn(),
}));

const mockUseModelRecommendation = vi.mocked(useModelRecommendation);

describe("useModelSelectionRecommendation", () => {
  beforeEach(() => {
    mockUseModelRecommendation.mockReturnValue({
      recommendation: null,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it("keeps draft model selection in the resolved model id", () => {
    const { result } = renderHook(() =>
      useModelSelectionRecommendation({
        prompt: "A dramatic cinematic shot with storm clouds and lightning",
        activeTab: "video",
        keyframesCount: 0,
        durationSeconds: 5,
        selectedModel: VIDEO_DRAFT_MODEL.id,
        videoTier: "render",
      }),
    );

    expect(result.current.renderModelId).toBe(VIDEO_DRAFT_MODEL.id);
  });

  it("resolves draft model id when tier is draft and selection is empty", () => {
    const { result } = renderHook(() =>
      useModelSelectionRecommendation({
        prompt: "A cinematic wildlife tracking shot through a foggy forest",
        activeTab: "video",
        keyframesCount: 0,
        durationSeconds: 5,
        selectedModel: "",
        videoTier: "draft",
      }),
    );

    expect(result.current.renderModelId).toBe(VIDEO_DRAFT_MODEL.id);
  });

  it("normalizes recommended model ids from aliases", () => {
    mockUseModelRecommendation.mockReturnValue({
      recommendation: {
        promptId: "prompt_1",
        prompt: "Neon city at night with reflective rain",
        recommendations: [],
        recommended: {
          modelId: "veo-4",
          reasoning: "Best for this scene",
        },
        suggestComparison: false,
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() =>
      useModelSelectionRecommendation({
        prompt: "Neon city at night with reflective rain",
        activeTab: "video",
        keyframesCount: 0,
        durationSeconds: 5,
        selectedModel: "",
        videoTier: "render",
      }),
    );

    expect(result.current.recommendedModelId).toBe("google/veo-3");
  });
});
