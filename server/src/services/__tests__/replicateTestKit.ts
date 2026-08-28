/**
 * Shared test kit for suites that mock the `replicate` SDK.
 *
 * Six suites (both Flux providers + the studio runner, each with a
 * poll-resilience twin) carried byte-identical mock factories, the
 * transient-500 error fixture, and the fake-timer sleep stub. The SDK is
 * the correct process-external seam — this kit is the correct factoring.
 *
 * Usage (per suite — vi.mock must stay file-local because it is hoisted):
 *
 *   const kit = createReplicateMockKit<ReplicatePrediction>();
 *   vi.mock("replicate", () => ({ default: vi.fn(() => kit.instance) }));
 *   beforeEach(() => kit.reset());
 */
import { vi, type MockedFunction } from "vitest";

export interface ReplicateMockKit<
  TPrediction,
  TCreateOptions = Record<string, unknown>,
> {
  createPredictionMock: MockedFunction<
    (options: TCreateOptions) => Promise<TPrediction>
  >;
  getPredictionMock: MockedFunction<(id: string) => Promise<TPrediction>>;
  /** Stable object identity — the vi.mock factory closes over this. */
  instance: {
    predictions: {
      create: (options: TCreateOptions) => Promise<TPrediction>;
      get: (id: string) => Promise<TPrediction>;
    };
  };
  /** Fresh mock fns each test; the instance keeps its identity. */
  reset(): void;
}

export function createReplicateMockKit<
  TPrediction,
  TCreateOptions = Record<string, unknown>,
>(): ReplicateMockKit<TPrediction, TCreateOptions> {
  const kit = {
    createPredictionMock: vi.fn(),
    getPredictionMock: vi.fn(),
    instance: {
      predictions: {
        create: (options: TCreateOptions) => kit.createPredictionMock(options),
        get: (id: string) => kit.getPredictionMock(id),
      },
    },
    reset() {
      kit.createPredictionMock = vi.fn();
      kit.getPredictionMock = vi.fn();
    },
  } as ReplicateMockKit<TPrediction, TCreateOptions>;
  return kit;
}

/** The transient poll failure the resilience suites inject. */
export const transientPollError = (): Error =>
  new Error(
    'Request to https://api.replicate.com/v1/predictions/p1 failed with status 500 Internal Server Error: {"detail":"Internal server error","status":500}',
  );

/**
 * Replace a provider's injected sleep with a fake-timer clock march, so the
 * poll deadline is real without the test waiting. Requires
 * vi.useFakeTimers() to be active.
 */
export const stubProviderSleep = (provider: unknown): void => {
  vi.spyOn(
    provider as { sleep: (ms: number) => Promise<void> },
    "sleep",
  ).mockImplementation(async (ms: number) => {
    vi.setSystemTime(Date.now() + ms);
  });
};
