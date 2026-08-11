import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VideoJobRecord } from "@services/video-generation/jobs/types";

const mocks = vi.hoisted(() => ({
  loggerDebug: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  buildRefundKey: vi.fn(
    (parts: Array<string | number>) => `refund-${parts.join("-")}`,
  ),
  refundWithGuard: vi.fn().mockResolvedValue(true),
}));

vi.mock("@infrastructure/Logger", () => {
  const childLogger = {
    debug: mocks.loggerDebug,
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
    child: () => childLogger,
  };
  return {
    logger: {
      debug: mocks.loggerDebug,
      info: mocks.loggerInfo,
      warn: mocks.loggerWarn,
      error: mocks.loggerError,
      child: () => childLogger,
    },
  };
});

vi.mock("@services/credits/refundGuard", () => ({
  buildRefundKey: mocks.buildRefundKey,
  refundWithGuard: mocks.refundWithGuard,
}));

// Passthrough mocks: resolve aliased paths so Vitest can load the real modules
vi.mock("@services/video-generation/jobs/classifyError", async () => {
  return await import("../../../services/video-generation/jobs/classifyError");
});
vi.mock("@services/video-generation/jobs/processVideoJob", async () => {
  return await import(
    "../../../services/video-generation/jobs/processVideoJob"
  );
});
vi.mock("@server/utils/RetryPolicy", async () => {
  return await import("../../../utils/RetryPolicy");
});
vi.mock("@server/utils/sleep", async () => {
  return await import("../../../utils/sleep");
});

interface MockJobStore {
  claimJob: ReturnType<typeof vi.fn>;
  markCompleted: ReturnType<typeof vi.fn>;
  markFailed: ReturnType<typeof vi.fn>;
  requeueForRetry: ReturnType<typeof vi.fn>;
  enqueueDeadLetter: ReturnType<typeof vi.fn>;
  renewLease: ReturnType<typeof vi.fn>;
  setProviderResult: ReturnType<typeof vi.fn>;
}

const createMockJobStore = (): MockJobStore => ({
  claimJob: vi.fn(),
  markCompleted: vi.fn().mockResolvedValue(true),
  markFailed: vi.fn().mockResolvedValue(true),
  requeueForRetry: vi.fn().mockResolvedValue(true),
  enqueueDeadLetter: vi.fn().mockResolvedValue(undefined),
  renewLease: vi.fn().mockResolvedValue(true),
  setProviderResult: vi.fn().mockResolvedValue(true),
});

const createClaimedJob = (
  overrides?: Partial<VideoJobRecord>,
): VideoJobRecord => ({
  id: "job-1",
  status: "processing",
  userId: "user-1",
  request: {
    prompt: "a cinematic sunset",
    options: { model: "sora-2" },
  },
  creditsReserved: 5,
  attempts: 1,
  maxAttempts: 3,
  createdAtMs: Date.now(),
  updatedAtMs: Date.now(),
  ...overrides,
});

const FAKE_RESULT = {
  videoUrl: "https://cdn.example.com/video.mp4",
  assetId: "asset-123",
  status: "completed" as const,
};

const FAKE_STORAGE_RESULT = {
  storagePath: "generation/user-1/abc.mp4",
  viewUrl: "https://storage.example.com/signed/abc.mp4",
  expiresAt: "2099-01-01T00:00:00.000Z",
  sizeBytes: 1024000,
};

/**
 * Helper: flush all pending microtasks (lets the async IIFE inside setTimeout run to completion).
 * Multiple rounds handle chained awaits.
 */
async function flushMicrotasks(rounds = 10): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
  }
}

describe("scheduleInlineVideoProcessing", () => {
  let jobStore: MockJobStore;
  let generateVideo: ReturnType<typeof vi.fn>;
  let storageService: { saveFromUrl: ReturnType<typeof vi.fn> };
  let userCreditService: Record<string, unknown>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    jobStore = createMockJobStore();
    generateVideo = vi.fn().mockResolvedValue(FAKE_RESULT);
    storageService = {
      saveFromUrl: vi.fn().mockResolvedValue(FAKE_STORAGE_RESULT),
    };
    userCreditService = { refundCredits: vi.fn() };

    // Default claim succeeds
    jobStore.claimJob.mockResolvedValue(createClaimedJob());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function invokeProcessor(overrides?: {
    jobId?: string;
    requestId?: string;
    claimResult?: VideoJobRecord | null;
    storage?: typeof storageService | null;
  }): Promise<void> {
    if (overrides?.claimResult !== undefined) {
      jobStore.claimJob.mockResolvedValue(overrides.claimResult);
    }

    const { scheduleInlineVideoProcessing } = await import(
      "../inlineProcessor"
    );
    scheduleInlineVideoProcessing({
      jobId: overrides?.jobId ?? "job-1",
      requestId: overrides?.requestId ?? "req-1",
      videoJobStore: jobStore as never,
      videoGenerationService: { generateVideo } as never,
      userCreditService: userCreditService as never,
      storageService:
        overrides?.storage !== undefined
          ? (overrides.storage as never)
          : (storageService as never),
    });

    // Advance past the 300ms setTimeout
    vi.advanceTimersByTime(300);
    await flushMicrotasks();

    // Drain any RetryPolicy backoff timers (100ms, 200ms, 400ms...)
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(500);
      await flushMicrotasks();
    }
  }

  it("claims job and completes successfully", async () => {
    await invokeProcessor();

    expect(jobStore.claimJob).toHaveBeenCalledWith(
      "job-1",
      "inline-preview-req-1",
      90000,
    );
    expect(generateVideo).toHaveBeenCalledWith(
      "a cinematic sunset",
      { model: "sora-2" },
      undefined,
    );
    expect(storageService.saveFromUrl).toHaveBeenCalled();
    expect(jobStore.markCompleted).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({
        storagePath: FAKE_STORAGE_RESULT.storagePath,
        viewUrl: FAKE_STORAGE_RESULT.viewUrl,
      }),
    );
  });

  it("skips processing when claim returns null", async () => {
    await invokeProcessor({ claimResult: null });

    expect(generateVideo).not.toHaveBeenCalled();
    expect(jobStore.markCompleted).not.toHaveBeenCalled();
  });

  // ── Heartbeat Tests ──────────────────────────────────────────────

  it("regression: inline-processor heartbeat prevents sweeper race", async () => {
    // Make generateVideo take a long time so we can observe heartbeat calls
    let resolveGeneration!: (value: typeof FAKE_RESULT) => void;
    generateVideo.mockReturnValue(
      new Promise((resolve) => {
        resolveGeneration = resolve;
      }),
    );

    const { scheduleInlineVideoProcessing } = await import(
      "../inlineProcessor"
    );
    scheduleInlineVideoProcessing({
      jobId: "job-1",
      requestId: "req-1",
      videoJobStore: jobStore as never,
      videoGenerationService: { generateVideo } as never,
      userCreditService: userCreditService as never,
      storageService: storageService as never,
    });

    // Advance past the 300ms setTimeout to start processing
    vi.advanceTimersByTime(300);
    await flushMicrotasks();

    // Heartbeat interval is leaseMs / 3 = 90000 / 3 = 30000ms
    expect(jobStore.renewLease).not.toHaveBeenCalled();

    // Advance 30s — first heartbeat fires
    vi.advanceTimersByTime(30000);
    await flushMicrotasks();
    expect(jobStore.renewLease).toHaveBeenCalledTimes(1);
    expect(jobStore.renewLease).toHaveBeenCalledWith(
      "job-1",
      "inline-preview-req-1",
      90000,
    );

    // Advance another 30s — second heartbeat
    vi.advanceTimersByTime(30000);
    await flushMicrotasks();
    expect(jobStore.renewLease).toHaveBeenCalledTimes(2);

    // Now resolve generation and let the processor finish
    resolveGeneration(FAKE_RESULT);
    await flushMicrotasks();

    expect(jobStore.markCompleted).toHaveBeenCalled();
  });

  it("heartbeat timer cleared on success", async () => {
    await invokeProcessor();

    // After success, advancing time should NOT produce more renewLease calls
    const callsBefore = jobStore.renewLease.mock.calls.length;
    vi.advanceTimersByTime(60000);
    await flushMicrotasks();
    expect(jobStore.renewLease.mock.calls.length).toBe(callsBefore);
  });

  it("heartbeat timer cleared on failure", async () => {
    generateVideo.mockRejectedValue(new Error("Provider exploded"));

    await invokeProcessor();

    // After failure, advancing time should NOT produce more renewLease calls
    const callsBefore = jobStore.renewLease.mock.calls.length;
    vi.advanceTimersByTime(60000);
    await flushMicrotasks();
    expect(jobStore.renewLease.mock.calls.length).toBe(callsBefore);
  });

  it("logs warning when heartbeat renewal returns false", async () => {
    jobStore.renewLease.mockResolvedValue(false);

    let resolveGeneration!: (value: typeof FAKE_RESULT) => void;
    generateVideo.mockReturnValue(
      new Promise((resolve) => {
        resolveGeneration = resolve;
      }),
    );

    const { scheduleInlineVideoProcessing } = await import(
      "../inlineProcessor"
    );
    scheduleInlineVideoProcessing({
      jobId: "job-1",
      requestId: "req-1",
      videoJobStore: jobStore as never,
      videoGenerationService: { generateVideo } as never,
      userCreditService: userCreditService as never,
      storageService: storageService as never,
    });

    vi.advanceTimersByTime(300);
    await flushMicrotasks();

    // Fire heartbeat
    vi.advanceTimersByTime(30000);
    await flushMicrotasks();

    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      "Inline preview job heartbeat skipped (lease may have been reclaimed)",
      expect.objectContaining({ jobId: "job-1" }),
    );

    resolveGeneration(FAKE_RESULT);
    await flushMicrotasks();
  });

  // ── Error Classification Tests ────────────────────────────────────

  it("regression: inline-processor timeout errors are retryable", async () => {
    generateVideo.mockRejectedValue(new Error("Request timed out after 300s"));

    await invokeProcessor();

    expect(jobStore.requeueForRetry).toHaveBeenCalledWith(
      "job-1",
      "inline-preview-req-1",
      expect.objectContaining({
        category: "timeout",
        retryable: true,
      }),
    );
    expect(jobStore.markFailed).not.toHaveBeenCalled();
    expect(mocks.refundWithGuard).not.toHaveBeenCalled();
  });

  it("validation errors classified as non-retryable trigger DLQ + refund", async () => {
    generateVideo.mockRejectedValue(
      new Error("Input invalid: bad aspect ratio"),
    );

    await invokeProcessor();

    expect(jobStore.requeueForRetry).not.toHaveBeenCalled();
    expect(jobStore.markFailed).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({
        category: "validation",
        retryable: false,
      }),
    );
    expect(jobStore.enqueueDeadLetter).toHaveBeenCalledWith(
      expect.objectContaining({ id: "job-1" }),
      expect.objectContaining({ category: "validation" }),
      "inline-terminal",
      expect.objectContaining({ creditsRefunded: true }),
    );
    expect(mocks.refundWithGuard).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        amount: 5,
        reason: "inline video preview failed",
      }),
    );
  });

  it("retryable error triggers requeue when attempts remain", async () => {
    jobStore.claimJob.mockResolvedValue(
      createClaimedJob({ attempts: 1, maxAttempts: 3 }),
    );
    generateVideo.mockRejectedValue(new Error("Provider returned 429"));

    await invokeProcessor();

    expect(jobStore.requeueForRetry).toHaveBeenCalledWith(
      "job-1",
      "inline-preview-req-1",
      expect.objectContaining({
        category: "provider",
        retryable: true,
      }),
    );
    expect(jobStore.markFailed).not.toHaveBeenCalled();
    expect(mocks.refundWithGuard).not.toHaveBeenCalled();
  });

  it("retryable error becomes terminal when max attempts reached", async () => {
    jobStore.claimJob.mockResolvedValue(
      createClaimedJob({ attempts: 3, maxAttempts: 3 }),
    );
    generateVideo.mockRejectedValue(new Error("Provider returned 429"));

    await invokeProcessor();

    expect(jobStore.requeueForRetry).not.toHaveBeenCalled();
    expect(jobStore.markFailed).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({ retryable: false }),
    );
    expect(jobStore.enqueueDeadLetter).toHaveBeenCalled();
    expect(mocks.refundWithGuard).toHaveBeenCalled();
  });

  it("storage service unavailable with retries remaining triggers requeue", async () => {
    // With attempts=1, maxAttempts=3, the "Storage service unavailable" error
    // is classified as provider/retryable (generic generation-stage error),
    // so it goes through the requeue path
    await invokeProcessor({ storage: null });

    expect(jobStore.requeueForRetry).toHaveBeenCalledWith(
      "job-1",
      "inline-preview-req-1",
      expect.objectContaining({
        category: "provider",
        retryable: true,
        stage: "generation",
      }),
    );
    expect(jobStore.markFailed).not.toHaveBeenCalled();
  });

  it("does not refund when markFailed returns false (status already changed)", async () => {
    jobStore.claimJob.mockResolvedValue(
      createClaimedJob({ attempts: 3, maxAttempts: 3 }),
    );
    generateVideo.mockRejectedValue(new Error("Input invalid: bad request"));
    jobStore.markFailed.mockResolvedValue(false);

    await invokeProcessor();

    expect(mocks.refundWithGuard).not.toHaveBeenCalled();
    expect(jobStore.enqueueDeadLetter).not.toHaveBeenCalled();
  });

  // ── markCompleted Retry + Refund Tests (Step 4) ───────────────────

  it("regression: inline markCompleted failure refunds credits", async () => {
    // markCompleted throws on all attempts (simulates Firestore errors)
    jobStore.markCompleted.mockRejectedValue(
      new Error("Firestore write failed"),
    );

    await invokeProcessor();

    // RetryPolicy calls markCompleted 3 times (1 initial + 2 retries)
    expect(jobStore.markCompleted.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(mocks.buildRefundKey).toHaveBeenCalledWith([
      "video-job",
      "job-1",
      "video",
    ]);
    // Credits refunded because the video exists in GCS but job was not marked
    expect(mocks.refundWithGuard).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        amount: 5,
        reason:
          "inline video preview failed markCompleted failed after retries",
      }),
    );
  });

  it("markCompleted returns false on all attempts triggers refund", async () => {
    // markCompleted returns false (status was changed by another worker)
    jobStore.markCompleted.mockResolvedValue(false);

    await invokeProcessor();

    expect(mocks.refundWithGuard).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        amount: 5,
      }),
    );
    expect(mocks.loggerError).toHaveBeenCalledWith(
      "Inline preview job completion failed — refunding credits",
      undefined,
      expect.objectContaining({
        storagePath: FAKE_STORAGE_RESULT.storagePath,
        recovery: "manual — asset exists at storagePath",
      }),
    );
  });

  it("markCompleted succeeds on retry after initial failure", async () => {
    // Fail first call, succeed on retry
    jobStore.markCompleted
      .mockRejectedValueOnce(new Error("Firestore temporary error"))
      .mockResolvedValueOnce(true);

    await invokeProcessor();

    expect(jobStore.markCompleted).toHaveBeenCalledTimes(2);
    // No refund needed — second attempt succeeded
    expect(mocks.refundWithGuard).not.toHaveBeenCalled();
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      "Inline preview job completed",
      expect.objectContaining({ jobId: "job-1" }),
    );
  });
});
