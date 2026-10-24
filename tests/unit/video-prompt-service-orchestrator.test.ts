import { StrategyRegistry } from "@services/video-prompt-analysis/strategies/StrategyRegistry";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { VideoPromptService } from "@services/video-prompt-analysis/VideoPromptService";

describe("VideoPromptService orchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns original prompt when no model is detected", async () => {
    const service = new VideoPromptService({ strategyRegistry: new StrategyRegistry() });

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
    const service = new VideoPromptService({ strategyRegistry: new StrategyRegistry() });

    const result = await service.optimizeForModel("A cinematic shot for Kling 2.1");

    expect(result.metadata.modelId).toBe("kling-2.1");
  });

  it("returns original prompt with detected model when no strategy exists", async () => {
    const service = new VideoPromptService({ strategyRegistry: new StrategyRegistry() });

    const result = await service.optimizeForModel("A cinematic shot for Sora 2");

    expect(result).toEqual({
      prompt: "A cinematic shot for Sora 2",
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
