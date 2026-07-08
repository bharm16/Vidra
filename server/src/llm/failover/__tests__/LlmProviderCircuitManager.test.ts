import { describe, expect, it } from "vitest";
import { LlmProviderCircuitManager } from "../LlmProviderCircuitManager";

function buildManager({
  threshold = 3,
  cooldownMs = 30_000,
}: { threshold?: number; cooldownMs?: number } = {}) {
  let nowMs = 1_000_000;
  const manager = new LlmProviderCircuitManager({
    consecutiveFailureThreshold: threshold,
    cooldownMs,
    now: () => nowMs,
  });
  return {
    manager,
    advance: (ms: number) => {
      nowMs += ms;
    },
  };
}

describe("LlmProviderCircuitManager", () => {
  it("stays closed below the consecutive-failure threshold", () => {
    const { manager } = buildManager({ threshold: 3 });

    manager.recordFailure("gemini");
    manager.recordFailure("gemini");

    expect(manager.canDispatch("gemini")).toBe(true);
    expect(manager.getSnapshot("gemini").state).toBe("closed");
  });

  it("opens after N consecutive failures and rejects dispatch during cooldown", () => {
    const { manager } = buildManager({ threshold: 3 });

    manager.recordFailure("gemini");
    manager.recordFailure("gemini");
    manager.recordFailure("gemini");

    expect(manager.isOpen("gemini")).toBe(true);
    expect(manager.canDispatch("gemini")).toBe(false);
  });

  it("a success resets the consecutive-failure counter", () => {
    const { manager } = buildManager({ threshold: 3 });

    manager.recordFailure("gemini");
    manager.recordFailure("gemini");
    manager.recordSuccess("gemini");
    manager.recordFailure("gemini");
    manager.recordFailure("gemini");

    expect(manager.canDispatch("gemini")).toBe(true);
  });

  it("half-opens after cooldown and allows exactly one probe", () => {
    const { manager, advance } = buildManager({
      threshold: 2,
      cooldownMs: 30_000,
    });

    manager.recordFailure("gemini");
    manager.recordFailure("gemini");
    expect(manager.canDispatch("gemini")).toBe(false);

    advance(30_001);

    expect(manager.canDispatch("gemini")).toBe(true);
    expect(manager.getSnapshot("gemini").state).toBe("half-open");

    manager.markDispatched("gemini");
    expect(manager.canDispatch("gemini")).toBe(false);
  });

  it("closes the circuit when the half-open probe succeeds", () => {
    const { manager, advance } = buildManager({
      threshold: 2,
      cooldownMs: 30_000,
    });

    manager.recordFailure("gemini");
    manager.recordFailure("gemini");
    advance(30_001);
    manager.canDispatch("gemini");
    manager.markDispatched("gemini");
    manager.recordSuccess("gemini");

    expect(manager.getSnapshot("gemini").state).toBe("closed");
    expect(manager.canDispatch("gemini")).toBe(true);
  });

  it("reopens the circuit when the half-open probe fails", () => {
    const { manager, advance } = buildManager({
      threshold: 2,
      cooldownMs: 30_000,
    });

    manager.recordFailure("gemini");
    manager.recordFailure("gemini");
    advance(30_001);
    manager.canDispatch("gemini");
    manager.markDispatched("gemini");
    manager.recordFailure("gemini");

    expect(manager.getSnapshot("gemini").state).toBe("open");
    expect(manager.canDispatch("gemini")).toBe(false);
  });

  it("releaseHalfOpenProbe frees the probe slot without changing state", () => {
    const { manager, advance } = buildManager({
      threshold: 2,
      cooldownMs: 30_000,
    });

    manager.recordFailure("gemini");
    manager.recordFailure("gemini");
    advance(30_001);
    manager.canDispatch("gemini");
    manager.markDispatched("gemini");
    manager.releaseHalfOpenProbe("gemini");

    expect(manager.getSnapshot("gemini").state).toBe("half-open");
    expect(manager.canDispatch("gemini")).toBe(true);
  });

  it("tracks providers independently", () => {
    const { manager } = buildManager({ threshold: 2 });

    manager.recordFailure("gemini");
    manager.recordFailure("gemini");

    expect(manager.canDispatch("gemini")).toBe(false);
    expect(manager.canDispatch("qwen")).toBe(true);
    expect(manager.getAllSnapshots().map((s) => s.provider)).toContain(
      "gemini",
    );
  });
});
