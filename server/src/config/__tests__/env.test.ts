import { describe, expect, it, vi } from "vitest";

vi.mock("@infrastructure/Logger", () => ({
  logger: {
    child: () => ({
      warn: vi.fn(),
      info: vi.fn(),
    }),
  },
}));

import { parseEnv } from "../env";

/** Minimal env that satisfies the 2 hard-required vars. */
function minimalEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    VITE_FIREBASE_API_KEY: "test-key",
    VITE_FIREBASE_PROJECT_ID: "test-project",
    ...overrides,
  };
}

describe("parseEnv", () => {
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
        ENABLE_STUDIO: "false",
        SENTRY_DEBUG: "true",
      }),
    );

    expect(result.ENABLE_STUDIO).toBe(false);
    expect(result.SENTRY_DEBUG).toBe(true);
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

  it("defaults and validates the sketch relay's daily cap and frame cost", () => {
    // Dollar-denominated like the studio's cap, and reset on the same UTC
    // calendar day; the frame cost is millicents because a sketch frame
    // costs well under a cent.
    expect(parseEnv(minimalEnv()).SKETCH_DAILY_SPEND_CAP_CENTS).toBe(500);
    expect(parseEnv(minimalEnv()).SKETCH_FRAME_COST_MILLICENTS).toBe(300);
    expect(
      parseEnv(minimalEnv({ SKETCH_DAILY_SPEND_CAP_CENTS: "250" }))
        .SKETCH_DAILY_SPEND_CAP_CENTS,
    ).toBe(250);
    expect(
      parseEnv(minimalEnv({ SKETCH_FRAME_COST_MILLICENTS: "120" }))
        .SKETCH_FRAME_COST_MILLICENTS,
    ).toBe(120);
    // Malformed values fail boot rather than silently uncapping the relay.
    expect(() =>
      parseEnv(minimalEnv({ SKETCH_DAILY_SPEND_CAP_CENTS: "two dollars" })),
    ).toThrow();
    expect(() =>
      parseEnv(minimalEnv({ SKETCH_FRAME_COST_MILLICENTS: "0" })),
    ).toThrow();
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
