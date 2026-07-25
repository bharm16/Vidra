import { describe, expect, it, vi } from "vitest";

vi.mock("@infrastructure/Logger", () => ({
  logger: {
    child: () => ({
      warn: vi.fn(),
      info: vi.fn(),
    }),
  },
}));

import { parseEnv, emitEnvWarnings } from "../env";

/** Minimal env that satisfies the 2 hard-required vars. */
function minimalEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    VITE_FIREBASE_API_KEY: "test-key",
    VITE_FIREBASE_PROJECT_ID: "test-project",
    ...overrides,
  };
}

describe("parseEnv", () => {
  it("parses minimal valid env with defaults applied", () => {
    const result = parseEnv(minimalEnv());

    expect(result.PORT).toBe(3001);
    expect(result.NODE_ENV).toBe("development");
    expect(result.OPENAI_MODEL).toBe("gpt-4o-mini");
    expect(result.GROQ_MODEL).toBe("llama-3.1-8b-instant");
    expect(result.GEMINI_MODEL).toBe("gemini-2.5-flash");
    expect(result.ENABLE_CONVERGENCE).toBe(true);
    expect(result.VIDEO_STORAGE_BASE_PATH).toBe("video-previews");
    expect(result.IMAGE_STORAGE_BASE_PATH).toBe("image-previews");
    expect(result.FREE_TIER_STARTER_CREDITS).toBe(25);
  });

  it("coerces string numbers to actual numbers", () => {
    const result = parseEnv(
      minimalEnv({
        PORT: "4000",
        OPENAI_TIMEOUT_MS: "90000",
        FIRESTORE_CIRCUIT_TIMEOUT_MS: "5000",
      }),
    );

    expect(result.PORT).toBe(4000);
    expect(result.OPENAI_TIMEOUT_MS).toBe(90000);
    expect(result.FIRESTORE_CIRCUIT_TIMEOUT_MS).toBe(5000);
  });

  it("coerces boolean strings correctly", () => {
    const result = parseEnv(
      minimalEnv({
        ENABLE_CONVERGENCE: "false",
        SENTRY_DEBUG: "true",
      }),
    );

    expect(result.ENABLE_CONVERGENCE).toBe(false);
    expect(result.SENTRY_DEBUG).toBe(true);
  });

  it("throws when required Firebase vars are missing", () => {
    expect(() => parseEnv({})).toThrow("Environment validation failed");
    expect(() => parseEnv({})).toThrow("VITE_FIREBASE_API_KEY");
    expect(() => parseEnv({})).toThrow("VITE_FIREBASE_PROJECT_ID");
  });

  it("collects ALL errors rather than stopping at the first", () => {
    try {
      parseEnv({});
      expect.fail("Should have thrown");
    } catch (error) {
      const message = (error as Error).message;
      // Both required vars should appear in a single error message
      expect(message).toContain("VITE_FIREBASE_API_KEY");
      expect(message).toContain("VITE_FIREBASE_PROJECT_ID");
    }
  });

  it("enforces production-specific requirements", () => {
    expect(() => parseEnv(minimalEnv({ NODE_ENV: "production" }))).toThrow(
      "ALLOWED_ORIGINS",
    );
  });

  it("passes production validation when all required vars are set", () => {
    const result = parseEnv(
      minimalEnv({
        NODE_ENV: "production",
        ALLOWED_ORIGINS: "https://example.com",
        FRONTEND_URL: "https://example.com",
        GCS_BUCKET_NAME: "bucket",
      }),
    );

    expect(result.NODE_ENV).toBe("production");
    expect(result.GCS_BUCKET_NAME).toBe("bucket");
  });

  it("defaults and validates the studio daily spend cap", () => {
    expect(parseEnv(minimalEnv()).STUDIO_DAILY_SPEND_CAP_CENTS).toBe(500);
    expect(
      parseEnv(minimalEnv({ STUDIO_DAILY_SPEND_CAP_CENTS: "1200" }))
        .STUDIO_DAILY_SPEND_CAP_CENTS,
    ).toBe(1200);
    // Malformed cap values fail boot instead of silently falling back.
    expect(() =>
      parseEnv(minimalEnv({ STUDIO_DAILY_SPEND_CAP_CENTS: "five dollars" })),
    ).toThrow();
    expect(() =>
      parseEnv(minimalEnv({ STUDIO_DAILY_SPEND_CAP_CENTS: "-5" })),
    ).toThrow();
  });

  it("passes through unknown env vars without error", () => {
    const result = parseEnv(
      minimalEnv({
        HOME: "/Users/test",
        PATH: "/usr/bin",
        SOME_CUSTOM_VAR: "value",
      }),
    );

    // Unknown vars pass through due to .passthrough()
    expect((result as Record<string, unknown>).HOME).toBe("/Users/test");
  });

  it("preserves optional API keys when provided", () => {
    const result = parseEnv(
      minimalEnv({
        OPENAI_API_KEY: "sk-test",
        STRIPE_SECRET_KEY: "sk_test_stripe",
        REPLICATE_API_TOKEN: "r8_test",
      }),
    );

    expect(result.OPENAI_API_KEY).toBe("sk-test");
    expect(result.STRIPE_SECRET_KEY).toBe("sk_test_stripe");
    expect(result.REPLICATE_API_TOKEN).toBe("r8_test");
  });

  it("uses defaults for video job config when not provided", () => {
    const result = parseEnv(minimalEnv());

    expect(result.VIDEO_JOB_MAX_ATTEMPTS).toBe(3);
    expect(result.VIDEO_JOB_LEASE_SECONDS).toBe(90);
    expect(result.VIDEO_PROVIDER_POLL_TIMEOUT_MS).toBe(270000);
    expect(result.VIDEO_GENERATE_IDEMPOTENCY_PENDING_TTL_MS).toBe(360000);
  });

  /**
   * Regression: VIDEO_JOB_LEASE_SECONDS must exceed
   * VIDEO_JOB_HEARTBEAT_INTERVAL_MS × MAX_HEARTBEAT_FAILURES (3) so that an
   * unhealthy worker can be detected before another worker is eligible to
   * claim the lease. The prior 60s default exactly equaled the failure
   * window (20s × 3), leaving zero detection margin.
   *
   * Invariant under test: leaseSeconds * 1000 > heartbeatInterval * 3.
   */
  it("VIDEO_JOB_LEASE_SECONDS preserves the heartbeat-failure detection margin (regression)", () => {
    const result = parseEnv(minimalEnv());

    const leaseMs = result.VIDEO_JOB_LEASE_SECONDS * 1000;
    const heartbeatFailureWindow = result.VIDEO_JOB_HEARTBEAT_INTERVAL_MS * 3;

    expect(leaseMs).toBeGreaterThan(heartbeatFailureWindow);
    // Sanity: the margin should be at least 10s in absolute terms — anything
    // tighter risks treating a single delayed heartbeat tick as a takeover.
    expect(leaseMs - heartbeatFailureWindow).toBeGreaterThanOrEqual(10_000);
  });
});

describe("emitEnvWarnings", () => {
  it("does not throw for valid env", () => {
    const env = parseEnv(minimalEnv({ OPENAI_API_KEY: "sk-valid" }));
    expect(() => emitEnvWarnings(env)).not.toThrow();
  });

  it("does not throw when no LLM keys are set", () => {
    const env = parseEnv(minimalEnv());
    expect(() => emitEnvWarnings(env)).not.toThrow();
  });
});
