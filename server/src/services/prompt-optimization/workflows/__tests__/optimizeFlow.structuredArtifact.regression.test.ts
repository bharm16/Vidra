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

const passingIntentLock = () => ({
  enforceIntentLock: vi.fn(({ optimizedPrompt }) => ({
    prompt: optimizedPrompt,
    passed: true,
    repaired: false,
    required: { subject: "baby", action: "driving" },
  })),
  validateIntentPreservation: vi.fn(() => ({
    passed: true,
    required: { subject: "baby", action: "driving" },
  })),
});

const passingLint = () => ({
  sanitize: vi.fn(({ prompt }) => ({
    prompt,
    lint: {
      ok: true,
      errors: [],
      warnings: [],
      wordCount: prompt.split(/\s+/).length,
    },
    repaired: false,
  })),
});

const silentLog = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
});

const noopTelemetry = () =>
  ({
    recordStage: vi.fn(),
    recordLlmCall: vi.fn(),
    recordCacheHit: vi.fn(),
    recordError: vi.fn(),
    complete: vi.fn(),
  }) as never;

describe("regression: targeted optimize reuses structured artifacts", () => {
  it("compiles from the artifact and returns preview/generic prompts as typed fields", async () => {
    const structuredArtifact = createArtifact();
    const optimizeStructured = vi.fn(async () => structuredArtifact);
    const renderStructuredPrompt = vi.fn(() => "generic rendered prompt");
    const compile = vi.fn(async () => ({
      prompt: "wan-specific compiled prompt",
      metadata: { compilationMeta: { phases: [] } },
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
      },
      log: silentLog(),
      optimizationCache: {
        buildCacheKey: vi.fn(() => "cache-key"),
        buildStructuredArtifactKeyFromInputs: vi.fn(
          () => "structured-cache-key",
        ),
        getCachedOutcome: vi.fn(async () => null),
        getStructuredArtifact: vi.fn(async () => null),
        cacheOutcome: vi.fn(async () => undefined),
        cacheStructuredArtifact,
      },
      shotInterpreter: {
        interpret: vi.fn(async () => null),
      },
      strategy: {
        optimizeStructured,
        renderStructuredPrompt,
      },
      compilationService: {
        compile,
      },
      applyConstitutionalAI: vi.fn(async (prompt: string) => prompt),
      logOptimizationMetrics: vi.fn(),
      intentLock: passingIntentLock(),
      promptLint: passingLint(),
      telemetry: noopTelemetry(),
    });

    expect(optimizeStructured).toHaveBeenCalledTimes(1);
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
        targetModel: "wan-2.2",
        source: { kind: "artifact", artifact: structuredArtifact },
        artifactKey: "structured-cache-key",
      }),
    );
    expect(result.prompt).toBe("wan-specific compiled prompt");
    expect(result.artifactKey).toBe("structured-cache-key");
    expect(result.previewPrompt).toBe("baby driving a toy car");
    expect(result.aspectRatio).toBe("16:9");
    expect(result.genericPrompt).toBe("generic rendered prompt");
    expect(result.compilation).toMatchObject({
      status: "compiled",
      sourceKind: "artifact",
      compiledFor: "wan-2.2",
    });
    expect(result.quality.intentLock.passed).toBe(true);
    expect(result.quality.lint.ok).toBe(true);
  });

  it("returns the same shape from a cache hit as from a miss", async () => {
    const structuredArtifact = createArtifact();
    const cacheOutcome = vi.fn(async (_key: string, _outcome: unknown) => undefined);
    const deps = {
      request: {
        prompt: "baby driving a car",
        mode: "video" as const,
      },
      log: silentLog(),
      shotInterpreter: { interpret: vi.fn(async () => null) },
      strategy: {
        optimizeStructured: vi.fn(async () => structuredArtifact),
        renderStructuredPrompt: vi.fn(() => "generic rendered prompt"),
      },
      compilationService: null,
      applyConstitutionalAI: vi.fn(async (prompt: string) => prompt),
      logOptimizationMetrics: vi.fn(),
      intentLock: passingIntentLock(),
      promptLint: passingLint(),
      telemetry: noopTelemetry(),
    };

    const miss = await runOptimizeFlow({
      ...deps,
      optimizationCache: {
        buildCacheKey: vi.fn(() => "cache-key"),
        buildStructuredArtifactKeyFromInputs: vi.fn(() => "artifact-key"),
        getCachedOutcome: vi.fn(async () => null),
        getStructuredArtifact: vi.fn(async () => null),
        cacheOutcome,
        cacheStructuredArtifact: vi.fn(async () => undefined),
      },
    });

    // Whatever the miss path wrote is what the hit path replays — the two used
    // to be assembled independently, so a partial write produced a hit with a
    // prompt and no preview.
    const written = cacheOutcome.mock.calls[0]?.[1];
    expect(written).toEqual(miss);

    const hit = await runOptimizeFlow({
      ...deps,
      optimizationCache: {
        buildCacheKey: vi.fn(() => "cache-key"),
        buildStructuredArtifactKeyFromInputs: vi.fn(() => "artifact-key"),
        getCachedOutcome: vi.fn(async () => miss),
        getStructuredArtifact: vi.fn(async () => null),
        cacheOutcome: vi.fn(async () => undefined),
        cacheStructuredArtifact: vi.fn(async () => undefined),
      },
    });

    expect(hit).toEqual(miss);
    expect(Object.keys(hit).sort()).toEqual(Object.keys(miss).sort());
  });
});
