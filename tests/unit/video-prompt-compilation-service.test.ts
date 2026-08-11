import { describe, expect, it, vi } from "vitest";
import { VideoPromptCompilationService } from "@services/prompt-optimization/services/VideoPromptCompilationService";
import type { VideoPromptService } from "@services/video-prompt-analysis/VideoPromptService";

describe("VideoPromptCompilationService", () => {
  it("keeps generic output when no target model is provided", async () => {
    const videoPromptService = {
      optimizeForModel: vi.fn(),
    } as unknown as VideoPromptService;
    const service = new VideoPromptCompilationService(videoPromptService);

    const result = await service.compile({
      operation: "optimize",
      source: { kind: "prompt", prompt: "generic optimized prompt" },
      fallbackPrompt: "generic optimized prompt",
    });

    expect(result.prompt).toBe("generic optimized prompt");
    expect(result.compilation).toMatchObject({
      status: "compile-skipped",
      compiledFor: null,
      sourceKind: "prompt",
    });
    expect(result.metadata).toBeNull();
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

    const result = await service.compile({
      operation: "optimize",
      source: { kind: "prompt", prompt: "generic optimized prompt" },
      fallbackPrompt: "generic optimized prompt",
      targetModel: "kling",
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
    expect(result.compilation).toMatchObject({
      status: "compiled",
      sourceKind: "prompt",
      compiledFor: "kling-2.1",
    });
    // Provider phase details are all that metadata carries now; every other
    // fact is a typed field.
    expect(Object.keys(result.metadata ?? {})).toEqual(["compilationMeta"]);
  });

  it("keeps successful terse compilations instead of falling back to the generic prompt", async () => {
    const videoPromptService = {
      optimizeForModel: vi.fn().mockResolvedValue({
        prompt: "Tabby cat walks along a sandy beach at golden hour.",
        metadata: { phases: [{ changes: ["trimmed for wan"] }] },
      }),
    } as unknown as VideoPromptService;
    const service = new VideoPromptCompilationService(videoPromptService);

    const genericPrompt =
      "A much longer generic optimized prompt with many details and camera controls.";
    const result = await service.compile({
      operation: "optimize",
      source: { kind: "prompt", prompt: genericPrompt },
      fallbackPrompt: genericPrompt,
      targetModel: "wan",
    });

    expect(result.prompt).toBe(
      "Tabby cat walks along a sandy beach at golden hour.",
    );
    expect(result.compilation.compiledFor).toBe("wan-2.2");
    expect(result.compilation.status).toBe("compiled");
  });
});
