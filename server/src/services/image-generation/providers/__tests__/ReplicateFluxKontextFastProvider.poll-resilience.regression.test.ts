import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import * as fc from "fast-check";
import { ReplicateFluxKontextFastProvider } from "../ReplicateFluxKontextFastProvider";
import {
  createReplicateMockKit,
  stubProviderSleep,
  transientPollError,
} from "../../../__tests__/replicateTestKit";

/**
 * Regression: a transient Replicate poll failure killed an in-flight edit.
 *
 * Kontext Fast reimplemented the Schnell create→poll→URL protocol but shipped
 * without Schnell's poll-loop resilience guard, so a one-off `predictions.get`
 * rejection mid-poll aborted an otherwise-healthy prediction (the same live
 * failure fixed for Schnell on 2026-08-01). The create path already retries
 * rate limits; the poll loop had zero tolerance.
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

const kit = createReplicateMockKit<ReplicatePrediction, unknown>();

vi.mock("replicate", () => ({
  default: vi.fn(() => kit.instance),
}));

const IMAGE_URL = "https://images.example.com/output.webp";
const INPUT_IMAGE_URL = "https://images.example.com/base.webp";

describe("regression: transient poll failures never fail an in-flight Kontext edit", () => {
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

          const provider = new ReplicateFluxKontextFastProvider({
            apiToken: "token",
          });
          stubProviderSleep(provider);

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

          const result = await provider.generatePreview({
            prompt: "swap the sky for dusk",
            userId: "user-1",
            inputImageUrl: INPUT_IMAGE_URL,
          });

          expect(result.imageUrl).toBe(IMAGE_URL);
        },
      ),
      { numRuns: 20 },
    );
  });

  it("still fails at the deadline when every poll fails — transient tolerance is not infinite retry", async () => {
    const provider = new ReplicateFluxKontextFastProvider({
      apiToken: "token",
    });
    stubProviderSleep(provider);

    kit.createPredictionMock.mockResolvedValueOnce({
      id: "pred-1",
      status: "processing",
      output: null,
    });
    kit.getPredictionMock.mockRejectedValue(transientPollError());

    await expect(
      provider.generatePreview({
        prompt: "swap the sky for dusk",
        userId: "user-1",
        inputImageUrl: INPUT_IMAGE_URL,
      }),
    ).rejects.toThrow(/timed out|failed/i);

    expect(kit.getPredictionMock.mock.calls.length).toBeGreaterThan(1);
  });

  it("a terminal prediction status still ends the generation immediately", async () => {
    const provider = new ReplicateFluxKontextFastProvider({
      apiToken: "token",
    });
    stubProviderSleep(provider);

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

    await expect(
      provider.generatePreview({
        prompt: "swap the sky for dusk",
        userId: "user-1",
        inputImageUrl: INPUT_IMAGE_URL,
      }),
    ).rejects.toThrow("Image generation failed: GPU crashed");

    expect(kit.getPredictionMock).toHaveBeenCalledTimes(2);
  });
});
