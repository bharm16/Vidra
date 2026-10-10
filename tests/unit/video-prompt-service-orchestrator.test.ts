import { beforeEach, describe, expect, it, vi } from "vitest";

import { VideoPromptService } from "@services/video-prompt-analysis/VideoPromptService";

describe("VideoPromptService orchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns original prompt when no model is detected", async () => {
    const service = new VideoPromptService();
    (
      service as unknown as {
        modelDetector: { detectTargetModel: (prompt: string) => null };
      }
    ).modelDetector = {
      detectTargetModel: vi.fn(() => null),
    };

    const result = await service.optimizeForModel("A simple prompt");

    expect(result).toEqual({
      prompt: "A simple prompt",
      metadata: {
        modelId: "unknown",
        pipelineVersion: "1.0.0",
        phases: [],
        warnings: [],
        tokensStripped: [],
        triggersInjected: [],
      },
    });
  });

  it("normalizes model aliases before strategy lookup", async () => {
    const service = new VideoPromptService();
    const getMock = vi.fn(() => undefined);
    (
      service as unknown as {
        modelDetector: { detectTargetModel: (prompt: string) => string };
      }
    ).modelDetector = {
      detectTargetModel: vi.fn(() => "kling"),
    };
    (
      service as unknown as {
        strategyRegistry: { get: (modelId: string) => unknown };
      }
    ).strategyRegistry = {
      get: getMock,
    };

    const result = await service.optimizeForModel("A model-specific prompt");

    expect(getMock).toHaveBeenCalledWith("kling-2.1");
    expect(result.metadata.modelId).toBe("kling-2.1");
  });

  it("returns original prompt with detected model when no strategy exists", async () => {
    const service = new VideoPromptService();
    (
      service as unknown as {
        modelDetector: { detectTargetModel: (prompt: string) => string };
      }
    ).modelDetector = {
      detectTargetModel: vi.fn(() => "sora-2"),
    };
    (
      service as unknown as {
        strategyRegistry: { get: (modelId: string) => undefined };
      }
    ).strategyRegistry = {
      get: vi.fn(() => undefined),
    };

    const result = await service.optimizeForModel("A model-specific prompt");

    expect(result).toEqual({
      prompt: "A model-specific prompt",
      metadata: {
        modelId: "sora-2",
        pipelineVersion: "1.0.0",
        phases: [],
        warnings: [],
        tokensStripped: [],
        triggersInjected: [],
      },
    });
  });
});
