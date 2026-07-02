import { beforeEach, describe, expect, it, vi } from "vitest";
import { trackModelRecommendationEvent } from "../telemetryApi";

const mocks = vi.hoisted(() => ({
  apiPost: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
}));

vi.mock("@/services/ApiClient", () => ({
  apiClient: {
    post: mocks.apiPost,
  },
}));

vi.mock("@/services/LoggingService", () => ({
  logger: {
    child: () => ({
      debug: mocks.debug,
    }),
  },
}));

vi.mock("@/config/features.config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/config/features.config")>();
  return {
    ...actual,
    FEATURES: { ...actual.FEATURES, MODEL_INTELLIGENCE_UI: true },
  };
});

describe("trackModelRecommendationEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts telemetry payload to model-intelligence track endpoint", async () => {
    mocks.apiPost.mockResolvedValue({ success: true });

    await trackModelRecommendationEvent({
      event: "generation_started",
      recommendationId: "rec-1",
      mode: "t2v",
      selectedModelId: "sora-2",
      recommendedModelId: "sora-2",
      timeSinceRecommendationMs: 700,
    });

    expect(mocks.apiPost).toHaveBeenCalledWith("/model-intelligence/track", {
      event: "generation_started",
      recommendationId: "rec-1",
      mode: "t2v",
      selectedModelId: "sora-2",
      recommendedModelId: "sora-2",
      timeSinceRecommendationMs: 700,
    });
  });

  it("swallows telemetry failures and logs debug context", async () => {
    mocks.apiPost.mockRejectedValue(new Error("network down"));

    await expect(
      trackModelRecommendationEvent({
        event: "compare_opened",
        mode: "i2v",
      }),
    ).resolves.toBeUndefined();

    expect(mocks.debug).toHaveBeenCalledWith(
      "Model intelligence telemetry failed",
      {
        event: "compare_opened",
        error: "network down",
      },
    );
  });
});
