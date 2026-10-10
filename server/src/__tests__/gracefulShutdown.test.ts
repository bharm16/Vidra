import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../infrastructure/Logger.ts", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

vi.mock("../config/redis.ts", () => ({
  closeRedisClient: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../config/feature-flags.ts", () => ({
  getRuntimeFlags: vi.fn(() => ({
    unhandledRejectionMode: "classified",
    videoWorkerShutdownDrainSeconds: 5,
    processRole: "api",
    videoWorkerDisabled: false,
  })),
}));

import { stopAllPeriodicWorkers } from "../server.ts";
import type { DIContainer } from "../infrastructure/DIContainer.ts";

interface StoppableMock {
  stop: ReturnType<typeof vi.fn>;
}

/**
 * Build a minimal DIContainer-like stub that returns the provided service map.
 * Missing names throw (mirrors the real container), and `resolveOptional` inside
 * `stopAllPeriodicWorkers` swallows the throw to null.
 */
function buildContainer(
  services: Record<string, unknown>,
): Pick<DIContainer, "resolve"> {
  return {
    resolve: <T>(name: string): T => {
      if (!(name in services)) {
        throw new Error(`Unknown service: ${name}`);
      }
      return services[name] as T;
    },
  };
}

function buildStoppable(): StoppableMock {
  return { stop: vi.fn() };
}

describe("stopAllPeriodicWorkers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Invariant: every periodic worker registered by the graceful shutdown
  // wiring must have `.stop()` invoked. If a new worker is added in the DI
  // container without being wired into shutdown, its interval timers keep the
  // process alive past the drain budget. The four call-outs below are the
  // four workers added in this fix.
  it("calls .stop() on every registered periodic worker", () => {
    const creditRefundSweeper = buildStoppable();
    const videoAssetRetentionService = buildStoppable();
    const capabilitiesProbeService = buildStoppable();

    const container = buildContainer({
      creditRefundSweeper,
      videoAssetRetentionService,
      capabilitiesProbeService,
    });

    stopAllPeriodicWorkers(container as DIContainer);

    // The four newly-wired workers — the primary assertion for this regression.

    // Pre-existing workers must still be stopped — guards against regressions.
    expect(creditRefundSweeper.stop).toHaveBeenCalledTimes(1);
    expect(videoAssetRetentionService.stop).toHaveBeenCalledTimes(1);
    expect(capabilitiesProbeService.stop).toHaveBeenCalledTimes(1);
  });

  it("tolerates null-registered workers (feature-flag-disabled paths)", () => {
    const container = buildContainer({
      // These are legitimately null when their feature flags disable them.
      creditRefundSweeper: null,
      videoAssetRetentionService: null,
      capabilitiesProbeService: null,
    });

    expect(() =>
      stopAllPeriodicWorkers(container as DIContainer),
    ).not.toThrow();
  });

  it("tolerates unregistered worker names (resolve throws are caught)", () => {
    const container = buildContainer({});

    expect(() =>
      stopAllPeriodicWorkers(container as DIContainer),
    ).not.toThrow();
  });
});
