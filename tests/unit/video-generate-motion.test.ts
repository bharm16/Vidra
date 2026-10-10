import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { asyncHandler } from "@middleware/asyncHandler";
import { createVideoGenerateHandler } from "@routes/preview/handlers/videoGenerate";
import type { VideoJobRecord } from "@services/video-generation/runtime/types";
import type { VideoJobStore } from "@services/video-generation/runtime/VideoJobStore";
import type { RequestIdempotencyService } from "@services/admission/idempotency/RequestIdempotencyService";
import { InMemoryIdempotencyService } from "../integration/helpers/cross-mode/boundaryDoubles";

/** Public HTTP prompt truth, with external persistence/provider ports controlled. */
describe("videoGenerate prompt truth in free validation", () => {
  it("queues visible words verbatim; motion metadata never inserts hidden prose", async () => {
    const receipts = new InMemoryIdempotencyService();
    let queued: VideoJobRecord | null = null;
    const store = {
      createJobWithReceipt: async (
        input: Parameters<VideoJobStore["createJobWithReceipt"]>[0],
        deps: Parameters<VideoJobStore["createJobWithReceipt"]>[1],
      ): Promise<{
        job: VideoJobRecord;
        snapshot: ReturnType<typeof deps.buildSnapshot>;
      }> => {
        const job: VideoJobRecord = {
          ...input,
          id: "verbatim-clip",
          status: "queued",
          attempts: 0,
          maxAttempts: 3,
          createdAtMs: Date.now(),
          updatedAtMs: Date.now(),
        };
        const snapshot = deps.buildSnapshot(job);
        await receipts.markCompleted({
          recordId: deps.recordId,
          snapshot,
        });
        queued = job;
        return { job, snapshot };
      },
      // Background processing is outside this assertion; the real atomic
      // adapter and inline worker are exercised by video-generate.contract.
      claimJob: async (): Promise<null> => null,
    };
    const handler = createVideoGenerateHandler({
      videoGenerationService: {
        getModelAvailability: () => ({
          available: true,
          resolvedModelId: "google/veo-3",
        }),
      } as never,
      videoJobStore: store as unknown as VideoJobStore,
      requestIdempotencyService:
        receipts as unknown as RequestIdempotencyService,
    });
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as express.Request & { user?: { uid: string } }).user = {
        uid: "creator-a",
      };
      next();
    });
    app.post("/video", asyncHandler(handler));
    const response = await request(app)
      .post("/video")
      .set("Idempotency-Key", "verbatim-words")
      .send({
        prompt: "A cinematic shot of a runner at dawn.",
        model: "google/veo-3",
        generationParams: {
          camera_motion_id: "pan_left",
          subject_motion: "running steadily toward the horizon",
        },
      });
    expect(response.status).toBe(202);
    const job = queued as VideoJobRecord | null;
    expect(job?.request.prompt).toBe("A cinematic shot of a runner at dawn.");
    expect(job?.request.prompt).not.toContain("Camera motion:");
    expect(job?.request.prompt).not.toContain("Subject motion:");
    expect(job?.creditsReserved).toBe(0);
  });
});
