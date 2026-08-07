import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VideoJobRecord } from "@services/video-generation/jobs/types";

/**
 * Pin for the paid-content durability invariant (owner directive: "a user
 * should never not be able to view and act upon any generated content they
 * pay for").
 *
 * A completed render is copied from the provider into durable user-owned
 * storage (users/{uid}/generations/…) as a REQUIRED step before the job may
 * complete — the 24h retention sweeper only ever cleans the staging
 * namespace, so the durable copy is the artifact the user keeps. If that
 * copy fails, the job must FAIL and refund, never complete pointing at the
 * staging object that dies within a day.
 *
 * This pins existing behavior (processVideoJob's required-storage stage)
 * against the tempting future refactor of making the copy "best-effort" for
 * latency — which would silently turn every paid clip into a 24h rental.
 */

const mocks = vi.hoisted(() => ({
  loggerDebug: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
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

// refundGuard is NOT mocked. It takes userCreditService as a parameter, so the
// refund is observable through the injected credit service below — the real
// guard runs, and the assertion watches the effect rather than the collaborator.
// Substituting the module here would have pinned "we called refundWithGuard"
// instead of "the user got their credits back".

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

const createClaimedJob = (): VideoJobRecord => ({
  id: "job-1",
  status: "processing",
  userId: "user-1",
  request: {
    prompt: "a cinematic sunset",
    options: { model: "sora-2" },
  },
  creditsReserved: 5,
  attempts: 3,
  maxAttempts: 3,
  createdAtMs: Date.now(),
  updatedAtMs: Date.now(),
});

const FAKE_RESULT = {
  videoUrl: "https://cdn.example.com/video.mp4",
  assetId: "asset-123",
  status: "completed" as const,
};

async function flushMicrotasks(rounds = 10): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
  }
}

describe("regression: a paid render either lands durably or the job fails and refunds", () => {
  let jobStore: MockJobStore;
  let generateVideo: ReturnType<typeof vi.fn>;
  let userCreditService: { refundCredits: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    jobStore = createMockJobStore();
    generateVideo = vi.fn().mockResolvedValue(FAKE_RESULT);
    // Truthy: refundWithGuard returns on the first attempt, so the real guard
    // runs its success path without retry sleeps under fake timers.
    userCreditService = { refundCredits: vi.fn().mockResolvedValue(true) };
    jobStore.claimJob.mockResolvedValue(createClaimedJob());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function invokeProcessor(storageService: {
    saveFromUrl: ReturnType<typeof vi.fn>;
  }): Promise<void> {
    const { scheduleInlineVideoPreviewProcessing } = await import(
      "../inlineProcessor"
    );
    scheduleInlineVideoPreviewProcessing({
      jobId: "job-1",
      requestId: "req-1",
      videoJobStore: jobStore as never,
      videoGenerationService: { generateVideo } as never,
      userCreditService: userCreditService as never,
      storageService: storageService as never,
    });

    vi.advanceTimersByTime(300);
    await flushMicrotasks();
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(500);
      await flushMicrotasks();
    }
  }

  it("a failed durable copy fails the job and refunds — it never completes against staging", async () => {
    const storageService = {
      saveFromUrl: vi
        .fn()
        .mockRejectedValue(new Error("GCS write unavailable")),
    };

    await invokeProcessor(storageService);

    // The provider rendered, but the artifact never landed durably — the job
    // must not read as a success the user paid for and cannot keep.
    expect(jobStore.markCompleted).not.toHaveBeenCalled();
    expect(jobStore.markFailed).toHaveBeenCalled();
    expect(userCreditService.refundCredits).toHaveBeenCalledWith(
      "user-1",
      5,
      expect.objectContaining({ refundKey: expect.any(String) }),
    );
  });

  it("a completed job's record always carries the durable storage path", async () => {
    const storageService = {
      saveFromUrl: vi.fn().mockResolvedValue({
        storagePath: "users/user-1/generations/1785600000000-abc.mp4",
        viewUrl: "https://storage.example.com/signed/abc.mp4",
        expiresAt: "2099-01-01T00:00:00.000Z",
        sizeBytes: 1024000,
      }),
    };

    await invokeProcessor(storageService);

    expect(storageService.saveFromUrl).toHaveBeenCalledWith(
      "user-1",
      FAKE_RESULT.videoUrl,
      "generation",
      expect.any(Object),
    );
    expect(jobStore.markCompleted).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({
        storagePath: "users/user-1/generations/1785600000000-abc.mp4",
      }),
    );
  });
});
