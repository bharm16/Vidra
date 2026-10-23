import type { AIExecutionPort } from "@services/ai-model/ports/AIExecutionPort";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
      metadata: { model: "openai/gpt-oss-20b", provider: "groq" },
    };
  });

  const aiService = {
    execute,
    getOperationConfig: vi.fn(() => ({
      temperature: 0.3,
      client: "groq",
    })),
  } as unknown as AIExecutionPort;

  const entries = new Map<string, unknown>();
  const cacheService = {
    getConfig: vi.fn(() => ({ ttl: 300, namespace: "scene-detection" })),
    generateKey: vi.fn(() => "test-cache-key"),
    get: vi.fn(async (key: string) => entries.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => {
      entries.set(key, value);
      return true;
    }),
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
      ownerId: "owner-a",
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
      ownerId: "owner-a",
      changedField: "location",
      newValue: "mountain summit",
      oldValue: "office cubicle",
      fullPrompt: "A worker at their desk",
      affectedFields: ["lighting", "mood"],
    });

    expect(result).toEqual(llmResult);
    expect(cacheService.set).toHaveBeenCalledWith(
      expect.stringMatching(/^scene-detection:private-v3:[a-f0-9]{64}$/),
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

  const privateRequest = {
    ownerId: "owner-a",
    changedField: "location",
    newValue: "underwater cave",
    oldValue: "coffee shop",
    fullPrompt: `${"A".repeat(650)} private location A`,
    affectedFields: { lighting: "private field A" },
    sectionHeading: "Environment",
    sectionContext: "private section A",
  };
  const modelResult = JSON.stringify({
    isSceneChange: true,
    confidence: "high",
    reasoning: "Environment changed",
    suggestedUpdates: { lighting: "underwater caustics" },
  });

  it("reuses identical same-owner requests without exposing inputs in keys", async () => {
    const { service, execute, cacheService } = createService([modelResult]);
    const first = await service.detectSceneChange(privateRequest);
    expect(await service.detectSceneChange({ ...privateRequest })).toBe(first);
    expect(execute).toHaveBeenCalledTimes(1);
    const key = vi.mocked(cacheService.set).mock.calls[0]?.[0];
    expect(key).toMatch(/^scene-detection:private-v3:[a-f0-9]{64}$/);
    expect(key).not.toContain("owner-a");
    expect(key).not.toContain("private location");
  });

  it.each([
    { ownerId: "owner-b" },
    { fullPrompt: `${"A".repeat(650)} private location B` },
    { sectionContext: "private section B" },
    { sectionHeading: "Other section" },
    { affectedFields: { lighting: "private field B" } },
  ])("separates complete private scene inputs: %j", async (change) => {
    const { service, execute, cacheService } = createService([modelResult]);
    const first = await service.detectSceneChange(privateRequest);
    const second = await service.detectSceneChange({ ...privateRequest, ...change });
    expect(second).not.toBe(first);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(new Set(vi.mocked(cacheService.set).mock.calls.map(([key]) => key)).size).toBe(2);
  });

  it("bypasses cache for legacy callers without a verified owner", async () => {
    const { service, execute, cacheService } = createService([modelResult]);
    const { ownerId: _ownerId, ...request } = privateRequest;
    await service.detectSceneChange(request);
    await service.detectSceneChange(request);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(cacheService.get).not.toHaveBeenCalled();
    expect(cacheService.set).not.toHaveBeenCalled();
  });
});
