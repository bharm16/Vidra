import { describe, expect, it, vi } from "vitest";
import type { VideoGenerationResult } from "@services/video-generation/types";
import type { VideoJobRecord } from "../types";
import { processVideoJob } from "../processVideoJob";

const mocks = vi.hoisted(() => ({
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  buildRefundKey: vi.fn(
    (parts: Array<string | number>) => `refund-${parts.join("-")}`,
  ),
  refundWithGuard: vi.fn().mockResolvedValue(true),
  saveFromUrl: vi.fn(),
}));

vi.mock("@infrastructure/Logger", () => ({
  logger: {
    child: () => ({
      info: mocks.loggerInfo,
      warn: mocks.loggerWarn,
      error: mocks.loggerError,
      debug: vi.fn(),
    }),
  },
}));

vi.mock("@services/credits/refundGuard", () => ({
  buildRefundKey: mocks.buildRefundKey,
  refundWithGuard: mocks.refundWithGuard,
}));

vi.mock("@server/utils/RetryPolicy", () => ({
  RetryPolicy: {
    execute: async <T>(
      fn: () => Promise<T>,
      options?: { maxRetries?: number },
    ): Promise<T> => {
      const maxRetries = options?.maxRetries ?? 2;
      let lastError: Error | null = null;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await fn();
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
        }
      }
      throw lastError;
    },
  },
}));

const createJob = (overrides?: Partial<VideoJobRecord>): VideoJobRecord => ({
  id: "job-42",
  status: "processing",
  userId: "user-1",
  request: {
    prompt: "a cinematic prompt",
    options: { model: "sora-2" },
  },
  creditsReserved: 7,
  attempts: 1,
  maxAttempts: 3,
  createdAtMs: Date.now(),
  updatedAtMs: Date.now(),
  ...overrides,
});

const generationResult: VideoGenerationResult = {
  assetId: "asset-42",
  videoUrl: "https://provider.example.com/video-42.mp4",
  contentType: "video/mp4",
  inputMode: "t2v",
};

const storagePayload = {
  storagePath: "users/user-1/generation/video-42.mp4",
  viewUrl: "https://cdn.example.com/view/video-42.mp4",
  expiresAt: "2026-05-01T00:00:00.000Z",
  sizeBytes: 1234,
  contentType: "video/mp4",
  createdAt: "2026-05-01T00:00:00.000Z",
};

const makeStore = () => ({
  markCompleted: vi.fn().mockResolvedValue(true),
  markFailed: vi.fn().mockResolvedValue(true),
  requeueForRetry: vi.fn().mockResolvedValue(true),
  enqueueDeadLetter: vi.fn().mockResolvedValue(undefined),
  renewLease: vi.fn().mockResolvedValue(true),
  setProviderResult: vi.fn().mockResolvedValue(true),
});

const runPipeline = (
  job: VideoJobRecord,
  extras: {
    generateVideo?: ReturnType<typeof vi.fn>;
    appendGenerationToVersion?: ReturnType<typeof vi.fn>;
    store?: ReturnType<typeof makeStore>;
  } = {},
) => {
  mocks.saveFromUrl.mockResolvedValue(storagePayload);
  const generateVideo =
    extras.generateVideo ?? vi.fn().mockResolvedValue(generationResult);
  const jobStore = extras.store ?? makeStore();
  const appendGenerationToVersion =
    extras.appendGenerationToVersion ?? vi.fn().mockResolvedValue(undefined);

  return {
    result: processVideoJob(job, {
      jobStore: jobStore as never,
      videoGenerationService: { generateVideo } as never,
      storageService: { saveFromUrl: mocks.saveFromUrl } as never,
      userCreditService: {
        getBalance: vi.fn().mockResolvedValue(100),
      } as never,
      workerId: "worker-a",
      leaseMs: 60_000,
      sessionService: { appendGenerationToVersion },
      dlqSource: "worker-terminal",
      refundReason: "video job worker failed",
      logPrefix: "Video job",
    }),
    jobStore,
    appendGenerationToVersion,
    generateVideo,
  };
};

describe("processVideoJob session-persist regression (ISSUE-12)", () => {
  it("calls appendGenerationToVersion after markCompleted succeeds when sessionId + promptVersionId are set", async () => {
    vi.clearAllMocks();
    const job = createJob({
      sessionId: "session-7",
      promptVersionId: "v-3",
    });
    const { result, appendGenerationToVersion } = runPipeline(job);
    await result;

    expect(appendGenerationToVersion).toHaveBeenCalledTimes(1);
    const [userId, sessionId, promptVersionId, generation] =
      appendGenerationToVersion.mock.calls[0]!;
    expect(userId).toBe("user-1");
    expect(sessionId).toBe("session-7");
    expect(promptVersionId).toBe("v-3");
    expect(generation).toMatchObject({
      id: "job-42",
      status: "completed",
      mediaUrls: ["https://provider.example.com/video-42.mp4"],
      promptVersionId: "v-3",
    });
  });

  it("sets the clip's ancestorGenerationId from the job's sourceGenerationId (M5 2b)", async () => {
    vi.clearAllMocks();
    const job = createJob({
      sessionId: "session-7",
      promptVersionId: "v-3",
      sourceGenerationId: "pic-source-9",
    });
    const { result, appendGenerationToVersion } = runPipeline(job);
    await result;

    const generation = appendGenerationToVersion.mock.calls[0]![3];
    // ADR-0013: the clip names its source picture, yielding the picture→clip edge.
    expect(generation).toMatchObject({
      id: "job-42",
      ancestorGenerationId: "pic-source-9",
    });
  });

  it("roots a clip at null when no sourceGenerationId is provided", async () => {
    vi.clearAllMocks();
    const job = createJob({ sessionId: "session-7", promptVersionId: "v-3" });
    const { result, appendGenerationToVersion } = runPipeline(job);
    await result;

    const generation = appendGenerationToVersion.mock.calls[0]![3];
    expect(generation.ancestorGenerationId).toBeNull();
  });

  it("does not call appendGenerationToVersion when sessionId is missing (legacy async flow)", async () => {
    vi.clearAllMocks();
    const job = createJob({ promptVersionId: "v-3" });
    const { result, appendGenerationToVersion } = runPipeline(job);
    await result;

    expect(appendGenerationToVersion).not.toHaveBeenCalled();
  });

  it("does not call appendGenerationToVersion when promptVersionId is missing", async () => {
    vi.clearAllMocks();
    const job = createJob({ sessionId: "session-7" });
    const { result, appendGenerationToVersion } = runPipeline(job);
    await result;

    expect(appendGenerationToVersion).not.toHaveBeenCalled();
  });

  it("still marks the job completed when session persist throws (soft-fail, no refund)", async () => {
    vi.clearAllMocks();
    const job = createJob({
      sessionId: "session-7",
      promptVersionId: "v-3",
    });
    const appendGenerationToVersion = vi
      .fn()
      .mockRejectedValue(new Error("firestore unavailable"));
    const { result, jobStore } = runPipeline(job, {
      appendGenerationToVersion,
    });
    await result;

    expect(jobStore.markCompleted).toHaveBeenCalledTimes(1);
    expect(mocks.refundWithGuard).not.toHaveBeenCalled();
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.stringContaining("session persist failed"),
      expect.any(Error),
      expect.objectContaining({
        jobId: "job-42",
        sessionId: "session-7",
        promptVersionId: "v-3",
      }),
    );
  });

  it("does not call appendGenerationToVersion when markCompleted fails (nothing to append)", async () => {
    vi.clearAllMocks();
    const job = createJob({
      sessionId: "session-7",
      promptVersionId: "v-3",
    });
    const store = makeStore();
    store.markCompleted = vi.fn().mockResolvedValue(false);
    const { result, appendGenerationToVersion } = runPipeline(job, { store });
    await result;

    expect(store.markCompleted).toHaveBeenCalled();
    expect(appendGenerationToVersion).not.toHaveBeenCalled();
    // refundWithGuard should fire because completion ultimately failed
    expect(mocks.refundWithGuard).toHaveBeenCalled();
  });
});
