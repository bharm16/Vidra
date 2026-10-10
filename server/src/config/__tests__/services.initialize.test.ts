import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STARTUP_CHECK_TIMEOUT_MS } from "../services.initialize";

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

// Depth convergence module is dynamically imported by initializeServices in
// the test-env else branch. Stub it so the import doesn't blow up.
vi.mock("@services/convergence/depth", () => ({
  setDepthEstimationModuleConfig: vi.fn(),
  warmupDepthEstimationOnStartup: vi
    .fn()
    .mockResolvedValue({ success: true, provider: "stub", durationMs: 0 }),
}));

vi.mock("@config/feature-flags", async (importOriginal) => {
  const original = await importOriginal<typeof import("../feature-flags.js")>();
  return {
    ...original,
    // Keep resolveAllFlags as-is; override getRuntimeFlags so processRole
    // doesn't trigger API/worker-specific init during the skip-probe test.
    getRuntimeFlags: () => ({
      processRole: "api",
      enableConvergence: false,
      videoWorkerDisabled: true,
      videoWorkerShutdownDrainSeconds: 45,
      allowUnhealthyGemini: false,
      unhandledRejectionMode: "classified",
    }),
  };
});

// Stub the NLP + span-labeling modules that initializeApiServices imports
// dynamically when role is "api" and !isTestEnv.
vi.mock("@llm/span-labeling/nlp/NlpSpanService", () => ({
  warmupGliner: vi.fn().mockResolvedValue({ success: false, message: "stub" }),
}));

vi.mock("@llm/span-labeling/config/SpanLabelingConfig", () => ({
  NEURO_SYMBOLIC: { ENABLED: false },
}));

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

type MinimalDepthConfig = {
  warmupRetryTimeoutMs: number;
  falWarmupEnabled: boolean;
  falWarmupIntervalMs: number;
  falWarmupImageUrl: string;
  warmupOnStartup: boolean;
  warmupTimeoutMs: number;
};

type MinimalConfig = {
  convergence: {
    depth: MinimalDepthConfig;
    storage: { signedUrlTtlSeconds: number };
  };
};

const stubDepthConfig: MinimalDepthConfig = {
  warmupRetryTimeoutMs: 0,
  falWarmupEnabled: false,
  falWarmupIntervalMs: 0,
  falWarmupImageUrl: "",
  warmupOnStartup: false,
  warmupTimeoutMs: 0,
};

const stubConfig: MinimalConfig = {
  convergence: {
    depth: stubDepthConfig,
    storage: { signedUrlTtlSeconds: 3600 },
  },
};

// Stub service returned for any of the five pre-resolved critical services.
const stubService = {};

/**
 * Build a minimal DIContainer-like object sufficient for `initializeServices`
 * to complete when running under test env (NODE_ENV=test / VITEST set).
 *
 * In test env the probe block is skipped; only the LLM client resolves and
 * the five critical service resolves run (plus `config` in the else branch).
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
    config: stubConfig,
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
// withTimeout mechanics (existing suite — unchanged)
// ────────────────────────────────────────────────────────────────

describe("infrastructure startup check timeout", () => {
  it("exports a STARTUP_CHECK_TIMEOUT_MS constant of 20 seconds", () => {
    expect(STARTUP_CHECK_TIMEOUT_MS).toBe(20_000);
  });

  it("withTimeout rejects with a labeled message when a check hangs", async () => {
    // Reproduce the same Promise.race + setTimeout pattern used by services.initialize
    // to verify the timeout mechanism works as designed
    const label = "firebase-auth";
    const hangingPromise = new Promise<void>(() => {});

    const timeoutPromise = Promise.race([
      hangingPromise,
      new Promise<never>((_, reject) => {
        setTimeout(
          () =>
            reject(
              new Error(
                `Infrastructure check '${label}' timed out after ${STARTUP_CHECK_TIMEOUT_MS}ms`,
              ),
            ),
          50, // Use short timeout for test speed
        );
      }),
    ]);

    await expect(timeoutPromise).rejects.toThrow(
      /Infrastructure check 'firebase-auth' timed out/,
    );
  });

  it("withTimeout resolves when the check completes before the deadline", async () => {
    const label = "firestore";

    const result = await Promise.race([
      Promise.resolve("done"),
      new Promise<never>((_, reject) => {
        setTimeout(
          () =>
            reject(
              new Error(
                `Infrastructure check '${label}' timed out after ${STARTUP_CHECK_TIMEOUT_MS}ms`,
              ),
            ),
          STARTUP_CHECK_TIMEOUT_MS,
        );
      }),
    ]);

    expect(result).toBe("done");
  });

  it("withTimeout surfaces the original error if the check fails before the deadline", async () => {
    const label = "gcs-bucket";

    const failingCheck = Promise.reject(
      new Error("Bucket does not exist: my-bucket"),
    );

    const racePromise = Promise.race([
      failingCheck,
      new Promise<never>((_, reject) => {
        setTimeout(
          () =>
            reject(
              new Error(
                `Infrastructure check '${label}' timed out after ${STARTUP_CHECK_TIMEOUT_MS}ms`,
              ),
            ),
          STARTUP_CHECK_TIMEOUT_MS,
        );
      }),
    ]);

    await expect(racePromise).rejects.toThrow(
      "Bucket does not exist: my-bucket",
    );
  });

  it("uses sequential checks so a timeout names the stalled service", async () => {
    // Simulates three sequential checks where the second hangs
    const checks: { label: string; fn: () => Promise<void> }[] = [
      { label: "firebase-auth", fn: () => Promise.resolve() },
      { label: "firestore", fn: () => new Promise(() => {}) }, // hangs
      { label: "gcs-bucket", fn: () => Promise.resolve() },
    ];

    const runChecks = async (): Promise<void> => {
      for (const check of checks) {
        await Promise.race([
          check.fn(),
          new Promise<never>((_, reject) => {
            setTimeout(
              () =>
                reject(
                  new Error(
                    `Infrastructure check '${check.label}' timed out after ${STARTUP_CHECK_TIMEOUT_MS}ms`,
                  ),
                ),
              50, // Short timeout for test speed
            );
          }),
        ]);
      }
    };

    await expect(runChecks()).rejects.toThrow(
      /Infrastructure check 'firestore' timed out/,
    );
  });
});

// ────────────────────────────────────────────────────────────────
// GCS startup probe — logic-level tests
//
// These tests exercise the gcs-bucket probe logic in isolation
// using the same Promise.race pattern that services.initialize uses.
// This mirrors the existing test approach (test the probe mechanism
// directly rather than booting the full service graph).
// ────────────────────────────────────────────────────────────────

describe("GCS startup probe logic", () => {
  /**
   * Runs the probe logic exactly as services.initialize does inside
   * withTimeout("gcs-bucket", ...). Wraps with a generous timeout
   * so only bucket errors surface, not timing issues.
   */
  async function runGcsProbe(bucket: {
    name: string;
    exists: () => Promise<[boolean]>;
  }): Promise<void> {
    await Promise.race([
      (async () => {
        const [exists] = await bucket.exists();
        if (!exists) {
          throw new Error(
            `Configured GCS bucket does not exist: ${bucket.name}`,
          );
        }
      })(),
      new Promise<never>((_, reject) => {
        const timer = setTimeout(
          () =>
            reject(
              new Error(
                `Infrastructure check 'gcs-bucket' timed out after ${STARTUP_CHECK_TIMEOUT_MS}ms`,
              ),
            ),
          STARTUP_CHECK_TIMEOUT_MS,
        );
        timer.unref();
      }),
    ]);
  }

  it("succeeds when bucket.exists() resolves [true]", async () => {
    const bucket = {
      name: "vidra-test-bucket",
      exists: vi.fn().mockResolvedValue([true] as [boolean]),
    };

    await expect(runGcsProbe(bucket)).resolves.toBeUndefined();
  });

  it("throws when bucket.exists() resolves [false]", async () => {
    const bucket = {
      name: "vidra-test-bucket",
      exists: vi.fn().mockResolvedValue([false] as [boolean]),
    };

    await expect(runGcsProbe(bucket)).rejects.toThrow(
      /Configured GCS bucket does not exist: vidra-test-bucket/,
    );
  });

  it("propagates the original error when bucket.exists() rejects", async () => {
    const bucket = {
      name: "vidra-test-bucket",
      exists: vi.fn().mockRejectedValue(new Error("403 forbidden")),
    };

    await expect(runGcsProbe(bucket)).rejects.toThrow("403 forbidden");
  });

  it("interpolates the configured bucket name into the error message", async () => {
    const bucket = {
      name: "my-specific-bucket",
      exists: vi.fn().mockResolvedValue([false] as [boolean]),
    };

    await expect(runGcsProbe(bucket)).rejects.toThrow("my-specific-bucket");
  });
});

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
