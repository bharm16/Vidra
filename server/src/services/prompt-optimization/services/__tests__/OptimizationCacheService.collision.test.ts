import { describe, expect, it, vi } from "vitest";
import { OptimizationCacheService } from "../OptimizationCacheService";
import type {
  OptimizationMode,
  OptimizationResponse,
} from "@services/prompt-optimization/types";
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

vi.mock("@config/OptimizationConfig", () => ({
  default: {
    cache: {
      promptOptimization: "promptOptimization",
    },
  },
}));

function createCacheServiceStub(stored: unknown = null): CacheService {
  const stub = {
    get: vi.fn(async () => stored),
    set: vi.fn(async () => true),
    getConfig: vi.fn(() => ({ ttl: 3600, namespace: "prompt" })),
  };
  return stub as unknown as CacheService;
}

const outcome = (): OptimizationResponse => ({
  prompt: "cached prompt",
  previewPrompt: "cached preview",
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
      wordCount: 2,
      repaired: false,
    },
  },
});

describe("OptimizationCacheService.buildCacheKey collision", () => {
  it("produces different keys for prompts that differ only after char 100", () => {
    const service = new OptimizationCacheService(createCacheServiceStub());

    // Build two prompts with identical first 100 chars but different tails
    const commonPrefix = "A".repeat(100);
    const promptA = commonPrefix + "suffix-alpha";
    const promptB = commonPrefix + "suffix-beta-is-different";

    const keyA = service.buildCacheKey(promptA, VIDEO_MODE, null, null);
    const keyB = service.buildCacheKey(promptB, VIDEO_MODE, null, null);

    // Invariant: differing tails must produce different cache keys
    expect(keyA).not.toBe(keyB);
  });

  it("produces identical keys for identical prompts", () => {
    const service = new OptimizationCacheService(createCacheServiceStub());

    const prompt = "some long prompt that repeats across calls";
    const keyA = service.buildCacheKey(prompt, VIDEO_MODE, null, null);
    const keyB = service.buildCacheKey(prompt, VIDEO_MODE, null, null);

    expect(keyA).toBe(keyB);
  });

  it("uses a hex hash segment rather than a raw prompt substring", () => {
    const service = new OptimizationCacheService(createCacheServiceStub());

    // Include a character that would appear verbatim in a substring-based key
    // but never in a hex hash, confirming the key is hashed.
    const prompt = "GENERATE: !!!unique-marker-Z!!!";
    const key = service.buildCacheKey(prompt, VIDEO_MODE, null, null);

    expect(key).not.toContain("unique-marker-Z");
  });
});

describe("OptimizationCacheService.getCachedOutcome", () => {
  it("returns a stored outcome record", async () => {
    const stored = outcome();
    const service = new OptimizationCacheService(
      createCacheServiceStub(stored),
    );

    await expect(service.getCachedOutcome("key")).resolves.toEqual(stored);
  });

  it("treats a pre-record entry (bare prompt string) as a miss", async () => {
    const service = new OptimizationCacheService(
      createCacheServiceStub("just the prompt text"),
    );

    await expect(service.getCachedOutcome("key")).resolves.toBeNull();
  });

  it("treats a record without quality verdicts as a miss", async () => {
    const service = new OptimizationCacheService(
      createCacheServiceStub({ prompt: "cached prompt" }),
    );

    await expect(service.getCachedOutcome("key")).resolves.toBeNull();
  });
});
