import { describe, expect, it, vi } from "vitest";
import { resumePendingAttachments } from "../resumePendingAttachments";
import type { VideoJobAttachment, VideoJobRecord } from "../types";

/**
 * ADR-0022 decision 6: "its resumption after a worker restart".
 *
 * A clip that is durable but missing from its session after a refresh is the
 * exact failure the decision exists to end. The pending marker is written
 * before the append is attempted, so a worker that dies mid-append leaves a
 * durable statement of the debt; this is the pass that settles it.
 *
 * Seam: the store is a plain injected double — Firestore is the process-
 * external boundary, and nothing internal is vi.mock'd.
 */

const owedRecord = (): Record<string, unknown> => ({
  id: "job-1",
  mediaType: "video",
  status: "completed",
  prompt: "a cinematic sunset",
  promptVersionId: "version-1",
  mediaUrls: ["https://cdn.example.com/video.mp4"],
  ancestorGenerationId: "gen-pic-1",
  completedAt: "2026-09-17T00:00:00.000Z",
});

const pendingJob = (
  overrides: Partial<VideoJobRecord> = {},
): VideoJobRecord => ({
  id: "job-1",
  status: "completed",
  userId: "user-1",
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
    videoUrl: "https://cdn.example.com/video.mp4",
    contentType: "video/mp4",
  },
  attachment: {
    state: "pending",
    generationId: "job-1",
    sessionId: "session-1",
    promptVersionId: "version-1",
    record: owedRecord(),
    updatedAtMs: 2,
  },
  ...overrides,
});

const createStore = (jobs: VideoJobRecord[]) => ({
  findPendingAttachments: vi.fn(async () => jobs),
  setAttachment: vi.fn(
    async (_jobId: string, _attachment: VideoJobAttachment) => true,
  ),
});

const states = (store: ReturnType<typeof createStore>): string[] =>
  store.setAttachment.mock.calls.map((call) => call[1].state);

describe("resumePendingAttachments", () => {
  it("re-sends the exact record the dead worker owed, under the same take identity", async () => {
    const store = createStore([pendingJob()]);
    const appendGenerationToVersion = vi.fn(async () => undefined);

    const result = await resumePendingAttachments({
      jobStore: store as never,
      sessionService: { appendGenerationToVersion },
    });

    expect(result).toEqual({ scanned: 1, attached: 1, failed: 0 });
    expect(appendGenerationToVersion).toHaveBeenCalledWith(
      "user-1",
      "session-1",
      "version-1",
      // Byte-for-byte the record built at completion — including completedAt,
      // which a rebuild would have moved. A retry is not a second take.
      owedRecord(),
    );
    expect(states(store).at(-1)).toBe("attached");
  });

  it("leaves a still-failing attachment recorded as failed rather than retrying forever", async () => {
    const store = createStore([pendingJob()]);
    const appendGenerationToVersion = vi
      .fn()
      .mockRejectedValue(new Error("firestore still unavailable"));

    const result = await resumePendingAttachments({
      jobStore: store as never,
      sessionService: { appendGenerationToVersion },
    });

    expect(result).toEqual({ scanned: 1, attached: 0, failed: 1 });
    // `failed` is not swept again — the creator owns the retry from here.
    expect(states(store).at(-1)).toBe("failed");
    const last = store.setAttachment.mock.calls.at(
      -1,
    )![1] as VideoJobAttachment;
    expect(last.reason).toContain("firestore still unavailable");
    expect(last.record).toEqual(owedRecord());
  });

  it("never touches the generation outcome: no credit surface is reachable from here", async () => {
    // The resumer is constructed with exactly two collaborators. There is no
    // credit service, no job-status writer, and no provider — so "an
    // attachment retry never invokes refund logic" is true by construction,
    // not by discipline.
    const store = createStore([pendingJob()]);
    const appendGenerationToVersion = vi
      .fn()
      .mockRejectedValue(new Error("firestore still unavailable"));

    await resumePendingAttachments({
      jobStore: store as never,
      sessionService: { appendGenerationToVersion },
    });

    expect(Object.keys(store)).toEqual([
      "findPendingAttachments",
      "setAttachment",
    ]);
  });

  it("is a no-op when nothing is owed", async () => {
    const store = createStore([]);
    const appendGenerationToVersion = vi.fn(async () => undefined);

    const result = await resumePendingAttachments({
      jobStore: store as never,
      sessionService: { appendGenerationToVersion },
    });

    expect(result).toEqual({ scanned: 0, attached: 0, failed: 0 });
    expect(appendGenerationToVersion).not.toHaveBeenCalled();
    expect(store.setAttachment).not.toHaveBeenCalled();
  });

  it("skips a pending job that names no session", async () => {
    const {
      sessionId: _sessionId,
      promptVersionId: _promptVersionId,
      ...withoutLineage
    } = pendingJob();
    const store = createStore([withoutLineage]);
    const appendGenerationToVersion = vi.fn(async () => undefined);

    const result = await resumePendingAttachments({
      jobStore: store as never,
      sessionService: { appendGenerationToVersion },
    });

    expect(result).toEqual({ scanned: 1, attached: 0, failed: 0 });
    expect(appendGenerationToVersion).not.toHaveBeenCalled();
  });
});
