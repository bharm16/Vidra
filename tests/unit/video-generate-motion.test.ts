import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { scheduleInlineMock } = vi.hoisted(() => ({
  scheduleInlineMock: vi.fn(),
}));

vi.mock("@routes/preview/inlineProcessor", () => ({
  scheduleInlineVideoPreviewProcessing: scheduleInlineMock,
}));

import { createVideoGenerateHandler } from "@routes/preview/handlers/videoGenerate";
import { runSupertestOrSkip } from "./test-helpers/supertestSafeRequest";

// Adapter: delegates the atomic method to the existing createJob + reserveCredits mocks
// so tests written against the legacy 2-step API keep their assertions intact.
const buildAtomicReservation = (
  createJob: ReturnType<typeof vi.fn>,
): ((
  input: Record<string, unknown>,
  deps: {
    creditService: {
      reserveCredits: (uid: string, cost: number) => Promise<boolean>;
    };
    cost: number;
  },
) => Promise<
  { reserved: true; job: unknown } | { reserved: false; reason: string }
>) => {
  return async (input, { creditService, cost }) => {
    const ok = await creditService.reserveCredits(input.userId as string, cost);
    if (!ok) {
      return { reserved: false, reason: "insufficient_credits" };
    }
    const job = await createJob(input);
    return { reserved: true, job };
  };
};

describe("videoGenerate prompt truth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queues the prompt verbatim — motion params never splice into it", async () => {
    const createJobMock = vi.fn(async (payload: Record<string, unknown>) => ({
      id: "job-1",
      status: "queued",
      ...payload,
    }));

    const handler = createVideoGenerateHandler({
      videoGenerationService: {
        getModelAvailability: () => ({
          available: true,
          resolvedModelId: "sora-2",
        }),
        getAvailabilityReport: () => ({ availableModels: [] }),
      } as never,
      videoJobStore: {
        createJob: createJobMock,
        createJobWithReservation: buildAtomicReservation(createJobMock),
      } as never,
      userCreditService: {
        reserveCredits: vi.fn(async () => true),
        refundCredits: vi.fn(async () => true),
      } as never,
      keyframeService: null as never,
      faceSwapService: null as never,
      assetService: null as never,
    });

    const app = express();
    app.use((req, _res, next) => {
      (req as express.Request & { user?: { uid?: string } }).user = {
        uid: "user-123",
      };
      next();
    });
    app.use(express.json());
    app.post("/preview/video/generate", handler);

    const response = await runSupertestOrSkip(() =>
      request(app)
        .post("/preview/video/generate")
        .send({
          prompt: "A cinematic shot of a runner at dawn.",
          model: "sora-2",
          generationParams: {
            camera_motion_id: "pan_left",
            subject_motion: "running steadily toward the horizon",
          },
        }),
    );
    if (!response) return;

    expect(response.status).toBe(202);
    expect(createJobMock).toHaveBeenCalledTimes(1);

    const jobPayload = createJobMock.mock.calls[0]?.[0] as
      | { request?: { prompt?: string } }
      | undefined;
    const prompt = jobPayload?.request?.prompt ?? "";

    // ADR-0010 truth: the queued prompt is byte-for-byte the input; motion
    // params (camera_motion_id / subject_motion) are never spliced in as text.
    expect(prompt).toBe("A cinematic shot of a runner at dawn.");
    expect(prompt).not.toContain("Camera motion:");
    expect(prompt).not.toContain("Subject motion:");
  });
});
