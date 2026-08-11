import { describe, expect, it, vi } from "vitest";
import { runOptimizeFlow } from "../optimizeFlow";
import type { StructuredOptimizationArtifact } from "@services/prompt-optimization/types";

const artifact: StructuredOptimizationArtifact = {
  sourcePrompt: "baby driving a car",
  structuredPrompt: {
    _creative_strategy: "test",
    shot_framing: "close-up",
    camera_angle: "eye level",
    camera_move: "static tripod",
    camera_lens: null,
    subject: "baby",
    subject_details: ["wide eyes"],
    action: "driving a car",
    setting: "a driveway",
    time: "afternoon",
    lighting: "soft daylight",
    style: "home video realism",
    technical_specs: {},
  },
  previewPrompt: "baby driving a car",
  fallbackUsed: false,
  lintPassed: true,
};

describe("runOptimizeFlow intent lock wiring", () => {
  const baseDeps = {
    log: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    optimizationCache: {
      buildCacheKey: vi.fn(() => "cache-key"),
      buildStructuredArtifactKeyFromInputs: vi.fn(() => "artifact-key"),
      getCachedOutcome: vi.fn(async () => null),
      getStructuredArtifact: vi.fn(async () => null),
      cacheOutcome: vi.fn(async () => undefined),
      cacheStructuredArtifact: vi.fn(async () => undefined),
    },
    shotInterpreter: {
      interpret: vi.fn(async () => null),
    },
    strategy: {
      optimizeStructured: vi.fn(async () => artifact),
      renderStructuredPrompt: vi.fn(() => "generic optimized prompt"),
    },
    compilationService: {
      compile: vi.fn(async () => ({
        prompt: "final compiled prompt for target model",
        metadata: null,
        compilation: {
          status: "compiled",
          usedFallback: false,
          sourceKind: "prompt",
          structuredArtifactReused: false,
          analyzerBypassed: false,
          compiledFor: "veo-3",
        },
      })),
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
      validateIntentPreservation: vi.fn(() => ({
        passed: true,
        required: { subject: "baby", action: "driving" },
      })),
    },
    promptLint: {
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
    },
    telemetry: {
      recordStage: vi.fn(),
      recordLlmCall: vi.fn(),
      recordCacheHit: vi.fn(),
      recordError: vi.fn(),
      complete: vi.fn(),
    },
  };

  it("uses originalUserPrompt from brainstorm context when enforcing intent lock", async () => {
    vi.clearAllMocks();

    await runOptimizeFlow({
      ...baseDeps,
      request: {
        prompt: "draft prompt that drifted",
        mode: "video",
        targetModel: "veo-3",
        brainstormContext: {
          originalUserPrompt: "baby driving a car",
        },
      },
    } as never);

    expect(baseDeps.intentLock.enforceIntentLock).toHaveBeenCalledWith(
      expect.objectContaining({
        originalPrompt: "baby driving a car",
      }),
    );
  });

  it("repairs before compiling and validates after, never repairing compiled output", async () => {
    vi.clearAllMocks();

    await runOptimizeFlow({
      ...baseDeps,
      request: {
        prompt: "baby driving a car",
        mode: "video",
        targetModel: "veo-3",
      },
    } as never);

    // Pre-compile: repair allowed, on the rendered generic prompt.
    expect(baseDeps.intentLock.enforceIntentLock).toHaveBeenCalledTimes(1);
    expect(baseDeps.intentLock.enforceIntentLock).toHaveBeenCalledWith(
      expect.objectContaining({ optimizedPrompt: "generic optimized prompt" }),
    );
    // Post-compile: validate only, on the compiled prompt.
    expect(
      baseDeps.intentLock.validateIntentPreservation,
    ).toHaveBeenCalledTimes(1);
    expect(baseDeps.intentLock.validateIntentPreservation).toHaveBeenCalledWith(
      expect.objectContaining({
        optimizedPrompt: "final compiled prompt for target model",
      }),
    );
  });

  it("counts one LLM call per stage that actually calls a provider", async () => {
    vi.clearAllMocks();

    await runOptimizeFlow({
      ...baseDeps,
      request: {
        prompt: "baby driving a car",
        mode: "video",
        targetModel: "veo-3",
      },
    } as never);

    // Shot interpreter + strategy + compile. The retired domain-content stage
    // used to add a fourth without ever reaching a provider.
    expect(baseDeps.telemetry.recordLlmCall).toHaveBeenCalledTimes(3);
  });
});
