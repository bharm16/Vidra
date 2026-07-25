import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AIExecutionPort as AIService } from "@services/ai-model/ports/AIExecutionPort";
import type { CacheService } from "@services/cache/CacheService";
import {
  SceneChangeDetectionService,
  type SceneChangeResult,
} from "../SceneChangeDetectionService";

/**
 * Runs the REAL StructuredOutputEnforcer and the real temperature policy;
 * only the aiService port instance is scripted. Scripted responses are raw
 * LLM text validated against the real scene-change schema — a schema drift
 * fails here instead of being masked by a mocked enforcer.
 */

vi.mock("@infrastructure/Logger", () => {
  const base = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  base.child.mockReturnValue(base);
  return { logger: base };
});

const createService = (
  responses: string[] = [],
): {
  service: SceneChangeDetectionService;
  execute: ReturnType<typeof vi.fn>;
  cacheService: CacheService;
} => {
  const execute = vi.fn(async () => {
    const index = Math.min(execute.mock.calls.length - 1, responses.length - 1);
    return {
      text: responses[index] ?? "{}",
      metadata: { model: "llama-3.1-8b-instant", provider: "groq" },
    };
  });

  const aiService = {
    execute,
    getOperationConfig: vi.fn(() => ({
      temperature: 0.3,
      client: "groq",
    })),
  } as unknown as AIService;

  const cacheService = {
    getConfig: vi.fn(() => ({ ttl: 300, namespace: "scene-detection" })),
    generateKey: vi.fn(() => "test-cache-key"),
    get: vi.fn(() => null),
    set: vi.fn(),
  } as unknown as CacheService;

  return {
    service: new SceneChangeDetectionService(aiService, cacheService),
    execute,
    cacheService,
  };
};

describe("SceneChangeDetectionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns cached result on cache hit without any model call", async () => {
    const { service, execute, cacheService } = createService();
    const cachedResult: SceneChangeResult = {
      isSceneChange: true,
      confidence: "high",
      reasoning: "Completely different environment",
      suggestedUpdates: { lighting: "underwater caustics" },
    };
    vi.mocked(cacheService.get).mockResolvedValue(cachedResult);

    const result = await service.detectSceneChange({
      changedField: "location",
      newValue: "underwater cave",
      oldValue: "coffee shop",
      fullPrompt: "A barista making coffee",
      affectedFields: ["lighting", "mood"],
    });

    expect(result).toEqual(cachedResult);
    expect(execute).not.toHaveBeenCalled();
  });

  it("detects scene change via LLM and caches result", async () => {
    const llmResult: SceneChangeResult = {
      isSceneChange: true,
      confidence: "high",
      reasoning: "Indoor to outdoor transition",
      suggestedUpdates: { lighting: "natural sunlight", mood: "open and free" },
    };
    const { service, cacheService } = createService([
      JSON.stringify(llmResult),
    ]);

    const result = await service.detectSceneChange({
      changedField: "location",
      newValue: "mountain summit",
      oldValue: "office cubicle",
      fullPrompt: "A worker at their desk",
      affectedFields: ["lighting", "mood"],
    });

    expect(result).toEqual(llmResult);
    expect(cacheService.set).toHaveBeenCalledWith(
      "test-cache-key",
      llmResult,
      expect.objectContaining({ ttl: 300 }),
    );
  });

  it("sends the scene-change operation and the changed value to the model", async () => {
    const { service, execute } = createService([
      JSON.stringify({
        isSceneChange: false,
        confidence: "low",
        reasoning: "Minor refinement",
        suggestedUpdates: {},
      }),
    ]);

    await service.detectSceneChange({
      changedField: "location",
      newValue: "vintage coffee shop",
      oldValue: "coffee shop",
      fullPrompt: "A barista making coffee",
      affectedFields: ["mood"],
    });

    expect(execute).toHaveBeenCalled();
    const call = JSON.stringify(execute.mock.calls[0]);
    expect(call).toContain("video_scene_change_detection");
    expect(call).toContain("vintage coffee shop");
  });
});
