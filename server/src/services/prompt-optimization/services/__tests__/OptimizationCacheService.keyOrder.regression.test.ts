import { describe, expect, it, vi } from "vitest";
import { OptimizationCacheService } from "../OptimizationCacheService";
import type { OptimizationMode } from "@services/prompt-optimization/types";
import type { CacheService } from "@services/cache/CacheService";

const VIDEO_MODE: OptimizationMode = "video";

vi.mock("@infrastructure/Logger", () => ({
  logger: {
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function createCacheServiceStub(): CacheService {
  const stub = {
    get: vi.fn(async () => null),
    set: vi.fn(async () => true),
    getConfig: vi.fn(() => ({ ttl: 3600, namespace: "prompt" })),
  };
  return stub as unknown as CacheService;
}

/**
 * Regression: cache-key serialization must be order-invariant for object
 * inputs. Prior to the stableStringify fix, callers that built `context`
 * or `brainstormContext` from spreads or different code paths would emit
 * keys in different orders → JSON.stringify produced different strings →
 * silent cache-key collision-misses for semantically identical inputs.
 *
 * Invariant under test:
 *   buildCacheKey and buildStructuredArtifactKeyFromInputs depend only on
 *   the *content* of nested objects, not on insertion-order of their keys.
 */
describe("OptimizationCacheService key-order invariance (regression)", () => {
  it("buildCacheKey: identical context with reordered top-level keys → same key", () => {
    const service = new OptimizationCacheService(createCacheServiceStub());
    const prompt = "a prompt";

    const ctxA = { sceneType: "indoor", lighting: "soft", mood: "calm" };
    const ctxB = { mood: "calm", lighting: "soft", sceneType: "indoor" };

    // Cast: the test's purpose is to verify key-order invariance, not the
    // structural shape of InferredContext.
    const keyA = service.buildCacheKey(prompt, VIDEO_MODE, ctxA as never, null);
    const keyB = service.buildCacheKey(prompt, VIDEO_MODE, ctxB as never, null);

    expect(keyA).toBe(keyB);
  });

  it("buildCacheKey: identical brainstormContext with reordered keys → same key", () => {
    const service = new OptimizationCacheService(createCacheServiceStub());
    const prompt = "a prompt";

    const bsA = { topic: "x", tone: "playful", length: "short" };
    const bsB = { length: "short", tone: "playful", topic: "x" };

    const keyA = service.buildCacheKey(prompt, VIDEO_MODE, null, bsA);
    const keyB = service.buildCacheKey(prompt, VIDEO_MODE, null, bsB);

    expect(keyA).toBe(keyB);
  });

  it("buildCacheKey: nested objects with reordered keys → same key", () => {
    const service = new OptimizationCacheService(createCacheServiceStub());
    const prompt = "a prompt";

    // The original (raw JSON.stringify) bug was particularly common with
    // nested objects, since deep insertion order is rarely controlled.
    const ctxA = {
      camera: { angle: "low", focal: 35 },
      lighting: { key: "soft", fill: "warm" },
    };
    const ctxB = {
      lighting: { fill: "warm", key: "soft" },
      camera: { focal: 35, angle: "low" },
    };

    // Cast: the test's purpose is to verify key-order invariance, not the
    // structural shape of InferredContext.
    const keyA = service.buildCacheKey(prompt, VIDEO_MODE, ctxA as never, null);
    const keyB = service.buildCacheKey(prompt, VIDEO_MODE, ctxB as never, null);

    expect(keyA).toBe(keyB);
  });

  it("buildCacheKey: arrays preserve order (reordered array → different key)", () => {
    // Cache-key invariance applies to *object* keys, not array element order.
    // Arrays carry semantic order; reordering an array means a different input.
    const service = new OptimizationCacheService(createCacheServiceStub());
    const prompt = "a prompt";

    const ctxA = { tags: ["a", "b", "c"] };
    const ctxB = { tags: ["c", "b", "a"] };

    // Cast: the test's purpose is to verify key-order invariance, not the
    // structural shape of InferredContext.
    const keyA = service.buildCacheKey(prompt, VIDEO_MODE, ctxA as never, null);
    const keyB = service.buildCacheKey(prompt, VIDEO_MODE, ctxB as never, null);

    expect(keyA).not.toBe(keyB);
  });

  it("buildStructuredArtifactKeyFromInputs: nested shotPlan reordering → same key", () => {
    // The previous bug: normalizeShotPlan only sorted top-level keys, so
    // nested per-shot details with reordered keys hashed differently.
    const service = new OptimizationCacheService(createCacheServiceStub());
    const prompt = "structured prompt";

    const shotsA = {
      version: 1,
      shots: [
        { subject: "person", action: "walking", camera: "wide" },
        { subject: "tree", action: "swaying", camera: "close" },
      ],
    };
    // Same content, all object keys at every depth reordered.
    const shotsB = {
      shots: [
        { camera: "wide", action: "walking", subject: "person" },
        { camera: "close", action: "swaying", subject: "tree" },
      ],
      version: 1,
    };

    const keyA = service.buildStructuredArtifactKeyFromInputs({
      prompt,
      shotPlan: shotsA as never,
      generationParams: null,
    });
    const keyB = service.buildStructuredArtifactKeyFromInputs({
      prompt,
      shotPlan: shotsB as never,
      generationParams: null,
    });

    expect(keyA).toBe(keyB);
  });

  it("buildStructuredArtifactKeyFromInputs: different shot content → different key", () => {
    // Sanity check: the key must still discriminate by content.
    const service = new OptimizationCacheService(createCacheServiceStub());
    const prompt = "structured prompt";

    const shotsA = {
      shots: [{ subject: "person", action: "walking" }],
      version: 1,
    };
    const shotsB = {
      shots: [{ subject: "person", action: "running" }], // different action
      version: 1,
    };

    const keyA = service.buildStructuredArtifactKeyFromInputs({
      prompt,
      shotPlan: shotsA as never,
      generationParams: null,
    });
    const keyB = service.buildStructuredArtifactKeyFromInputs({
      prompt,
      shotPlan: shotsB as never,
      generationParams: null,
    });

    expect(keyA).not.toBe(keyB);
  });
});
