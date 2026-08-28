import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from "vitest";
import {
  ReplicateStudioImageRunner,
  StudioCallError,
  type StudioImageCall,
} from "../ReplicateStudioImageRunner";
import { createReplicateMockKit } from "@services/__tests__/replicateTestKit";

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

const baseCall = (): StudioImageCall => ({
  model: "recraft-ai/recraft-v4.1",
  input: { prompt: "a logo", aspect_ratio: "1:1" },
  userId: "user-1",
  timeoutMs: 60_000,
});

describe("ReplicateStudioImageRunner", () => {
  beforeEach(() => {
    kit.reset();
    vi.clearAllMocks();
  });

  it("throws a 503 StudioCallError when no token is configured", async () => {
    const runner = new ReplicateStudioImageRunner({});
    await expect(runner.run(baseCall())).rejects.toMatchObject({
      statusCode: 503,
    });
  });

  it("returns the image URL when the prediction succeeds immediately", async () => {
    const runner = new ReplicateStudioImageRunner({ apiToken: "token" });
    kit.createPredictionMock.mockResolvedValue({
      id: "p1",
      status: "succeeded",
      output: "https://replicate.delivery/out.webp",
    });

    const result = await runner.run(baseCall());
    expect(result.imageUrl).toBe("https://replicate.delivery/out.webp");
    expect(kit.createPredictionMock).toHaveBeenCalledWith({
      model: "recraft-ai/recraft-v4.1",
      input: { prompt: "a logo", aspect_ratio: "1:1" },
    });
  });

  it("polls until the prediction succeeds", async () => {
    const runner = new ReplicateStudioImageRunner({ apiToken: "token" });
    vi.spyOn(
      runner as unknown as { sleep: (ms: number) => Promise<void> },
      "sleep",
    ).mockResolvedValue(undefined);
    kit.createPredictionMock.mockResolvedValue({
      id: "p2",
      status: "processing",
      output: null,
    });
    kit.getPredictionMock
      .mockResolvedValueOnce({ id: "p2", status: "processing", output: null })
      .mockResolvedValueOnce({
        id: "p2",
        status: "succeeded",
        output: ["https://replicate.delivery/out2.webp"],
      });

    const result = await runner.run(baseCall());
    expect(result.imageUrl).toBe("https://replicate.delivery/out2.webp");
    expect(kit.getPredictionMock).toHaveBeenCalledTimes(2);
  });

  it("fails the call when the prediction reports failed", async () => {
    const runner = new ReplicateStudioImageRunner({ apiToken: "token" });
    kit.createPredictionMock.mockResolvedValue({
      id: "p3",
      status: "failed",
      output: null,
      error: "NSFW content detected",
    });

    await expect(runner.run(baseCall())).rejects.toMatchObject({
      message: expect.stringContaining("NSFW content detected"),
      statusCode: 500,
    });
  });

  it("maps 402 provider errors so the chat can surface them (never silent)", async () => {
    const runner = new ReplicateStudioImageRunner({ apiToken: "token" });
    kit.createPredictionMock.mockRejectedValue(
      new Error('402 {"detail": "Insufficient credit"}'),
    );

    await expect(runner.run(baseCall())).rejects.toMatchObject({
      message: "Insufficient credit",
      statusCode: 402,
    });
  });

  it("retries rate-limited creates then maps to 429 when exhausted", async () => {
    const runner = new ReplicateStudioImageRunner({ apiToken: "token" });
    const sleepSpy = vi
      .spyOn(
        runner as unknown as { sleep: (ms: number) => Promise<void> },
        "sleep",
      )
      .mockResolvedValue(undefined);
    kit.createPredictionMock.mockRejectedValue(
      new Error('429 {"detail": "Slow down", "retry_after": 0}'),
    );

    await expect(runner.run(baseCall())).rejects.toMatchObject({
      message: "Slow down",
      statusCode: 429,
    });
    // 1 initial + 2 retries
    expect(kit.createPredictionMock).toHaveBeenCalledTimes(3);
    expect(sleepSpy).toHaveBeenCalled();
  });

  it("fails with a timeout when the deadline passes while processing", async () => {
    const runner = new ReplicateStudioImageRunner({ apiToken: "token" });
    vi.spyOn(
      runner as unknown as { sleep: (ms: number) => Promise<void> },
      "sleep",
    ).mockResolvedValue(undefined);
    kit.createPredictionMock.mockResolvedValue({
      id: "p4",
      status: "processing",
      output: null,
    });
    kit.getPredictionMock.mockResolvedValue({
      id: "p4",
      status: "processing",
      output: null,
    });

    const call = { ...baseCall(), timeoutMs: 1 };
    await expect(runner.run(call)).rejects.toMatchObject({
      message: expect.stringContaining("timed out"),
    });
  });

  it("wraps unknown failures as StudioCallError with status 500", async () => {
    const runner = new ReplicateStudioImageRunner({ apiToken: "token" });
    kit.createPredictionMock.mockRejectedValue(new Error("boom"));

    const error = await runner.run(baseCall()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StudioCallError);
    expect((error as StudioCallError).statusCode).toBe(500);
  });
});
