import type {
  JobExecutionContext,
  JobHandler,
} from "@services/jobs/JobHandler";
import type { CreditRefunder } from "@services/video-generation/refunds/ports";
import type { StorageService } from "@services/storage/StorageService";
import type { VideoGenerationService } from "../VideoGenerationService";
import type { ProviderCircuitManager } from "./ProviderCircuitManager";
import type { VideoJobStore } from "./VideoJobStore";
import type { VideoJobRecord } from "./types";
import { processVideoJob, type JobSessionAppendPort } from "./processVideoJob";

interface VideoJobHandlerOptions {
  providerCircuitManager?: ProviderCircuitManager;
  metrics?: {
    recordAlert: (
      alertName: string,
      metadata?: Record<string, unknown>,
    ) => void;
  };
  /**
   * ISSUE-12: when provided, processVideoJob calls
   * sessionService.appendGenerationToVersion after markCompleted succeeds,
   * making video generations server-authoritative.
   */
  sessionService?: JobSessionAppendPort | null;
}

/** Runs current video completion and attachment through the worker contract. */
export class VideoJobHandler implements JobHandler<VideoJobRecord> {
  private readonly jobStore: VideoJobStore;
  private readonly videoGenerationService: VideoGenerationService;
  private readonly userCreditService: CreditRefunder;
  private readonly storageService: StorageService;
  private readonly options: VideoJobHandlerOptions;

  constructor(
    jobStore: VideoJobStore,
    videoGenerationService: VideoGenerationService,
    userCreditService: CreditRefunder,
    storageService: StorageService,
    options: VideoJobHandlerOptions = {},
  ) {
    this.jobStore = jobStore;
    this.videoGenerationService = videoGenerationService;
    this.userCreditService = userCreditService;
    this.storageService = storageService;
    this.options = options;
  }

  async process(job: VideoJobRecord, ctx: JobExecutionContext): Promise<void> {
    const { providerCircuitManager, metrics, sessionService } = this.options;
    await processVideoJob(job, {
      jobStore: this.jobStore,
      videoGenerationService: this.videoGenerationService as never,
      storageService: this.storageService,
      userCreditService: this.userCreditService,
      workerId: ctx.workerId,
      leaseMs: ctx.leaseMs,
      signal: ctx.signal,
      heartbeat: ctx.heartbeat,
      dlqSource: "worker-terminal",
      refundReason: "video job worker failed",
      logPrefix: "Video job",
      ...(providerCircuitManager
        ? {
            onProviderSuccess: (provider: string) =>
              providerCircuitManager.recordSuccess(provider),
            onProviderFailure: (provider: string) =>
              providerCircuitManager.recordFailure(provider),
          }
        : {}),
      ...(metrics ? { metrics } : {}),
      ...(sessionService ? { sessionService } : {}),
    });
  }
}
