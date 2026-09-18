import { getVideoPreviewStatus } from "./previewApi";
import type { VideoJobStatus } from "./previewApi";
import type { TakeAttachment } from "@shared/schemas/attachment.schemas";

const POLL_INTERVAL_ACTIVE_MS = 2_000;
const POLL_INTERVAL_EXTENDED_MS = 8_000;
const ACTIVE_PHASE_MS = 6 * 60 * 1_000;
const DEFAULT_MAX_WAIT_MS = 20 * 60 * 1_000;
/**
 * How long to keep polling for the attachment AFTER the render itself is done.
 * Rendering is minutes; attaching is one write, so a minute is already
 * generous. Past it the clip is reported as it actually is — made, not yet
 * saved — rather than held behind a spinner for the render-sized timeout.
 */
const ATTACHMENT_WAIT_MS = 60 * 1_000;

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
  /**
   * Whether the clip reached its session (ADR-0022 decision 6). Absent when
   * the job named no session. `failed` — or a `pending` that outlived the
   * budget above — is a clip that was made but not saved: real media, no node
   * in the space until it is attached.
   */
  attachment?: TakeAttachment | undefined;
}

/**
 * Polls the video job status endpoint with two-tier timing:
 * - Active phase (first 6 min): polls every 2s
 * - Extended phase (after 6 min): polls every 8s
 *
 * Returns the completed result or throws on failure/timeout.
 *
 * ADR-0022 decision 6: "completed" is the render's answer, not the job's. A
 * clip whose session write has not resolved would otherwise be adopted as a
 * take the session never received — a node that vanishes on the next refresh.
 * So the job is terminal here only once its attachment resolves, or once the
 * attachment budget runs out, and the unresolved state travels back with the
 * result instead of being inferred from its absence.
 */
export async function pollJobStatus(
  jobId: string,
  signal: AbortSignal,
  options?: PollJobStatusOptions,
): Promise<PollJobResult | null> {
  const maxWaitMs = options?.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const startTime = Date.now();
  /** When the render finished — the clock the attachment budget runs on. */
  let renderedAt: number | null = null;

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
      if (renderedAt === null) renderedAt = Date.now();
      const attachmentPending = status.attachment?.state === "pending";
      const withinAttachmentBudget =
        Date.now() - renderedAt < ATTACHMENT_WAIT_MS;

      if (!attachmentPending || !withinAttachmentBudget) {
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
          ...(status.attachment !== undefined
            ? { attachment: status.attachment }
            : {}),
        };
      }
    }

    if (status.status === "completed" && !status.videoUrl) {
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
