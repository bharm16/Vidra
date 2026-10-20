import { describe, expect, it } from "vitest";
import { getFeatureFlags, getRuntimeFlags } from "../feature-flags";

describe("getFeatureFlags", () => {
  it("keeps both background-job kill switches on by default", () => {
    expect(getFeatureFlags({} as NodeJS.ProcessEnv)).toEqual({
      creditRefundSweeperEnabled: true,
      videoAssetRetentionEnabled: true,
    });
  });

  it("turns a kill switch off only for an explicit false", () => {
    const flags = getFeatureFlags({
      CREDIT_REFUND_SWEEPER_ENABLED: "false",
      VIDEO_ASSET_RETENTION_ENABLED: "yes",
    } as NodeJS.ProcessEnv);

    expect(flags.creditRefundSweeperEnabled).toBe(false);
    expect(flags.videoAssetRetentionEnabled).toBe(true);
  });
});

describe("getRuntimeFlags", () => {
  it("defaults to the api role, where the video worker never runs", () => {
    const flags = getRuntimeFlags({} as NodeJS.ProcessEnv);
    expect(flags.processRole).toBe("api");
    expect(flags.videoWorkerDisabled).toBe(true);
    expect(flags.videoWorkerShutdownDrainSeconds).toBe(45);
  });

  it("runs the video worker in the worker role and honors the drain budget", () => {
    const flags = getRuntimeFlags({
      PROCESS_ROLE: "worker",
      VIDEO_WORKER_SHUTDOWN_DRAIN_SECONDS: "60",
    } as NodeJS.ProcessEnv);
    expect(flags.processRole).toBe("worker");
    expect(flags.videoWorkerDisabled).toBe(false);
    expect(flags.videoWorkerShutdownDrainSeconds).toBe(60);
  });
});
