import { getVideoPreviewStatus } from "./previewApi";
import type { VideoJobStatus } from "./previewApi";

const POLL_INTERVAL_ACTIVE_MS = 2_000;
const POLL_INTERVAL_EXTENDED_MS = 8_000;
const ACTIVE_PHASE_MS = 6 * 60 * 1_000;
const DEFAULT_MAX_WAIT_MS = 20 * 60 * 1_000;

export interface PollJobStatusOptions {
  /** Maximum time (ms) to wait before giving up. Defaults to 20 minutes. */
  maxWaitMs?: number | undefined;
  /** Callback invoked after each successful poll with the current status. */
  onProgress?:
    | ((update: { status: VideoJobStatus; progress: number | null }) => void)
    | undefined;
}

export interface PollJobResult {
  videoUrl: string;
  storagePath?: string | undefined;
  viewUrl?: string | undefined;
  viewUrlExpiresAt?: string | undefined;
  assetId?: string | undefined;
  /** The i2v start frame — the clip's natural poster image. */
  startImageUrl?: string | undefined;
}

/**
 * Polls the video job status endpoint with two-tier timing:
 * - Active phase (first 6 min): polls every 2s
 * - Extended phase (after 6 min): polls every 8s
 *
 * Returns the completed result or throws on failure/timeout.
 */
export async function pollJobStatus(
  jobId: string,
  signal: AbortSignal,
  options?: PollJobStatusOptions,
): Promise<PollJobResult | null> {
  const maxWaitMs = options?.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const startTime = Date.now();

  while (true) {
    if (signal.aborted) return null;

    const status = await getVideoPreviewStatus(jobId);

    if (signal.aborted) return null;

    if (!status.success) {
      throw new Error(
        status.error || status.message || "Failed to fetch video job status",
      );
    }

    options?.onProgress?.({
      status: status.status,
      progress: status.progress ?? null,
    });

    // Adapt timeout based on server-reported single-attempt budget
    let effectiveMaxWait = maxWaitMs;
    if (status.serverTimeoutMs) {
      effectiveMaxWait = Math.max(
        Math.ceil(status.serverTimeoutMs * 1.2),
        maxWaitMs,
      );
    }

    if (status.status === "completed" && status.videoUrl) {
      return {
        videoUrl: status.videoUrl,
        ...(status.storagePath !== undefined
          ? { storagePath: status.storagePath }
          : {}),
        ...(status.viewUrl !== undefined ? { viewUrl: status.viewUrl } : {}),
        ...(status.viewUrlExpiresAt !== undefined
          ? { viewUrlExpiresAt: status.viewUrlExpiresAt }
          : {}),
        ...(status.assetId !== undefined ? { assetId: status.assetId } : {}),
        ...(status.startImageUrl !== undefined
          ? { startImageUrl: status.startImageUrl }
          : {}),
      };
    }

    if (status.status === "completed") {
      throw new Error("Video generation completed but no URL was returned");
    }

    if (status.status === "failed") {
      throw new Error(status.error || "Video generation failed");
    }

    const elapsedMs = Date.now() - startTime;
    if (elapsedMs > effectiveMaxWait) {
      throw new Error("Timed out waiting for video generation");
    }

    // Prefer server-suggested cadence (provider-aware). Fall back to the
    // hardcoded two-tier strategy when the server does not supply one.
    const interval =
      typeof status.suggestedPollIntervalMs === "number" &&
      status.suggestedPollIntervalMs >= 500
        ? status.suggestedPollIntervalMs
        : elapsedMs > ACTIVE_PHASE_MS
          ? POLL_INTERVAL_EXTENDED_MS
          : POLL_INTERVAL_ACTIVE_MS;

    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, interval);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  }
}
