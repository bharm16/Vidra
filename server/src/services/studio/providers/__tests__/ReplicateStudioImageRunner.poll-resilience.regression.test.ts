import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import * as fc from "fast-check";
import {
  ReplicateStudioImageRunner,
  type StudioImageCall,
} from "../ReplicateStudioImageRunner";
import {
  createReplicateMockKit,
  stubProviderSleep,
  transientPollError,
} from "@services/__tests__/replicateTestKit";

/**
 * Regression: a transient Replicate poll failure killed an in-flight studio
 * image call.
 *
 * The studio runner mirrors the Schnell/Kontext create→poll→URL protocol but
 * shipped without the poll-loop resilience guard, so a one-off
 * `predictions.get` rejection mid-poll surfaced to the creator as a failed
 * turn while the prediction was still healthy on Replicate's side. The create
 * path already retries rate limits; the poll loop had zero tolerance.
 *
 * Invariant: for any in-flight prediction, transient poll failures never fail
 * the call — polling continues until the deadline, and only a terminal
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
  output: unknown;
  error?: string | null;
};

const kit = createReplicateMockKit<
  ReplicatePrediction,
  { model: string; input: Record<string, unknown> }
>();

vi.mock("replicate", () => ({
  default: vi.fn(() => kit.instance),
}));

const IMAGE_URL = "https://images.example.com/output.webp";

const baseCall = (): StudioImageCall => ({
  model: "recraft-ai/recraft-v4.1",
  input: { prompt: "a logo", aspect_ratio: "1:1" },
  userId: "user-1",
  timeoutMs: 60_000,
});

describe("regression: transient poll failures never fail an in-flight studio call", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    kit.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("survives any transient poll-failure burst that resolves before the deadline", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 3 }),
        fc.integer({ min: 1, max: 3 }),
        async (healthyPollsBefore, failureBurst) => {
          kit.reset();

          const runner = new ReplicateStudioImageRunner({ apiToken: "token" });
          stubProviderSleep(runner);

          kit.createPredictionMock.mockResolvedValueOnce({
            id: "pred-1",
            status: "processing",
            output: null,
          });
          for (let i = 0; i < healthyPollsBefore; i += 1) {
            kit.getPredictionMock.mockResolvedValueOnce({
              id: "pred-1",
              status: "processing",
              output: null,
            });
          }
          for (let i = 0; i < failureBurst; i += 1) {
            kit.getPredictionMock.mockRejectedValueOnce(transientPollError());
          }
          kit.getPredictionMock.mockResolvedValue({
            id: "pred-1",
            status: "succeeded",
            output: IMAGE_URL,
          });

          const result = await runner.run(baseCall());

          expect(result.imageUrl).toBe(IMAGE_URL);
        },
      ),
      { numRuns: 20 },
    );
  });

  it("still fails at the deadline when every poll fails — transient tolerance is not infinite retry", async () => {
    const runner = new ReplicateStudioImageRunner({ apiToken: "token" });
    stubProviderSleep(runner);

    kit.createPredictionMock.mockResolvedValueOnce({
      id: "pred-1",
      status: "processing",
      output: null,
    });
    kit.getPredictionMock.mockRejectedValue(transientPollError());

    await expect(runner.run(baseCall())).rejects.toThrow(/timed out|failed/i);

    expect(kit.getPredictionMock.mock.calls.length).toBeGreaterThan(1);
  });

  it("a terminal prediction status still ends the call immediately", async () => {
    const runner = new ReplicateStudioImageRunner({ apiToken: "token" });
    stubProviderSleep(runner);

    kit.createPredictionMock.mockResolvedValueOnce({
      id: "pred-1",
      status: "processing",
      output: null,
    });
    kit.getPredictionMock
      .mockRejectedValueOnce(transientPollError())
      .mockResolvedValueOnce({
        id: "pred-1",
        status: "failed",
        output: null,
        error: "GPU crashed",
      });

    await expect(runner.run(baseCall())).rejects.toThrow(
      "Image call failed: GPU crashed",
    );

    expect(kit.getPredictionMock).toHaveBeenCalledTimes(2);
  });
});
