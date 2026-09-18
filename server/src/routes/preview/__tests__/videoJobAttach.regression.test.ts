import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createVideoJobAttachHandler } from "../handlers/videoJobAttach";
import type {
  VideoJobAttachment,
  VideoJobRecord,
} from "@services/video-generation/jobs/types";

/**
 * ADR-0022 decision 6 — the negative path.
 *
 * "An attachment retry is explicitly not a generation retry: it reuses the same
 * media and the same take identity, never reruns generation, never changes the
 * job's generation outcome, and never invokes refund logic."
 *
 * The neighbouring pin, inlineProcessor.durable-copy.regression.test.ts, holds
 * the opposite policy for the durable storage copy: that step MUST fail the job
 * and refund. The two sit one step apart and are easy to conflate, which is why
 * each is written down. The difference is whether the creator still has what
 * they paid for: a missing durable copy means they do not, and a missing
 * session row means they do.
 *
 * Seam: a real Express app over the real handler, with plain injected doubles
 * for the job store (Firestore) and the session append. No vi.mock of anything
 * internal.
 */

const OWNER = "user-1";

const completedJob = (
  overrides: Partial<VideoJobRecord> = {},
): VideoJobRecord => ({
  id: "job-1",
  status: "completed",
  userId: OWNER,
  sessionId: "session-1",
  promptVersionId: "version-1",
  request: { prompt: "a cinematic sunset", options: { model: "sora-2" } },
  creditsReserved: 5,
  attempts: 1,
  maxAttempts: 3,
  createdAtMs: 1,
  updatedAtMs: 2,
  result: {
    assetId: "asset-123",
    videoUrl: "https://cdn.example.com/clip.mp4",
    contentType: "video/mp4",
    storagePath: "generation/user-1/abc.mp4",
  },
  attachment: {
    state: "failed",
    generationId: "job-1",
    sessionId: "session-1",
    promptVersionId: "version-1",
    reason: "firestore unavailable",
    record: {
      id: "job-1",
      mediaType: "video",
      status: "completed",
      prompt: "a cinematic sunset",
      promptVersionId: "version-1",
      mediaUrls: ["https://cdn.example.com/clip.mp4"],
      ancestorGenerationId: null,
      completedAt: "2026-09-17T00:00:00.000Z",
    },
    updatedAtMs: 2,
  },
  ...overrides,
});

/** Every verb that could reopen the job, so "untouched" is assertable. */
const createJobStore = (job: VideoJobRecord | null) => ({
  getJob: vi.fn(async () => job),
  setAttachment: vi.fn(
    async (_jobId: string, _attachment: VideoJobAttachment) => true,
  ),
  markCompleted: vi.fn(async () => true),
  markFailed: vi.fn(async () => true),
  requeueForRetry: vi.fn(async () => true),
  enqueueDeadLetter: vi.fn(async () => undefined),
});

const createApp = (
  jobStore: ReturnType<typeof createJobStore>,
  appendGenerationToVersion: ReturnType<typeof vi.fn>,
  userId: string = OWNER,
): express.Express => {
  const app = express();
  app.use((req, _res, next) => {
    (req as express.Request & { user?: { uid?: string } }).user = {
      uid: userId,
    };
    next();
  });
  app.use(express.json());
  app.post(
    "/preview/video/jobs/:jobId/attach",
    createVideoJobAttachHandler({
      videoJobStore: jobStore as never,
      sessionService: { appendGenerationToVersion } as never,
    }),
  );
  return app;
};

const ATTACHMENT_SOURCES = [
  "../../../services/sessions/attachTakeToSession.ts",
  "../../../services/video-generation/jobs/attachJobToSession.ts",
  "../../../services/video-generation/jobs/resumePendingAttachments.ts",
  "../handlers/videoJobAttach.ts",
] as const;

describe("regression: retrying a clip attachment is not a generation retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("re-attaches the same record under the same take identity", async () => {
    const jobStore = createJobStore(completedJob());
    const appendGenerationToVersion = vi.fn(async () => undefined);

    const res = await request(
      createApp(jobStore, appendGenerationToVersion),
    ).post("/preview/video/jobs/job-1/attach");

    expect(res.status).toBe(200);
    expect(res.body?.attachment?.state).toBe("attached");
    expect(appendGenerationToVersion).toHaveBeenCalledWith(
      OWNER,
      "session-1",
      "version-1",
      // The record the job already held. Nothing about the clip travelled on
      // the request, so a retry cannot write a take the server did not make.
      expect.objectContaining({
        id: "job-1",
        completedAt: "2026-09-17T00:00:00.000Z",
      }),
    );
  });

  it("never reopens the job, whether the retry lands or not", async () => {
    for (const append of [
      vi.fn(async () => undefined),
      vi.fn().mockRejectedValue(new Error("firestore still unavailable")),
    ]) {
      const jobStore = createJobStore(completedJob());

      await request(createApp(jobStore, append)).post(
        "/preview/video/jobs/job-1/attach",
      );

      expect(jobStore.markCompleted).not.toHaveBeenCalled();
      expect(jobStore.markFailed).not.toHaveBeenCalled();
      expect(jobStore.requeueForRetry).not.toHaveBeenCalled();
      expect(jobStore.enqueueDeadLetter).not.toHaveBeenCalled();
    }
  });

  it("reports a still-failing attachment as failed, with a 200 and the clip intact", async () => {
    const jobStore = createJobStore(completedJob());
    const appendGenerationToVersion = vi
      .fn()
      .mockRejectedValue(new Error("firestore still unavailable"));

    const res = await request(
      createApp(jobStore, appendGenerationToVersion),
    ).post("/preview/video/jobs/job-1/attach");

    // Not a 500: the request did what it could, and the answer is the truth
    // about the take, not an error about the clip.
    expect(res.status).toBe(200);
    expect(res.body?.attachment?.state).toBe("failed");
    expect(jobStore.setAttachment.mock.calls.at(-1)![1].state).toBe("failed");
  });

  it("refuses a clip that has not finished rendering", async () => {
    const jobStore = createJobStore(completedJob({ status: "processing" }));

    const res = await request(
      createApp(
        jobStore,
        vi.fn(async () => undefined),
      ),
    ).post("/preview/video/jobs/job-1/attach");

    // 409, never a re-render: the generation outcome is not this route's.
    expect(res.status).toBe(409);
    expect(jobStore.setAttachment).not.toHaveBeenCalled();
  });

  it("refuses another creator's job", async () => {
    const jobStore = createJobStore(completedJob());
    const appendGenerationToVersion = vi.fn(async () => undefined);

    const res = await request(
      createApp(jobStore, appendGenerationToVersion, "intruder"),
    ).post("/preview/video/jobs/job-1/attach");

    expect(res.status).toBe(403);
    expect(appendGenerationToVersion).not.toHaveBeenCalled();
  });

  it("cannot reach refund logic: no module on the attachment path imports it", () => {
    // Asserted against the source because the guarantee is structural. A test
    // that only watches a double would go quiet the day someone reaches for
    // the refund guard "just for the storage case".
    const here = path.dirname(fileURLToPath(import.meta.url));
    for (const relative of ATTACHMENT_SOURCES) {
      const source = readFileSync(path.resolve(here, relative), "utf8");
      expect(source).not.toContain("refundGuard");
      expect(source).not.toContain("userCreditService");
    }
  });
});
