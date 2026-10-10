import { describe, expect, it } from "vitest";
import { resolveAllFlags, getFlagEnvNames } from "../feature-flags";

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

describe("getFlagEnvNames", () => {
  it("surfaces canonical env name for every registered flag", () => {
    const entries = getFlagEnvNames();
    const webhook = entries.find(
      (e) => e.name === "creditRefundSweeperEnabled",
    );
    expect(webhook).toBeDefined();
    expect(webhook?.envName).toBe("CREDIT_REFUND_SWEEPER_ENABLED");
    expect(webhook?.aliases).toEqual([]);
  });

  it("categorizes flags so the doc generator can group them", () => {
    const entries = getFlagEnvNames();
    const categories = new Set(entries.map((e) => e.category));
    expect(categories).toContain("mode");
    expect(categories).toContain("killswitch");
  });
});

describe("feature flag retirement", () => {
  it("keeps Studio's credential dependency", () => {
    expect(
      getFlagEnvNames().find((f) => f.envName === "ENABLE_STUDIO")?.requiresEnv,
    ).toEqual(["REPLICATE_API_TOKEN"]);
  });
  it("has no flags that can reactivate removed backends", () => {
    const envNames = getFlagEnvNames().map((f) => f.envName);
    for (const name of [
      "ENABLE_CONVERGENCE",
      "ENABLE_FACE_EMBEDDING",
      "CONTINUITY_CLIP_ENABLED",
      "DEPTH_WARMUP_ON_STARTUP",
      "VIDEO_DLQ_REPROCESSOR_ENABLED",
      "WEBHOOK_RECONCILIATION_ENABLED",
    ])
      expect(envNames).not.toContain(name);
  });
});
