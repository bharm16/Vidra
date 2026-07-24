import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  type MockedFunction,
} from "vitest";
import {
  ReplicateStudioImageRunner,
  StudioCallError,
  type StudioImageCall,
} from "../ReplicateStudioImageRunner";

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

let createPredictionMock: MockedFunction<
  (params: {
    model: string;
    input: Record<string, unknown>;
  }) => Promise<ReplicatePrediction>
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

const baseCall = (): StudioImageCall => ({
  model: "recraft-ai/recraft-v4.1",
  input: { prompt: "a logo", aspect_ratio: "1:1" },
  userId: "user-1",
  timeoutMs: 60_000,
});

describe("ReplicateStudioImageRunner", () => {
  beforeEach(() => {
    createPredictionMock = vi.fn();
    getPredictionMock = vi.fn();
    replicateInstance = {
      predictions: {
        create: createPredictionMock,
        get: getPredictionMock,
      },
    };
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
    createPredictionMock.mockResolvedValue({
      id: "p1",
      status: "succeeded",
      output: "https://replicate.delivery/out.webp",
    });

    const result = await runner.run(baseCall());
    expect(result.imageUrl).toBe("https://replicate.delivery/out.webp");
    expect(createPredictionMock).toHaveBeenCalledWith({
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
    createPredictionMock.mockResolvedValue({
      id: "p2",
      status: "processing",
      output: null,
    });
    getPredictionMock
      .mockResolvedValueOnce({ id: "p2", status: "processing", output: null })
      .mockResolvedValueOnce({
        id: "p2",
        status: "succeeded",
        output: ["https://replicate.delivery/out2.webp"],
      });

    const result = await runner.run(baseCall());
    expect(result.imageUrl).toBe("https://replicate.delivery/out2.webp");
    expect(getPredictionMock).toHaveBeenCalledTimes(2);
  });

  it("fails the call when the prediction reports failed", async () => {
    const runner = new ReplicateStudioImageRunner({ apiToken: "token" });
    createPredictionMock.mockResolvedValue({
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
    createPredictionMock.mockRejectedValue(
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
    createPredictionMock.mockRejectedValue(
      new Error('429 {"detail": "Slow down", "retry_after": 0}'),
    );

    await expect(runner.run(baseCall())).rejects.toMatchObject({
      message: "Slow down",
      statusCode: 429,
    });
    // 1 initial + 2 retries
    expect(createPredictionMock).toHaveBeenCalledTimes(3);
    expect(sleepSpy).toHaveBeenCalled();
  });

  it("fails with a timeout when the deadline passes while processing", async () => {
    const runner = new ReplicateStudioImageRunner({ apiToken: "token" });
    vi.spyOn(
      runner as unknown as { sleep: (ms: number) => Promise<void> },
      "sleep",
    ).mockResolvedValue(undefined);
    createPredictionMock.mockResolvedValue({
      id: "p4",
      status: "processing",
      output: null,
    });
    getPredictionMock.mockResolvedValue({
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
    createPredictionMock.mockRejectedValue(new Error("boom"));

    const error = await runner.run(baseCall()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StudioCallError);
    expect((error as StudioCallError).statusCode).toBe(500);
  });
});
