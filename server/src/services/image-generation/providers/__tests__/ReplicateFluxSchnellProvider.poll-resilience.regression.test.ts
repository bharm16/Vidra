import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockedFunction,
} from "vitest";
import * as fc from "fast-check";
import { ReplicateFluxSchnellProvider } from "../ReplicateFluxSchnellProvider";

/**
 * Regression: a transient Replicate poll failure killed an in-flight frame
 * generation.
 *
 * Observed live (2026-08-01, golden-path run): predictions.get returned a
 * one-off 500 mid-poll and the whole generation surfaced to the creator as
 * "Couldn't create a frame" — while the prediction itself was still healthy
 * on Replicate's side. The create path already retries rate limits; the poll
 * loop had zero tolerance.
 *
 * Invariant: for any in-flight prediction, transient poll failures never fail
 * the generation — polling continues until the deadline, and only a terminal
 * prediction status (failed/canceled) or deadline expiry ends it.
 */

type PredictionStatus =
  | "starting"
  | "processing"
  | "succeeded"
  | "failed"
  | "canceled";

type ReplicatePrediction = {
  id: string;
  status: PredictionStatus;
  output: string | string[] | null | undefined;
  error?: string | null;
  logs?: string | null;
};

let createPredictionMock: MockedFunction<
  (params: unknown) => Promise<ReplicatePrediction>
>;
let getPredictionMock: MockedFunction<
  (id: string) => Promise<ReplicatePrediction>
>;
let replicateInstance: {
  predictions: {
    create: typeof createPredictionMock;
    get: typeof getPredictionMock;
  };
};

vi.mock("replicate", () => ({
  default: vi.fn(() => replicateInstance),
}));

const IMAGE_URL = "https://images.example.com/output.webp";

const transientPollError = () =>
  new Error(
    'Request to https://api.replicate.com/v1/predictions/p1 failed with status 500 Internal Server Error: {"detail":"Internal server error","status":500}',
  );

const stubSleep = (provider: ReplicateFluxSchnellProvider): void => {
  vi.spyOn(
    provider as unknown as { sleep: (ms: number) => Promise<void> },
    "sleep",
  ).mockImplementation(async (ms: number) => {
    // Fake timers are active: march the clock forward so the poll deadline
    // is real without the test waiting.
    vi.setSystemTime(Date.now() + ms);
  });
};

describe("regression: transient poll failures never fail an in-flight prediction", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    createPredictionMock = vi.fn();
    getPredictionMock = vi.fn();
    replicateInstance = {
      predictions: {
        create: createPredictionMock,
        get: getPredictionMock,
      },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("survives any transient poll-failure burst that resolves before the deadline", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Healthy "processing" polls before the blip, and the blip's length.
        fc.integer({ min: 0, max: 3 }),
        fc.integer({ min: 1, max: 3 }),
        async (healthyPollsBefore, failureBurst) => {
          createPredictionMock = vi.fn();
          getPredictionMock = vi.fn();
          replicateInstance = {
            predictions: {
              create: createPredictionMock,
              get: getPredictionMock,
            },
          };

          const provider = new ReplicateFluxSchnellProvider({
            apiToken: "token",
          });
          stubSleep(provider);

          createPredictionMock.mockResolvedValueOnce({
            id: "pred-1",
            status: "processing",
            output: null,
          });
          for (let i = 0; i < healthyPollsBefore; i += 1) {
            getPredictionMock.mockResolvedValueOnce({
              id: "pred-1",
              status: "processing",
              output: null,
            });
          }
          for (let i = 0; i < failureBurst; i += 1) {
            getPredictionMock.mockRejectedValueOnce(transientPollError());
          }
          getPredictionMock.mockResolvedValue({
            id: "pred-1",
            status: "succeeded",
            output: IMAGE_URL,
          });

          const result = await provider.generatePreview({
            prompt: "a lighthouse keeper reading by lamplight",
            userId: "user-1",
          });

          expect(result.imageUrl).toBe(IMAGE_URL);
        },
      ),
      { numRuns: 20 },
    );
  });

  it("still fails at the deadline when every poll fails — transient tolerance is not infinite retry", async () => {
    const provider = new ReplicateFluxSchnellProvider({ apiToken: "token" });
    stubSleep(provider);

    createPredictionMock.mockResolvedValueOnce({
      id: "pred-1",
      status: "processing",
      output: null,
    });
    getPredictionMock.mockRejectedValue(transientPollError());

    await expect(
      provider.generatePreview({
        prompt: "a lighthouse keeper reading by lamplight",
        userId: "user-1",
      }),
    ).rejects.toThrow(/timed out|failed/i);

    // The loop kept polling through the failures instead of dying on the
    // first one.
    expect(getPredictionMock.mock.calls.length).toBeGreaterThan(1);
  });

  it("a terminal prediction status still ends the generation immediately", async () => {
    const provider = new ReplicateFluxSchnellProvider({ apiToken: "token" });
    stubSleep(provider);

    createPredictionMock.mockResolvedValueOnce({
      id: "pred-1",
      status: "processing",
      output: null,
    });
    getPredictionMock
      .mockRejectedValueOnce(transientPollError())
      .mockResolvedValueOnce({
        id: "pred-1",
        status: "failed",
        output: null,
        error: "GPU crashed",
      });

    await expect(
      provider.generatePreview({
        prompt: "a lighthouse keeper reading by lamplight",
        userId: "user-1",
      }),
    ).rejects.toThrow("Image generation failed: GPU crashed");

    expect(getPredictionMock).toHaveBeenCalledTimes(2);
  });
});
