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
import { FLAG_DEFINITIONS, type FlagDef } from "../feature-flags";

/**
 * Regression: the boot schema in env.ts once hand-maintained a SECOND list of
 * feature flags covering only 11 of the registry's 18. Flags missing from that
 * list — ENABLE_STUDIO, VIDEO_JOB_WORKER_DISABLED, LLM_PROVIDER_FAILOVER_ENABLED,
 * ALLOW_UNHEALTHY_GEMINI, ENABLE_FACE_EMBEDDING, REPLAY_MODE — were never
 * validated, so `ENABLE_STUDIO=ture` silently resolved to the default and a
 * whole surface (ADR-0019) stayed on when the operator meant to turn it off.
 *
 * Invariant under test: EVERY flag declared in FLAG_DEFINITIONS is validated at
 * boot. A value the registry cannot parse must fail boot rather than fall
 * through to the default. This fails the day a flag is added to the registry
 * without the boot schema being derived from it.
 */

/** Minimal env that satisfies the 2 hard-required vars. */
function minimalEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    VITE_FIREBASE_API_KEY: "test-key",
    VITE_FIREBASE_PROJECT_ID: "test-project",
    ...overrides,
  };
}

const ALL_FLAGS = Object.values(FLAG_DEFINITIONS) as FlagDef[];

describe("feature-flag boot validation is derived from the registry", () => {
  it("declares every registered flag (registry and boot schema cannot drift)", () => {
    const parsed = parseEnv(minimalEnv()) as Record<string, unknown>;

    for (const def of ALL_FLAGS) {
      expect(
        parsed[def.envName],
        `${def.envName} is in FLAG_DEFINITIONS but absent from the boot schema`,
      ).toBe(def.default);
    }
    // Guards the loop above against silently iterating an empty registry.
    expect(ALL_FLAGS.length).toBeGreaterThanOrEqual(18);
  });

  it("rejects an unparseable value for every registered flag", () => {
    for (const def of ALL_FLAGS) {
      const garbage = def.kind === "bool" ? "ture" : "not-a-declared-value";
      expect(
        () => parseEnv(minimalEnv({ [def.envName]: garbage })),
        `${def.envName}=${garbage} silently resolved to a default instead of failing boot`,
      ).toThrow(def.envName);
    }
  });

  it("accepts every declared value for every registered flag", () => {
    for (const def of ALL_FLAGS) {
      const accepted: readonly string[] =
        def.kind === "bool" ? ["true", "false"] : def.values;

      for (const value of accepted) {
        const parsed = parseEnv(minimalEnv({ [def.envName]: value })) as Record<
          string,
          unknown
        >;
        const expected = def.kind === "bool" ? value === "true" : value;
        expect(parsed[def.envName]).toBe(expected);
      }
    }
  });

  it("fails boot on ENABLE_STUDIO=ture instead of defaulting the surface on", () => {
    expect(() => parseEnv(minimalEnv({ ENABLE_STUDIO: "ture" }))).toThrow(
      "ENABLE_STUDIO",
    );

    // The typo is only caught because the value is constrained — the correctly
    // spelled value still turns the surface off.
    const off = parseEnv(minimalEnv({ ENABLE_STUDIO: "false" }));
    const studioEnabled: boolean = off.ENABLE_STUDIO;
    expect(studioEnabled).toBe(false);
  });

  it("fails boot on an undeclared REPLAY_MODE, keeping the merge gate honest", () => {
    expect(() => parseEnv(minimalEnv({ REPLAY_MODE: "replya" }))).toThrow(
      "REPLAY_MODE",
    );

    const replay = parseEnv(minimalEnv({ REPLAY_MODE: "replay" }));
    const mode: "off" | "record" | "replay" = replay.REPLAY_MODE;
    expect(mode).toBe("replay");
  });

  it("validates the failover tuning knobs the failover flag documents", () => {
    const defaults = parseEnv(minimalEnv());
    expect(defaults.LLM_FAILOVER_CONSECUTIVE_FAILURES).toBe(5);
    expect(defaults.LLM_FAILOVER_COOLDOWN_MS).toBe(30000);

    expect(() =>
      parseEnv(minimalEnv({ LLM_FAILOVER_CONSECUTIVE_FAILURES: "five" })),
    ).toThrow("LLM_FAILOVER_CONSECUTIVE_FAILURES");
    expect(() =>
      parseEnv(minimalEnv({ LLM_FAILOVER_COOLDOWN_MS: "-1" })),
    ).toThrow("LLM_FAILOVER_COOLDOWN_MS");
  });
});
