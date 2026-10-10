import { describe, expect, it } from "vitest";
import { resolveAllFlags } from "../feature-flags";

describe("resolveAllFlags", () => {
  it("returns all declared flags at their defaults when env is empty", () => {
    const { flags, deprecations } = resolveAllFlags({} as NodeJS.ProcessEnv);
    expect(flags.studio).toBe(true);
    expect(flags.creditRefundSweeperEnabled).toBe(true);
    // VIDEO_ASSET_RECONCILER_DISABLED !== "false" was disabled-by-default
    // historically; canonical form preserves that via default: false.
    expect(flags.videoJobWorkerDisabled).toBe(false);
    expect(flags.unhandledRejectionMode).toBe("classified");
    expect(deprecations).toEqual([]);
  });

  it("honors the canonical env name without emitting a deprecation", () => {
    const { flags, deprecations } = resolveAllFlags({
      CREDIT_REFUND_SWEEPER_ENABLED: "false",
    } as NodeJS.ProcessEnv);
    expect(flags.creditRefundSweeperEnabled).toBe(false);
    expect(deprecations).toEqual([]);
  });

  it("validates enum values against the declared set", () => {
    const { flags: strict } = resolveAllFlags({
      UNHANDLED_REJECTION_MODE: "strict",
    } as NodeJS.ProcessEnv);
    expect(strict.unhandledRejectionMode).toBe("strict");

    const { flags: bogus } = resolveAllFlags({
      UNHANDLED_REJECTION_MODE: "nonsense",
    } as NodeJS.ProcessEnv);
    expect(bogus.unhandledRejectionMode).toBe("classified");
  });

  it("ignores non-boolean values and falls back to default", () => {
    const { flags } = resolveAllFlags({
      ENABLE_STUDIO: "yes",
    } as NodeJS.ProcessEnv);
    expect(flags.studio).toBe(true);
  });
});
