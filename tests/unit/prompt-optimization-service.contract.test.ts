import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AIService } from "@services/prompt-optimization/types";
import { PromptOptimizationService } from "@services/prompt-optimization/PromptOptimizationService";

const createService = (): PromptOptimizationService => {
  const aiService: AIService = {
    execute: vi.fn(async () => ({
      text: "",
      content: [{ text: "" }],
      metadata: {
        model: "mock",
        provider: "mock",
        finishReason: "stop",
        usage: null,
      },
      executedBy: {
        client: "mock",
        provider: "unknown" as const,
        model: "mock",
        viaFallback: false,
      },
    })),
    resolveExecution: vi.fn(() => ({
      client: "mock",
      provider: "unknown" as const,
      model: "mock",
      viaFallback: false,
    })),
    getAvailableClients: vi.fn(() => ["mock"]),
  };

  const cacheService = {
    getConfig: vi.fn(() => ({ ttl: 60, namespace: "test" })),
    get: vi.fn(async () => null),
    set: vi.fn(async () => true),
    generateKey: vi.fn(() => "cache-key"),
  } as never;

  const imageObservationService = {
    observeImage: vi.fn(async () => ({ description: "", tags: [] })),
  } as never;

  return new PromptOptimizationService(
    aiService,
    cacheService,
    null,
    imageObservationService,
  );
};

describe("PromptOptimizationService contract", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the cached optimize response whole", async () => {
    const service = createService();
    const cached = {
      prompt: "cached optimized prompt",
      previewPrompt: "cached preview",
      genericPrompt: "cached optimized prompt",
      artifactKey: "cached-artifact",
      quality: {
        intentLock: {
          passed: true,
          repaired: false,
          skippedRepair: false,
          required: { subject: "baby", action: "driving" },
        },
        lint: {
          ok: true,
          errors: [],
          warnings: [],
          wordCount: 3,
          repaired: false,
        },
      },
    };

    (service as unknown as { optimizationCache: unknown }).optimizationCache = {
      buildCacheKey: vi.fn(() => "cache-key"),
      getCachedOutcome: vi.fn(async () => cached),
      cacheOutcome: vi.fn(async () => {}),
    };

    const result = await service.optimize({ prompt: "optimize this" });

    // One record in, the same record out — the hit path cannot assemble a
    // different shape than the miss path wrote.
    expect(result).toEqual(cached);
  });

  it("ignores startImage on optimize and runs the T2V flow with a warning", async () => {
    const service = createService();

    (service as unknown as { optimizationCache: unknown }).optimizationCache = {
      buildCacheKey: vi.fn(() => "cache-key"),
      getCachedOutcome: vi.fn(async () => ({
        prompt: "cached optimized prompt",
        quality: {
          intentLock: {
            passed: true,
            repaired: false,
            skippedRepair: false,
            required: { subject: null, action: null },
          },
          lint: {
            ok: true,
            errors: [],
            warnings: [],
            wordCount: 3,
            repaired: false,
          },
        },
      })),
      cacheOutcome: vi.fn(async () => {}),
    };

    const result = await service.optimize({
      prompt: "make this move",
      startImage: "https://images.example.com/start.webp",
    });

    // After the I2V pipeline removal, startImage is logged-and-ignored;
    // the request runs through the standard T2V optimize flow.
    expect(result.prompt).toBe("cached optimized prompt");
    expect(result).not.toHaveProperty("inputMode");
    expect(result).not.toHaveProperty("i2v");
  });

  it("throws when compilePrompt is called without a compilation service", async () => {
    const service = createService();
    (service as unknown as { compilationService: unknown }).compilationService =
      null;

    await expect(
      service.compilePrompt({
        prompt: "generic prompt",
        targetModel: "kling",
      }),
    ).rejects.toThrow("Video prompt service unavailable");
  });

  it("delegates compilePrompt when compilation service is available", async () => {
    const service = createService();
    const compile = vi.fn(async () => ({
      prompt: "compiled prompt",
      metadata: {
        compiledFor: "kling-2.1",
        compilation: {
          status: "compiled",
          usedFallback: false,
          sourceKind: "prompt",
          structuredArtifactReused: false,
          analyzerBypassed: false,
          compiledFor: "kling-2.1",
        },
      },
      compilation: {
        status: "compiled",
        usedFallback: false,
        sourceKind: "prompt",
        structuredArtifactReused: false,
        analyzerBypassed: false,
        compiledFor: "kling-2.1",
      },
    }));
    (service as unknown as { compilationService: unknown }).compilationService =
      {
        compile,
      };

    const result = await service.compilePrompt({
      prompt: "generic prompt",
      targetModel: "kling",
    });

    expect(compile).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "compilePrompt",
        targetModel: "kling",
        source: { kind: "prompt", prompt: "generic prompt" },
      }),
    );
    expect(result).toMatchObject({
      metadata: { compiledFor: "kling-2.1" },
      targetModel: "kling-2.1",
    });
  });
});
