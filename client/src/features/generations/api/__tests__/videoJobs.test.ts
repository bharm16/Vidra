import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { waitForVideoJob } from "../videoJobs";
import { getVideoPreviewStatus } from "@/features/preview/api/previewApi";
import type { VideoJobStatusResponse } from "@/features/preview/api/previewApi";

vi.mock("@/features/preview/api/previewApi", () => ({
  getVideoPreviewStatus: vi.fn(),
}));

const mockStatusResponse = (
  overrides: Partial<VideoJobStatusResponse> = {},
): VideoJobStatusResponse => ({
  success: true,
  jobId: "job-123",
  status: "processing",
  ...overrides,
});

describe("waitForVideoJob", () => {
  let abortController: AbortController;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    abortController = new AbortController();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("error handling", () => {
    it("throws when status response indicates failure", async () => {
      vi.mocked(getVideoPreviewStatus).mockResolvedValue(
        mockStatusResponse({ success: false, error: "Invalid job ID" }),
      );

      // Use Promise.all to advance timers and catch rejection simultaneously
      await expect(
        Promise.all([
          waitForVideoJob("job-123", abortController.signal),
          vi.advanceTimersByTimeAsync(0),
        ]),
      ).rejects.toThrow("Invalid job ID");
    });

    it("uses message field when error field is missing", async () => {
      vi.mocked(getVideoPreviewStatus).mockResolvedValue({
        ...mockStatusResponse({ success: false }),
        message: "Job not found",
      } as VideoJobStatusResponse);

      await expect(
        Promise.all([
          waitForVideoJob("job-123", abortController.signal),
          vi.advanceTimersByTimeAsync(0),
        ]),
      ).rejects.toThrow("Job not found");
    });

    it("throws fallback message when no error details provided", async () => {
      vi.mocked(getVideoPreviewStatus).mockResolvedValue(
        mockStatusResponse({ success: false }),
      );

      await expect(
        Promise.all([
          waitForVideoJob("job-123", abortController.signal),
          vi.advanceTimersByTimeAsync(0),
        ]),
      ).rejects.toThrow("Failed to fetch video job status");
    });

    it("throws when video generation failed", async () => {
      vi.mocked(getVideoPreviewStatus).mockResolvedValue(
        mockStatusResponse({
          status: "failed",
          error: "GPU allocation failed",
        }),
      );

      await expect(
        Promise.all([
          waitForVideoJob("job-123", abortController.signal),
          vi.advanceTimersByTimeAsync(0),
        ]),
      ).rejects.toThrow("GPU allocation failed");
    });

    it("throws fallback message when generation failed without error details", async () => {
      vi.mocked(getVideoPreviewStatus).mockResolvedValue(
        mockStatusResponse({ status: "failed" }),
      );

      await expect(
        Promise.all([
          waitForVideoJob("job-123", abortController.signal),
          vi.advanceTimersByTimeAsync(0),
        ]),
      ).rejects.toThrow("Video generation failed");
    });

    it("throws when completed but no URL returned", async () => {
      vi.mocked(getVideoPreviewStatus).mockResolvedValue(
        mockStatusResponse({ status: "completed" }),
      );

      await expect(
        Promise.all([
          waitForVideoJob("job-123", abortController.signal),
          vi.advanceTimersByTimeAsync(0),
        ]),
      ).rejects.toThrow("Video generation completed but no URL was returned");
    });

    it("throws timeout error after MAX_WAIT_MS (20 minutes)", async () => {
      const MAX_WAIT_MS = 20 * 60 * 1000;
      // Active phase: 6 min at 2s intervals = 180 polls
      // Extended phase: 14 min at 8s intervals = 105 polls
      // Total: ~285 polls, but we can just advance the full 20 min
      const CHUNK_MS = 30_000; // Advance in 30s chunks for speed
      const chunks = Math.ceil(MAX_WAIT_MS / CHUNK_MS) + 1;

      vi.mocked(getVideoPreviewStatus).mockResolvedValue(
        mockStatusResponse({ status: "processing" }),
      );

      const promise = waitForVideoJob("job-123", abortController.signal);

      let caught = false;
      const catchPromise = promise.catch((error: Error) => {
        caught = true;
        expect(error.message).toBe("Timed out waiting for video generation");
      });

      for (let i = 0; i < chunks && !caught; i++) {
        await vi.advanceTimersByTimeAsync(CHUNK_MS);
      }

      await catchPromise;
      expect(caught).toBe(true);
    }, 30000); // Increase test timeout for 20-min simulation
  });

  describe("edge cases", () => {
    it("returns null immediately when signal is already aborted", async () => {
      abortController.abort();

      const result = await waitForVideoJob("job-123", abortController.signal);

      expect(result).toBeNull();
      expect(getVideoPreviewStatus).not.toHaveBeenCalled();
    });

    it("returns null when aborted during polling", async () => {
      let callCount = 0;
      vi.mocked(getVideoPreviewStatus).mockImplementation(async () => {
        callCount++;
        if (callCount === 2) {
          abortController.abort();
        }
        return mockStatusResponse({ status: "processing" });
      });

      const promise = waitForVideoJob("job-123", abortController.signal);

      // First poll
      await vi.advanceTimersByTimeAsync(0);
      // Second poll (abort happens here)
      await vi.advanceTimersByTimeAsync(2000);

      const result = await promise;
      expect(result).toBeNull();
    });

    it("polls every 2 seconds until completion", async () => {
      let callCount = 0;
      vi.mocked(getVideoPreviewStatus).mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          return mockStatusResponse({ status: "processing" });
        }
        return mockStatusResponse({
          status: "completed",
          videoUrl: "https://example.com/video.mp4",
        });
      });

      const promise = waitForVideoJob("job-123", abortController.signal);

      // Initial call
      await vi.advanceTimersByTimeAsync(0);
      expect(getVideoPreviewStatus).toHaveBeenCalledTimes(1);

      // After 2 seconds
      await vi.advanceTimersByTimeAsync(2000);
      expect(getVideoPreviewStatus).toHaveBeenCalledTimes(2);

      // After another 2 seconds
      await vi.advanceTimersByTimeAsync(2000);
      expect(getVideoPreviewStatus).toHaveBeenCalledTimes(3);

      const result = await promise;
      expect(result).toMatchObject({
        videoUrl: "https://example.com/video.mp4",
      });
    });
  });

  describe("adaptive polling", () => {
    it("widens interval to 8s after 6 minutes", async () => {
      vi.mocked(getVideoPreviewStatus).mockResolvedValue(
        mockStatusResponse({ status: "processing" }),
      );

      const promise = waitForVideoJob("job-123", abortController.signal);

      // Advance past the active phase (6 minutes).
      // At exactly 360s, elapsedMs === ACTIVE_PHASE_MS (strict >), so one more
      // 2s poll fires before the transition to 8s.
      const ACTIVE_PHASE_MS = 6 * 60 * 1_000;
      const CHUNK_MS = 2_000;
      const activeChunks = ACTIVE_PHASE_MS / CHUNK_MS;
      for (let i = 0; i < activeChunks; i++) {
        await vi.advanceTimersByTimeAsync(CHUNK_MS);
      }

      // Fire the last 2s timer (elapsedMs=360s, still uses 2s interval)
      // and then the transition poll at 362s (elapsedMs>360s → sets 8s timer)
      await vi.advanceTimersByTimeAsync(CHUNK_MS);

      const callsAfterTransition = vi.mocked(getVideoPreviewStatus).mock.calls
        .length;

      // In extended phase: advance 2s — should NOT trigger a poll (interval is 8s)
      await vi.advanceTimersByTimeAsync(2_000);
      expect(
        vi.mocked(getVideoPreviewStatus).mock.calls.length -
          callsAfterTransition,
      ).toBe(0);

      // Advance 6s more (total 8s since transition poll) — should trigger exactly 1 poll
      await vi.advanceTimersByTimeAsync(6_000);
      expect(
        vi.mocked(getVideoPreviewStatus).mock.calls.length -
          callsAfterTransition,
      ).toBe(1);

      abortController.abort();
      await promise;
    }, 30000);

    it("invokes onProgress callback with server progress", async () => {
      let callCount = 0;
      vi.mocked(getVideoPreviewStatus).mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          return mockStatusResponse({
            status: "processing",
            progress: callCount * 30,
          });
        }
        return mockStatusResponse({
          status: "completed",
          videoUrl: "https://example.com/video.mp4",
          progress: 100,
        });
      });

      const onProgress = vi.fn();
      const promise = waitForVideoJob(
        "job-123",
        abortController.signal,
        onProgress,
      );

      await vi.advanceTimersByTimeAsync(0); // First poll
      await vi.advanceTimersByTimeAsync(2000); // Second poll
      await vi.advanceTimersByTimeAsync(2000); // Third poll (completes)

      await promise;

      expect(onProgress).toHaveBeenCalledTimes(3);
      expect(onProgress).toHaveBeenCalledWith({
        status: "processing",
        progress: 30,
      });
      expect(onProgress).toHaveBeenCalledWith({
        status: "processing",
        progress: 60,
      });
      expect(onProgress).toHaveBeenCalledWith({
        status: "completed",
        progress: 100,
      });
    });

    it("does not throw at 6 minutes — continues polling in extended phase", async () => {
      // Active phase: 181 polls over 362s (2s interval).
      // Extended phase: 8s interval. After 182 polls, completing on poll 190
      // would be at roughly 362 + (8 * 8) = 426s ≈ 7.1 min.
      let callCount = 0;
      vi.mocked(getVideoPreviewStatus).mockImplementation(async () => {
        callCount++;
        if (callCount > 185) {
          return mockStatusResponse({
            status: "completed",
            videoUrl: "https://example.com/video.mp4",
          });
        }
        return mockStatusResponse({ status: "processing" });
      });

      const promise = waitForVideoJob("job-123", abortController.signal);

      // Advance through active phase in 30s chunks (faster than 2s chunks)
      const ACTIVE_MS = 6 * 60 * 1_000 + 4_000; // 364s — past transition
      const CHUNK_MS = 30_000;
      const activeChunks = Math.ceil(ACTIVE_MS / CHUNK_MS);
      for (let i = 0; i < activeChunks; i++) {
        await vi.advanceTimersByTimeAsync(CHUNK_MS);
      }

      // Continue in extended phase with 8s chunks until completion
      for (let i = 0; i < 20; i++) {
        await vi.advanceTimersByTimeAsync(8_000);
        if (callCount > 185) break;
      }

      const result = await promise;
      expect(result).toMatchObject({
        videoUrl: "https://example.com/video.mp4",
      });
    }, 30000);
  });

  describe("core behavior", () => {
    it("returns video URL when generation completes", async () => {
      vi.mocked(getVideoPreviewStatus).mockResolvedValue(
        mockStatusResponse({
          status: "completed",
          videoUrl: "https://storage.example.com/videos/output.mp4",
        }),
      );

      const promise = waitForVideoJob("job-456", abortController.signal);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toMatchObject({
        videoUrl: "https://storage.example.com/videos/output.mp4",
      });
      expect(getVideoPreviewStatus).toHaveBeenCalledWith("job-456");
    });

    it("continues polling while status is queued or processing", async () => {
      let callIndex = 0;
      vi.mocked(getVideoPreviewStatus).mockImplementation(async () => {
        const responses: VideoJobStatusResponse[] = [
          mockStatusResponse({ status: "queued" }),
          mockStatusResponse({ status: "processing" }),
          mockStatusResponse({
            status: "completed",
            videoUrl: "https://example.com/done.mp4",
          }),
        ];
        return responses[Math.min(callIndex++, responses.length - 1)]!;
      });

      const promise = waitForVideoJob("job-789", abortController.signal);

      await vi.advanceTimersByTimeAsync(0); // First call
      await vi.advanceTimersByTimeAsync(2000); // Second call
      await vi.advanceTimersByTimeAsync(2000); // Third call

      const result = await promise;
      expect(result).toMatchObject({
        videoUrl: "https://example.com/done.mp4",
      });
      expect(callIndex).toBe(3);
    });
  });

  describe("session attachment terminality (ADR-0022 decision 6)", () => {
    it("keeps polling while the clip's attachment is still pending", async () => {
      vi.mocked(getVideoPreviewStatus)
        .mockResolvedValueOnce(
          mockStatusResponse({
            status: "completed",
            videoUrl: "https://cdn.example.com/clip.mp4",
            attachment: {
              state: "pending",
              generationId: "job-123",
              sessionId: "session-1",
              promptVersionId: "v-1",
            },
          }),
        )
        .mockResolvedValue(
          mockStatusResponse({
            status: "completed",
            videoUrl: "https://cdn.example.com/clip.mp4",
            attachment: {
              state: "attached",
              generationId: "job-123",
              sessionId: "session-1",
              promptVersionId: "v-1",
            },
          }),
        );

      const [result] = await Promise.all([
        waitForVideoJob("job-123", abortController.signal),
        vi.advanceTimersByTimeAsync(5_000),
      ]);

      // "completed" is the render's answer, not the job's: a take the session
      // never received would render as a node that vanishes on refresh.
      expect(getVideoPreviewStatus).toHaveBeenCalledTimes(2);
      expect(result?.attachment?.state).toBe("attached");
    });

    it("resolves a failed attachment as made-but-not-saved rather than throwing", async () => {
      vi.mocked(getVideoPreviewStatus).mockResolvedValue(
        mockStatusResponse({
          status: "completed",
          videoUrl: "https://cdn.example.com/clip.mp4",
          attachment: {
            state: "failed",
            generationId: "job-123",
            sessionId: "session-1",
            promptVersionId: "v-1",
            reason: "firestore unavailable",
          },
        }),
      );

      const [result] = await Promise.all([
        waitForVideoJob("job-123", abortController.signal),
        vi.advanceTimersByTimeAsync(0),
      ]);

      // The clip is real and the creator paid for it — a failed attachment is
      // not a failed generation.
      expect(result?.videoUrl).toBe("https://cdn.example.com/clip.mp4");
      expect(result?.attachment?.state).toBe("failed");
    });

    it("stops waiting on an attachment that never resolves, and says so", async () => {
      vi.mocked(getVideoPreviewStatus).mockResolvedValue(
        mockStatusResponse({
          status: "completed",
          videoUrl: "https://cdn.example.com/clip.mp4",
          attachment: {
            state: "pending",
            generationId: "job-123",
            sessionId: "session-1",
            promptVersionId: "v-1",
          },
        }),
      );

      const [result] = await Promise.all([
        waitForVideoJob("job-123", abortController.signal),
        vi.advanceTimersByTimeAsync(90_000),
      ]);

      // Bounded by the attachment budget, not by the render-sized timeout.
      expect(result?.attachment?.state).toBe("pending");
    });

    it("is terminal on completion when the job names no session", async () => {
      vi.mocked(getVideoPreviewStatus).mockResolvedValue(
        mockStatusResponse({
          status: "completed",
          videoUrl: "https://cdn.example.com/clip.mp4",
        }),
      );

      const [result] = await Promise.all([
        waitForVideoJob("job-123", abortController.signal),
        vi.advanceTimersByTimeAsync(0),
      ]);

      expect(getVideoPreviewStatus).toHaveBeenCalledTimes(1);
      expect(result?.attachment).toBeUndefined();
    });
  });
});
