/**
 * Regression: runVideoGenerateIntake owns the credit-bearing video-generation
 * workflow that was lifted out of the videoGenerate route handler. These tests
 * pin the invariants the extraction is responsible for — the ones a route-level
 * supertest would not isolate:
 *
 *   1. Compensating refunds are issued BEFORE the intake returns an error, on
 *      every mid-workflow failure path (so the route's markFailed/lock-release
 *      always runs after the ledger is made whole — no double-charge on retry).
 *   2. The success result is { ok: true, status: 202 } whose body is the
 *      dual-shaped { success, data, ...payload } object, and that EXACT body is
 *      handed to markCompleted as the replay snapshot.
 *   3. A throw during reservation refunds all three buckets (video + keyframe +
 *      face-swap) and surfaces a classified error result.
 *
 * The workflow was previously inline in videoGenerate.ts; relocating it to this
 * deep module is what makes these invariants testable without an HTTP round-trip.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createVideoRefundManagerMock,
  runVideoPreprocessingMock,
  buildVideoRequestPlanMock,
  createModelUnavailableErrorMock,
  scheduleInlineVideoPreviewProcessingMock,
  resolveCapabilityModelIdMock,
} = vi.hoisted(() => ({
  createVideoRefundManagerMock: vi.fn(),
  runVideoPreprocessingMock: vi.fn(),
  buildVideoRequestPlanMock: vi.fn(),
  createModelUnavailableErrorMock: vi.fn(),
  scheduleInlineVideoPreviewProcessingMock: vi.fn(),
  resolveCapabilityModelIdMock: vi.fn(),
}));

vi.mock("../refundManager", () => ({
  createVideoRefundManager: createVideoRefundManagerMock,
}));

vi.mock("../preprocessing", () => ({
  runVideoPreprocessing: runVideoPreprocessingMock,
}));

vi.mock("../requestPlan", () => ({
  buildVideoRequestPlan: buildVideoRequestPlanMock,
  createModelUnavailableError: createModelUnavailableErrorMock,
}));

vi.mock("../../../inlineProcessor", () => ({
  scheduleInlineVideoPreviewProcessing:
    scheduleInlineVideoPreviewProcessingMock,
}));

vi.mock("@services/capabilities/modelProviders", () => ({
  resolveModelId: resolveCapabilityModelIdMock,
}));

import { runVideoGenerateIntake } from "../intake";
import type { VideoGenerateIntakeArgs } from "../intake";

const loggerMock = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

function makeRefunds() {
  const ledger = { videoCost: 0, keyframeCost: 2, faceSwapCost: 0 };
  return {
    ledger,
    setVideoCost: vi.fn((amount: number) => {
      ledger.videoCost = amount;
    }),
    setKeyframeCost: vi.fn(),
    setFaceSwapCost: vi.fn(),
    refundVideoCredits: vi.fn().mockResolvedValue(undefined),
    refundKeyframeCredits: vi.fn().mockResolvedValue(undefined),
    refundFaceSwapCredits: vi.fn().mockResolvedValue(undefined),
  };
}

const fakePlan = {
  normalizedParams: null,
  promptWithMotion: "a cat, cinematic",
  motionContext: {
    cameraMotionId: null,
    cameraMotionText: null,
    subjectMotion: null,
  },
  normalizedMotionMeta: {
    hasCameraMotion: false,
    cameraMotionId: null,
    hasSubjectMotion: false,
    subjectMotionLength: 0,
  },
  promptLengthBeforeMotion: 5,
  promptLengthAfterMotion: 5,
  motionGuidanceAppended: false,
  disablePromptExtend: false,
  options: { promptExtend: null },
  videoCost: 5,
};

function makeArgs(overrides: {
  refunds: ReturnType<typeof makeRefunds>;
  videoGenerationService?: Partial<{
    getModelAvailability: ReturnType<typeof vi.fn>;
    getAvailabilitySnapshot: ReturnType<typeof vi.fn>;
  }>;
  videoJobStore?: Partial<{
    createJobWithReservation: ReturnType<typeof vi.fn>;
  }>;
  requestIdempotencyService?: {
    markCompleted: ReturnType<typeof vi.fn>;
  } | null;
}): VideoGenerateIntakeArgs {
  return {
    payload: { prompt: "a cat", model: "wan-2.2", aspectRatio: "16:9" },
    userId: "user-1",
    requestId: "req-1",
    cleanedPrompt: "a cat",
    autoKeyframe: true,
    faceSwapAlreadyApplied: false,
    promptWasStripped: false,
    rawMotionMeta: {
      hasCameraMotion: false,
      cameraMotionId: null,
      hasSubjectMotion: false,
      subjectMotionLength: 0,
    },
    services: {
      videoGenerationService: {
        getModelAvailability: vi.fn().mockReturnValue({
          available: true,
          resolvedModelId: "wan-2.2",
        }),
        getAvailabilitySnapshot: vi
          .fn()
          .mockReturnValue({ availableModelIds: [] }),
        ...overrides.videoGenerationService,
      },
      videoJobStore: {
        createJobWithReservation: vi.fn().mockResolvedValue({
          reserved: true,
          job: { id: "job-1", status: "queued" },
        }),
        ...overrides.videoJobStore,
      },
      userCreditService: { getBalance: vi.fn().mockResolvedValue(42) },
      keyframeService: null,
      faceSwapService: null,
      assetService: null,
      storageService: null,
    } as never,
    idempotencyRecordId: "rec-1",
    requestIdempotencyService: (overrides.requestIdempotencyService === null
      ? null
      : (overrides.requestIdempotencyService ?? {
          markCompleted: vi.fn().mockResolvedValue(undefined),
        })) as never,
    log: loggerMock as never,
  };
}

describe("runVideoGenerateIntake", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runVideoPreprocessingMock.mockResolvedValue({
      resolvedStartImage: undefined,
      generatedKeyframeUrl: "https://example.com/kf.png",
      swappedImageUrl: null,
      characterAssetId: undefined,
    });
    buildVideoRequestPlanMock.mockReturnValue({ ok: true, value: fakePlan });
  });

  it("returns a 202 with the dual-shaped body and records it as the replay snapshot", async () => {
    const refunds = makeRefunds();
    createVideoRefundManagerMock.mockReturnValue(refunds);
    const markCompleted = vi.fn().mockResolvedValue(undefined);
    const args = makeArgs({
      refunds,
      requestIdempotencyService: { markCompleted },
    });

    const result = await runVideoGenerateIntake(args);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.status).toBe(202);

    // Dual-shaped body: payload nested under `data` AND spread at top level.
    expect(result.body.success).toBe(true);
    expect(result.body.data).toMatchObject({
      jobId: "job-1",
      status: "queued",
    });
    expect(result.body.jobId).toBe("job-1");
    // videoCost is only on the ledger AFTER a successful reservation.
    expect(refunds.setVideoCost).toHaveBeenCalledWith(5);
    expect(result.body.creditsReserved).toBe(5);
    expect(result.body.creditsDeducted).toBe(7); // 5 video + 2 keyframe + 0 face-swap

    // The exact response body is persisted as the idempotency replay snapshot.
    expect(markCompleted).toHaveBeenCalledWith({
      recordId: "rec-1",
      jobId: "job-1",
      snapshot: { statusCode: 202, body: result.body },
    });
  });

  it("refunds keyframe + face-swap BEFORE returning the model-unavailable error", async () => {
    const refunds = makeRefunds();
    createVideoRefundManagerMock.mockReturnValue(refunds);
    const unavailableError = {
      status: 503,
      payload: { error: "Model unavailable", code: "SERVICE_UNAVAILABLE" },
    };
    createModelUnavailableErrorMock.mockReturnValue(unavailableError);
    const markCompleted = vi.fn();

    const args = makeArgs({
      refunds,
      requestIdempotencyService: { markCompleted },
      videoGenerationService: {
        getModelAvailability: vi.fn().mockReturnValue({ available: false }),
      },
    });

    const result = await runVideoGenerateIntake(args);

    expect(refunds.refundKeyframeCredits).toHaveBeenCalled();
    expect(refunds.refundFaceSwapCredits).toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error");
    expect(result.error).toBe(unavailableError);
    // A failed workflow never records a success snapshot.
    expect(markCompleted).not.toHaveBeenCalled();
  });

  it("refunds all three buckets and classifies the error when reservation throws", async () => {
    const refunds = makeRefunds();
    createVideoRefundManagerMock.mockReturnValue(refunds);

    const args = makeArgs({
      refunds,
      videoJobStore: {
        createJobWithReservation: vi
          .fn()
          .mockRejectedValue(new Error("firestore down")),
      },
    });

    const result = await runVideoGenerateIntake(args);

    expect(refunds.refundVideoCredits).toHaveBeenCalled();
    expect(refunds.refundKeyframeCredits).toHaveBeenCalled();
    expect(refunds.refundFaceSwapCredits).toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error");
    expect(result.error.status).toBe(500);
    expect(result.error.payload.code).toBe("GENERATION_FAILED");
    expect(result.error.payload.details).toContain("firestore down");
  });
});
