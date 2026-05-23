import { describe, expect, it, vi } from "vitest";
import { runOptimizeFlow } from "../optimizeFlow";
import type { StructuredOptimizationArtifact } from "@services/prompt-optimization/types";

function createArtifact(): StructuredOptimizationArtifact {
  return {
    sourcePrompt: "baby driving a toy car in the driveway",
    structuredPrompt: {
      _creative_strategy: "regression test",
      shot_framing: "close-up",
      camera_angle: "eye level",
      camera_move: "static tripod",
      camera_lens: null,
      subject: "baby",
      subject_details: ["wide eyes"],
      action: "driving a toy car",
      setting: "suburban driveway",
      time: "afternoon",
      lighting: "soft daylight",
      style: "home video realism",
      technical_specs: {
        aspect_ratio: "16:9",
      },
    },
    previewPrompt: "baby driving a toy car",
    aspectRatio: "16:9",
    fallbackUsed: false,
    lintPassed: true,
  };
}

describe("regression: targeted optimize reuses structured artifacts", () => {
  it("skips generic prose rendering while preserving preview metadata for target-model runs", async () => {
    const onMetadata = vi.fn();
    const structuredArtifact = createArtifact();
    const optimize = vi.fn(async () => "generic prose should not run");
    const optimizeStructured = vi.fn(async () => structuredArtifact);
    const renderStructuredPrompt = vi.fn(() => "generic render should not run");
    const compile = vi.fn(async () => ({
      prompt: "wan-specific compiled prompt",
      metadata: { compiledFor: "wan-2.2", structuredArtifactReused: true },
      compilation: {
        status: "compiled" as const,
        usedFallback: false,
        sourceKind: "artifact" as const,
        structuredArtifactReused: true,
        analyzerBypassed: true,
        compiledFor: "wan-2.2",
      },
      artifactKey: "structured-cache-key",
    }));
    const cacheStructuredArtifact = vi.fn(async () => undefined);

    const result = await runOptimizeFlow({
      request: {
        prompt: "baby driving a car",
        mode: "video",
        targetModel: "wan-2.2",
        brainstormContext: {
          originalUserPrompt: "baby driving a car",
        },
        onMetadata,
      },
      log: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn(),
      },
      optimizationCache: {
        buildCacheKey: vi.fn(() => "cache-key"),
        buildStructuredArtifactKeyFromInputs: vi.fn(
          () => "structured-cache-key",
        ),
        getCachedResult: vi.fn(async () => null),
        getCachedMetadata: vi.fn(async () => null),
        getStructuredArtifact: vi.fn(async () => null),
        cacheResult: vi.fn(async () => undefined),
        cacheStructuredArtifact,
      },
      shotInterpreter: {
        interpret: vi.fn(async () => null),
      },
      strategy: {
        optimize,
        optimizeStructured,
        renderStructuredPrompt,
        generateDomainContent: vi.fn(async () => null),
      },
      compilationService: {
        compile,
      },
      applyConstitutionalAI: vi.fn(async (prompt: string) => prompt),
      logOptimizationMetrics: vi.fn(),
      intentLock: {
        enforceIntentLock: vi.fn(({ optimizedPrompt }) => ({
          prompt: optimizedPrompt,
          passed: true,
          repaired: false,
          required: { subject: "baby", action: "driving" },
        })),
      },
      promptLint: {
        enforce: vi.fn(({ prompt }) => ({
          prompt,
          lint: {
            ok: true,
            errors: [],
            warnings: [],
            wordCount: prompt.split(/\s+/).length,
          },
          repaired: false,
        })),
      },
      telemetry: {
        recordStage: vi.fn(),
        recordLlmCall: vi.fn(),
        recordCacheHit: vi.fn(),
        recordError: vi.fn(),
        complete: vi.fn(),
      } as never,
    });

    expect(optimizeStructured).toHaveBeenCalledTimes(1);
    expect(optimize).not.toHaveBeenCalled();
    // renderStructuredPrompt IS called to produce the generic prompt before
    // intent lock enforcement, which runs prior to model-specific compilation.
    expect(renderStructuredPrompt).toHaveBeenCalledTimes(1);
    expect(cacheStructuredArtifact).toHaveBeenCalledWith(
      "structured-cache-key",
      structuredArtifact,
    );
    expect(compile).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "optimize",
        mode: "video",
        targetModel: "wan-2.2",
        source: { kind: "artifact", artifact: structuredArtifact },
        artifactKey: "structured-cache-key",
      }),
    );
    expect(result.prompt).toBe("wan-specific compiled prompt");
    expect(result.artifactKey).toBe("structured-cache-key");
    expect(result.compilation).toMatchObject({
      status: "compiled",
      sourceKind: "artifact",
    });
    expect(result.metadata).toMatchObject({
      previewPrompt: "baby driving a toy car",
      aspectRatio: "16:9",
      artifactKey: "structured-cache-key",
      compiledFor: "wan-2.2",
      structuredArtifactReused: true,
    });
    expect(onMetadata).toHaveBeenCalledWith({ normalizedModelId: "wan-2.2" });
    expect(onMetadata).toHaveBeenCalledWith({
      previewPrompt: "baby driving a toy car",
      aspectRatio: "16:9",
      artifactKey: "structured-cache-key",
    });
  });
});
