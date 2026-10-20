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

/**
 * Regression: flags missing from the boot schema were never validated, so
 * `ENABLE_STUDIO=ture` once silently resolved to the default and a whole
 * surface stayed on when the operator meant to turn it off.
 *
 * Invariant under test: each feature flag fails boot on a value other than
 * "true"/"false" rather than falling through to its default.
 */

const FLAGS = [
  "CREDIT_REFUND_SWEEPER_ENABLED",
  "VIDEO_ASSET_RETENTION_ENABLED",
] as const;

/** Minimal env that satisfies the 2 hard-required vars. */
function minimalEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    VITE_FIREBASE_API_KEY: "test-key",
    VITE_FIREBASE_PROJECT_ID: "test-project",
    ...overrides,
  };
}

describe("feature-flag boot validation", () => {
  it("defaults every flag to on", () => {
    const parsed = parseEnv(minimalEnv());
    for (const name of FLAGS) expect(parsed[name]).toBe(true);
  });

  it("rejects an unparseable value for every flag", () => {
    for (const name of FLAGS) {
      expect(
        () => parseEnv(minimalEnv({ [name]: "ture" })),
        `${name}=ture silently resolved to a default instead of failing boot`,
      ).toThrow(name);
    }
  });

  it("accepts true and false for every flag", () => {
    for (const name of FLAGS) {
      expect(parseEnv(minimalEnv({ [name]: "false" }))[name]).toBe(false);
      expect(parseEnv(minimalEnv({ [name]: "true" }))[name]).toBe(true);
    }
  });
});
