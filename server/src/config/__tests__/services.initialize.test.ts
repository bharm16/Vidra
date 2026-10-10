import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────────
// Module-level mocks (hoisted before any imports that touch these modules)
// ────────────────────────────────────────────────────────────────

const { listUsersMock, listCollectionsMock } = vi.hoisted(() => ({
  listUsersMock: vi.fn().mockResolvedValue({ users: [] }),
  listCollectionsMock: vi.fn().mockResolvedValue([]),
}));

vi.mock("@infrastructure/firebaseAdmin", () => ({
  getAuth: () => ({ listUsers: listUsersMock }),
  getFirestore: () => ({ listCollections: listCollectionsMock }),
}));

vi.mock("@infrastructure/Logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

// Stub service returned for each pre-resolved critical service.
const stubService = {};

/**
 * Build a minimal DIContainer-like object sufficient for `initializeServices`
 * to complete when running under test env (NODE_ENV=test / VITEST set).
 *
 * Test mode skips probes and role-specific worker/NLP initialization.
 * The configured LLM ports and critical services still resolve.
 */
function createTestContainer(overrides: { gcsBucket?: object } = {}): {
  resolve: ReturnType<typeof vi.fn>;
  registerValue: ReturnType<typeof vi.fn>;
} {
  const gcsBucket = overrides.gcsBucket ?? {
    name: "test-bucket",
    exists: vi.fn().mockResolvedValue([true]),
  };

  // Map of service name → resolved value
  const registry: Record<string, unknown> = {
    gcsBucket,
    openAIClient: null,
    groqClient: null,
    qwenClient: null,
    geminiClient: null,
    capabilitiesProbeService: null,
    promptOptimizationService: stubService,
    enhancementService: stubService,
    sceneDetectionService: stubService,
    spanLabelingCacheService: stubService,
  };

  return {
    resolve: vi.fn((name: string) => {
      if (name in registry) return registry[name];
      throw new Error(
        `[test] service "${name}" not registered in test container`,
      );
    }),
    registerValue: vi.fn(),
  };
}

// ────────────────────────────────────────────────────────────────
// GCS startup probe — skip-under-test-env integration
//
// Verifies that initializeServices does NOT call bucket.exists()
// when running under the test environment (NODE_ENV=test / VITEST set).
// ────────────────────────────────────────────────────────────────

describe("GCS startup probe — test-env skip", () => {
  let savedNodeEnv: string | undefined;
  let savedVitest: string | undefined;
  let savedVitestWorkerId: string | undefined;

  beforeEach(() => {
    savedNodeEnv = process.env.NODE_ENV;
    savedVitest = process.env.VITEST;
    savedVitestWorkerId = process.env.VITEST_WORKER_ID;
    // Clear all three so each test sets only the branch it is isolating.
    delete process.env.NODE_ENV;
    delete process.env.VITEST;
    delete process.env.VITEST_WORKER_ID;
  });

  afterEach(() => {
    if (savedNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = savedNodeEnv;
    }
    if (savedVitest === undefined) {
      delete process.env.VITEST;
    } else {
      process.env.VITEST = savedVitest;
    }
    if (savedVitestWorkerId === undefined) {
      delete process.env.VITEST_WORKER_ID;
    } else {
      process.env.VITEST_WORKER_ID = savedVitestWorkerId;
    }
  });

  it("skips bucket.exists() when NODE_ENV=test", async () => {
    const { initializeServices } = await import("../services.initialize.js");

    const bucketExists = vi.fn();
    const container = createTestContainer({
      gcsBucket: { name: "test-bucket", exists: bucketExists },
    });

    // Only NODE_ENV is set; VITEST and VITEST_WORKER_ID are cleared.
    process.env.NODE_ENV = "test";

    await initializeServices(container as never);

    expect(bucketExists).not.toHaveBeenCalled();
  });

  it("skips bucket.exists() when VITEST is set (even if NODE_ENV differs)", async () => {
    const { initializeServices } = await import("../services.initialize.js");

    const bucketExists = vi.fn();
    const container = createTestContainer({
      gcsBucket: { name: "test-bucket", exists: bucketExists },
    });

    // Only VITEST is set; NODE_ENV and VITEST_WORKER_ID are cleared, so the
    // VITEST branch is the sole reason the probe is skipped.
    process.env.VITEST = "true";

    await initializeServices(container as never);

    expect(bucketExists).not.toHaveBeenCalled();
  });
});
