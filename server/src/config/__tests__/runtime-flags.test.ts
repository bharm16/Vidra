import { describe, expect, it } from "vitest";
import { getRuntimeFlags } from "../feature-flags";

describe("getRuntimeFlags", () => {
  it("defaults to api role when PROCESS_ROLE is not set", () => {
    const flags = getRuntimeFlags({} as NodeJS.ProcessEnv);
    expect(flags.processRole).toBe("api");
    // Workers are disabled when running as api role
    expect(flags.videoWorkerDisabled).toBe(true);
    expect(flags.videoWorkerShutdownDrainSeconds).toBe(45);
  });

  it("enables worker role and honors explicit worker disable flag", () => {
    const flags = getRuntimeFlags({
      PROCESS_ROLE: "worker",
      VIDEO_JOB_WORKER_DISABLED: "true",
      VIDEO_WORKER_SHUTDOWN_DRAIN_SECONDS: "60",
    } as NodeJS.ProcessEnv);
    expect(flags.processRole).toBe("worker");
    expect(flags.videoWorkerDisabled).toBe(true);
    expect(flags.videoWorkerShutdownDrainSeconds).toBe(60);
  });

  it("keeps worker enabled when process role is worker and disable flag is absent", () => {
    const flags = getRuntimeFlags({
      PROCESS_ROLE: "worker",
    } as NodeJS.ProcessEnv);
    expect(flags.processRole).toBe("worker");
    expect(flags.videoWorkerDisabled).toBe(false);
  });
});
