import { describe, expect, it } from "vitest";
import { OpenAIVideoTemplateBuilder } from "@server/services/prompt-optimization/strategies/video-templates/OpenAIVideoTemplateBuilder";
import { GroqVideoTemplateBuilder } from "@server/services/prompt-optimization/strategies/video-templates/GroqVideoTemplateBuilder";
import type { VideoTemplateContext } from "@server/services/prompt-optimization/strategies/video-templates/BaseVideoTemplateBuilder";

describe("Video template generation settings", () => {
  const mockContext: VideoTemplateContext = {
    userConcept: "A cat sitting on a windowsill",
    interpretedPlan: null,
    includeInstructions: true,
  };
  const generationParams = {
    aspect_ratio: "16:9",
    resolution: "1080p",
    duration_s: 5,
    fps: 24,
    audio: true,
  };
  it("should include generationParams in developerMessage", () => {
    const builder = new OpenAIVideoTemplateBuilder();
    const result = builder.buildTemplate({
      ...mockContext,
      generationParams,
    });

    expect(result.developerMessage).toBeDefined();
    expect(result.developerMessage).toContain("USER OVERRIDES");
    expect(result.developerMessage).toContain("- Aspect Ratio: 16:9");
    expect(result.developerMessage).toContain("- Resolution: 1080p");
    expect(result.developerMessage).toContain("- Duration: 5s");
    expect(result.developerMessage).toContain("- Frame Rate: 24fps");
    expect(result.developerMessage).toContain("- Audio: Enabled");
  });
  it("should handle boolean audio param correctly", () => {
    const builder = new OpenAIVideoTemplateBuilder();
    const result = builder.buildTemplate({
      ...mockContext,
      generationParams: { ...generationParams, audio: false },
    });

    expect(result.developerMessage).toContain("- Audio: Muted");
  });
  it("should include generationParams in systemPrompt", () => {
    const builder = new GroqVideoTemplateBuilder();
    const result = builder.buildTemplate({
      ...mockContext,
      generationParams,
    });

    expect(result.systemPrompt).toContain("USER OVERRIDES");
    expect(result.systemPrompt).toContain("- Aspect Ratio: 16:9");
    expect(result.systemPrompt).toContain("- Resolution: 1080p");
    expect(result.systemPrompt).toContain("- Duration: 5s");
    expect(result.systemPrompt).toContain("- Frame Rate: 24fps");
    expect(result.systemPrompt).toContain("- Audio: Enabled");
  });
});
