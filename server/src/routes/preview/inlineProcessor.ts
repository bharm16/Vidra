import { logger } from "@infrastructure/Logger";
import { DEFAULT_VIDEO_JOB_LEASE_SECONDS } from "@config/env";
import type { PreviewRoutesServices } from "@routes/types";
import type { VideoJobStore } from "@services/video-generation/jobs/VideoJobStore";
import {
  processVideoJob,
  type JobSessionAppendPort,
} from "@services/video-generation/jobs/processVideoJob";

interface InlineVideoProcessorParams {
  jobId: string;
  requestId?: string;
  videoJobStore: VideoJobStore;
  videoGenerationService: NonNullable<
    PreviewRoutesServices["videoGenerationService"]
  >;
  userCreditService: NonNullable<PreviewRoutesServices["userCreditService"]>;
  storageService?: NonNullable<PreviewRoutesServices["storageService"]> | null;
  /**
   * Session append port. Without it, processVideoJob never persists the
   * completed clip (and its storagePath) onto the session version — which is
   * what ShareService.mint and the space's picture→clip edge read.
   */
  sessionService?: JobSessionAppendPort | null;
}

function getVideoJobLeaseMs(): number {
  const leaseSeconds = Number.parseInt(
    process.env.VIDEO_JOB_LEASE_SECONDS ||
      String(DEFAULT_VIDEO_JOB_LEASE_SECONDS),
    10,
  );
  if (!Number.isFinite(leaseSeconds) || leaseSeconds <= 0) {
    return DEFAULT_VIDEO_JOB_LEASE_SECONDS * 1000;
  }
  return leaseSeconds * 1000;
}

export function scheduleInlineVideoProcessing({
  jobId,
  requestId,
  videoJobStore,
  videoGenerationService,
  userCreditService,
  storageService,
  sessionService,
}: InlineVideoProcessorParams): void {
  const leaseMs = getVideoJobLeaseMs();
  const workerId = `inline-preview-${requestId || Date.now()}`;

  setTimeout(() => {
    void (async () => {
      const claimed = await videoJobStore.claimJob(jobId, workerId, leaseMs);
      if (!claimed) {
        logger.debug("Inline preview job claim skipped", {
          jobId,
          workerId,
        });
        return;
      }

      logger.info("Inline preview job claimed", {
        jobId,
        workerId,
        userId: claimed.userId,
      });

      await processVideoJob(claimed, {
        jobStore: videoJobStore,
        videoGenerationService: videoGenerationService as never,
        storageService: storageService ?? null,
        userCreditService,
        ...(sessionService ? { sessionService } : {}),
        workerId,
        leaseMs,
        dlqSource: "inline-terminal",
        refundReason: "inline video preview failed",
        logPrefix: "Inline preview job",
      });
    })();
  }, 300);
}
