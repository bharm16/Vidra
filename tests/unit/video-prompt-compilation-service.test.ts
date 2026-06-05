import { describe, expect, it, vi } from "vitest";
import { VideoPromptCompilationService } from "@services/prompt-optimization/services/VideoPromptCompilationService";
import type { VideoPromptService } from "@services/video-prompt-analysis/VideoPromptService";

describe("VideoPromptCompilationService", () => {
  it("keeps generic output when no target model is provided", async () => {
    const videoPromptService = {
      optimizeForModel: vi.fn(),
    } as unknown as VideoPromptService;
    const service = new VideoPromptCompilationService(videoPromptService);

    const result = await service.compileOptimizedPrompt({
      operation: "optimize",
      optimizedPrompt: "generic optimized prompt",
      mode: "video",
    });

    expect(result.prompt).toBe("generic optimized prompt");
    expect(result.compilation).toMatchObject({
      status: "compile-skipped",
      compiledFor: null,
      sourceKind: "prompt",
    });
    expect(result.metadata).toMatchObject({
      compilation: expect.objectContaining({
        status: "compile-skipped",
      }),
    });
    expect(videoPromptService.optimizeForModel).not.toHaveBeenCalled();
  });

  it("compiles when an explicit target model is provided", async () => {
    const videoPromptService = {
      optimizeForModel: vi.fn().mockResolvedValue({
        prompt: "kling-compiled prompt",
        metadata: {
          phases: [
            { phase: "transform", durationMs: 2, changes: ["rewritten"] },
          ],
          warnings: [],
          tokensStripped: [],
          triggersInjected: [],
        },
      }),
    } as unknown as VideoPromptService;
    const service = new VideoPromptCompilationService(videoPromptService);

    const result = await service.compileOptimizedPrompt({
      operation: "optimize",
      optimizedPrompt: "generic optimized prompt",
      targetModel: "kling",
      mode: "video",
    });

    expect(videoPromptService.optimizeForModel).toHaveBeenCalledWith(
      "generic optimized prompt",
      "kling-2.1",
      {
        userIntent: "generic optimized prompt",
        sourcePrompt: "generic optimized prompt",
      },
    );
    expect(result.prompt).toBe("kling-compiled prompt");
    expect(result.metadata).toMatchObject({
      compiledFor: "kling-2.1",
      normalizedModelId: "kling-2.1",
      genericPrompt: "generic optimized prompt",
      compilation: expect.objectContaining({
        status: "compiled",
        sourceKind: "prompt",
      }),
    });
    expect(result.metadata).not.toHaveProperty("compilationQuality");
    expect(result.metadata).not.toHaveProperty("compilationWarning");
  });

  it("keeps successful terse compilations instead of falling back to the generic prompt", async () => {
    const videoPromptService = {
      optimizeForModel: vi.fn().mockResolvedValue({
        prompt: "Tabby cat walks along a sandy beach at golden hour.",
        metadata: { phases: [{ changes: ["trimmed for wan"] }] },
      }),
    } as unknown as VideoPromptService;
    const service = new VideoPromptCompilationService(videoPromptService);

    const result = await service.compileOptimizedPrompt({
      operation: "optimize",
      optimizedPrompt:
        "A much longer generic optimized prompt with many details and camera controls.",
      targetModel: "wan",
      mode: "video",
    });

    expect(result.prompt).toBe(
      "Tabby cat walks along a sandy beach at golden hour.",
    );
    expect(result.metadata?.compiledFor).toBe("wan-2.2");
    expect(result.compilation.status).toBe("compiled");
  });
});
