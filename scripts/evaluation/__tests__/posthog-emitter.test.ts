import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const captureSpy = vi.fn();
const shutdownSpy = vi.fn(async () => {});

vi.mock("posthog-node", () => {
  return {
    PostHog: vi.fn().mockImplementation(() => ({
      capture: captureSpy,
      shutdown: shutdownSpy,
    })),
  };
});

import { createEvalEmitter } from "../posthog-emitter.js";

describe("EvalEmitter harnessVersion stamping (F5)", () => {
  // F5 (2026-05-23): PostHog audit showed quality.scored events at 0%
  // harnessVersion coverage while server-emitted events were at 100%.
  // Root cause: posthog-emitter.ts constructs its own posthog-node client
  // and bypasses PostHogClient.capture() (where the stamping lives). The
  // fix imports resolveHarnessVersion from server/src/infrastructure/ so
  // both emitters use the same resolver — process-build attribution stays
  // consistent across the surface-event process and the judge process.

  const originalKey = process.env.POSTHOG_API_KEY;
  const originalHarnessVersion = process.env.HARNESS_VERSION;

  beforeEach(() => {
    captureSpy.mockClear();
    process.env.POSTHOG_API_KEY = "phc_test_key";
    process.env.HARNESS_VERSION = "judge-harness-xyz789";
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.POSTHOG_API_KEY;
    else process.env.POSTHOG_API_KEY = originalKey;
    if (originalHarnessVersion === undefined)
      delete process.env.HARNESS_VERSION;
    else process.env.HARNESS_VERSION = originalHarnessVersion;
  });

  it("stamps harnessVersion onto every emitted event", () => {
    const emitter = createEvalEmitter();
    emitter.emit({
      distinctId: "d1",
      event: "quality.scored",
      properties: { surface: "optimize", totalScore: 22 },
    });
    expect(captureSpy).toHaveBeenCalledTimes(1);
    const properties = captureSpy.mock.calls[0]![0]!.properties as Record<
      string,
      unknown
    >;
    expect(properties.harnessVersion).toBe("judge-harness-xyz789");
    expect(properties.surface).toBe("optimize");
    expect(properties.totalScore).toBe(22);
  });

  it("explicit properties.harnessVersion wins over env (override channel)", () => {
    const emitter = createEvalEmitter();
    emitter.emit({
      distinctId: "d1",
      event: "quality.scored",
      properties: { harnessVersion: "override-abc" },
    });
    const properties = captureSpy.mock.calls[0]![0]!.properties as Record<
      string,
      unknown
    >;
    expect(properties.harnessVersion).toBe("override-abc");
  });
});
