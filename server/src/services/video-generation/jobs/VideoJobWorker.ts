import { v4 as uuidv4 } from "uuid";
import { logger } from "@infrastructure/Logger";
import { sleep } from "@utils/sleep";
import type { JobHandler } from "@services/jobs/JobHandler";
import type { WorkerStatus } from "@services/credits/CreditRefundSweeper";
import type { VideoJobRecord } from "./types";
import { VideoJobStore } from "./VideoJobStore";
import type { ProviderCircuitManager } from "./ProviderCircuitManager";
import { HeartbeatManager } from "./HeartbeatManager";

interface VideoJobWorkerOptions {
  workerId?: string;
  hostname?: string;
  processRole?: string;
  pollIntervalMs: number;
  leaseMs: number;
  maxConcurrent: number;
  maxPollIntervalMs?: number;
  backoffFactor?: number;
  heartbeatIntervalMs?: number;
  providerCircuitManager?: ProviderCircuitManager;
  perProviderMaxConcurrent?: number;
  providerIds?: string[];
  workerHeartbeatStore?: {
    reportHeartbeat: (
      workerId: string,
      metadata?: { hostname?: string; processRole?: string },
    ) => Promise<void>;
    markStopped: (workerId: string) => Promise<void>;
  };
  metrics?: {
    recordAlert: (
      alertName: string,
      metadata?: Record<string, unknown>,
    ) => void;
  };
  /**
   * ADR-0022 decision 6: settle the clip attachments a previous worker died
   * holding. Runs once at start, never blocks the poll loop, and never touches
   * a job's generation outcome. Injected rather than imported so the worker
   * keeps no knowledge of the session domain.
   */
  resumePendingAttachments?: () => Promise<void>;
}

interface ActiveJobContext {
  release: () => Promise<void>;
  startedAtMs: number;
}

export class VideoJobWorker {
  private readonly jobStore: VideoJobStore;
  private readonly handler: JobHandler<VideoJobRecord>;
  private readonly basePollIntervalMs: number;
  private readonly maxPollIntervalMs: number;
  private readonly pollBackoffFactor: number;
  private readonly leaseMs: number;
  private readonly maxConcurrent: number;
  private readonly workerId: string;
  private readonly hostname: string | undefined;
  private readonly processRole: string;
  private readonly heartbeatIntervalMs: number;
  private readonly providerCircuitManager: ProviderCircuitManager | undefined;
  private readonly perProviderMaxConcurrent: number;
  private readonly providerIds: string[];
  private readonly workerHeartbeatStore: VideoJobWorkerOptions["workerHeartbeatStore"];
  private readonly metrics?: VideoJobWorkerOptions["metrics"];
  private readonly resumePendingAttachments:
    | VideoJobWorkerOptions["resumePendingAttachments"]
    | undefined;
  private readonly log: ReturnType<typeof logger.child>;
  private timer: NodeJS.Timeout | null = null;
  private workerHeartbeatTimer: NodeJS.Timeout | null = null;
  private activeCount = 0;
  private readonly activeProviderCounts = new Map<string, number>();
  private currentPollIntervalMs: number;
  private isRunning = false;
  private isTicking = false;
  private readonly activeJobs = new Map<string, ActiveJobContext>();
  private lastRunAt: Date | null = null;
  private consecutiveFailures = 0;
  /** Max consecutive heartbeat failures before aborting a job to prevent zombie state. */
  private static readonly MAX_HEARTBEAT_FAILURES = 3;

  constructor(
    jobStore: VideoJobStore,
    handler: JobHandler<VideoJobRecord>,
    options: VideoJobWorkerOptions,
  ) {
    this.jobStore = jobStore;
    this.handler = handler;
    this.basePollIntervalMs = options.pollIntervalMs;
    this.maxPollIntervalMs =
      options.maxPollIntervalMs ?? Math.max(this.basePollIntervalMs * 5, 10000);
    this.pollBackoffFactor = options.backoffFactor ?? 1.5;
    this.leaseMs = options.leaseMs;
    this.maxConcurrent = options.maxConcurrent;
    this.hostname = options.hostname;
    this.processRole = options.processRole ?? "worker";
    this.workerId =
      options.workerId || options.hostname || `video-worker-${uuidv4()}`;
    this.log = logger.child({
      service: "VideoJobWorker",
      workerId: this.workerId,
    });
    this.currentPollIntervalMs = this.basePollIntervalMs;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 20_000;
    this.providerCircuitManager = options.providerCircuitManager;
    this.perProviderMaxConcurrent =
      options.perProviderMaxConcurrent ??
      Math.max(1, Math.ceil(this.maxConcurrent / 2));
    this.providerIds = options.providerIds ?? [
      "replicate",
      "openai",
      "luma",
      "kling",
      "gemini",
    ];
    this.workerHeartbeatStore = options.workerHeartbeatStore;
    this.metrics = options.metrics;
    this.resumePendingAttachments = options.resumePendingAttachments;

    // Validate heartbeat interval is meaningfully shorter than the lease period.
    // If heartbeatIntervalMs * MAX_HEARTBEAT_FAILURES >= leaseMs, the heartbeat
    // abort mechanism cannot fire before the lease expires.
    const heartbeatWindow =
      this.heartbeatIntervalMs * VideoJobWorker.MAX_HEARTBEAT_FAILURES;
    if (heartbeatWindow >= this.leaseMs) {
      this.log = logger.child({
        service: "VideoJobWorker",
        workerId: this.workerId,
      });
      this.log.warn(
        "Heartbeat interval too large relative to lease — zombie detection may be ineffective",
        {
          heartbeatIntervalMs: this.heartbeatIntervalMs,
          maxHeartbeatFailures: VideoJobWorker.MAX_HEARTBEAT_FAILURES,
          heartbeatWindowMs: heartbeatWindow,
          leaseMs: this.leaseMs,
        },
      );
    }
  }

  start(): void {
    if (this.timer) {
      return;
    }
    this.isRunning = true;
    this.currentPollIntervalMs = this.basePollIntervalMs;
    this.log.info("Starting video job worker", {
      pollIntervalMs: this.basePollIntervalMs,
      maxPollIntervalMs: this.maxPollIntervalMs,
      leaseMs: this.leaseMs,
      maxConcurrent: this.maxConcurrent,
      heartbeatIntervalMs: this.heartbeatIntervalMs,
    });
    if (this.workerHeartbeatStore) {
      this.reportWorkerHeartbeat();
      this.workerHeartbeatTimer = setInterval(() => {
        this.reportWorkerHeartbeat();
      }, this.heartbeatIntervalMs);
      this.workerHeartbeatTimer.unref?.();
    }
    if (this.resumePendingAttachments) {
      // Fire-and-forget: a clip that is durable but unfiled is a real debt, but
      // settling it must never delay or fail the worker's own startup.
      void this.resumePendingAttachments().catch((error: unknown) => {
        this.log.warn("Failed to resume pending clip attachments", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
    // Jitter the first tick so K replica pods restarting simultaneously
    // (rolling deploy) don't all hit Firestore at t=0 — avoids thundering herd.
    // Subsequent ticks use their adaptive polling logic.
    const initialDelayMs = Math.floor(Math.random() * this.basePollIntervalMs);
    this.scheduleNextTick(initialDelayMs);
  }

  stop(): void {
    this.isRunning = false;
    if (this.workerHeartbeatTimer) {
      clearInterval(this.workerHeartbeatTimer);
      this.workerHeartbeatTimer = null;
    }
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.workerHeartbeatStore) {
      void this.workerHeartbeatStore
        .markStopped(this.workerId)
        .catch((error) => {
          this.log.warn("Failed to record worker stopped heartbeat", {
            workerId: this.workerId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
    }
  }

  getStatus(): WorkerStatus {
    return {
      running: this.isRunning,
      lastRunAt: this.lastRunAt,
      consecutiveFailures: this.consecutiveFailures,
    };
  }

  /** Reset poll interval to base and reschedule — used by circuit breaker recovery to resume fast polling. */
  resetPollInterval(): void {
    if (!this.isRunning) return;
    this.currentPollIntervalMs = this.basePollIntervalMs;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.scheduleNextTick(this.basePollIntervalMs);
    this.log.info("Poll interval reset by circuit recovery", {
      pollIntervalMs: this.basePollIntervalMs,
    });
  }

  async shutdown(drainTimeoutMs: number): Promise<void> {
    this.stop();
    const deadline = Date.now() + Math.max(1_000, drainTimeoutMs);

    while (this.activeCount > 0 && Date.now() < deadline) {
      await sleep(200);
    }

    if (this.activeCount === 0) {
      this.log.info("Video job worker drained cleanly");
      return;
    }

    this.log.warn(
      "Video job worker drain timeout reached; releasing active jobs",
      {
        activeCount: this.activeCount,
        drainTimeoutMs,
      },
    );
    this.metrics?.recordAlert("video_job_worker_drain_timeout", {
      activeCount: this.activeCount,
      drainTimeoutMs,
      workerId: this.workerId,
    });

    const releases = Array.from(this.activeJobs.entries()).map(
      async ([jobId, context]) => {
        try {
          await context.release();
        } catch (error) {
          this.log.error(
            "Failed to release active job during shutdown",
            error as Error,
            {
              jobId,
              workerId: this.workerId,
            },
          );
        }
      },
    );

    await Promise.allSettled(releases);
  }

  private reportWorkerHeartbeat(): void {
    if (!this.workerHeartbeatStore) {
      return;
    }
    void this.workerHeartbeatStore
      .reportHeartbeat(this.workerId, {
        ...(this.hostname ? { hostname: this.hostname } : {}),
        processRole: this.processRole,
      })
      .catch((error) => {
        this.log.warn("Failed to record worker heartbeat", {
          workerId: this.workerId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }

  private scheduleNextTick(delayMs: number): void {
    if (!this.isRunning) {
      return;
    }
    this.timer = setTimeout(() => {
      void this.tick();
    }, delayMs);
  }

  private async tick(): Promise<void> {
    if (!this.isRunning || this.isTicking) {
      return;
    }
    this.isTicking = true;
    let claimedJobs = 0;
    let shouldScheduleNextTick = false;
    try {
      if (this.providerCircuitManager) {
        claimedJobs = await this.tickProviderAware();
      } else {
        claimedJobs = await this.tickLegacy();
      }
      this.lastRunAt = new Date();
      this.consecutiveFailures = 0;
    } catch (error) {
      this.lastRunAt = new Date();
      this.consecutiveFailures += 1;
      this.log.error("Video job worker tick failed", error as Error, {
        workerId: this.workerId,
      });
    } finally {
      this.isTicking = false;
      shouldScheduleNextTick = this.isRunning;
      if (shouldScheduleNextTick) {
        if (claimedJobs === 0) {
          this.currentPollIntervalMs = Math.min(
            this.maxPollIntervalMs,
            Math.round(this.currentPollIntervalMs * this.pollBackoffFactor),
          );
        } else {
          this.currentPollIntervalMs = this.basePollIntervalMs;
        }
      }
    }

    if (shouldScheduleNextTick) {
      this.scheduleNextTick(this.currentPollIntervalMs);
    }
  }

  private async tickLegacy(): Promise<number> {
    let claimed = 0;
    while (this.activeCount < this.maxConcurrent) {
      const job = await this.jobStore.claimNextJob(this.workerId, this.leaseMs);
      if (!job) {
        break;
      }
      claimed += 1;
      this.startJob(job);
    }
    return claimed;
  }

  private async tickProviderAware(): Promise<number> {
    const providers = this.buildDispatchableProviders();
    let claimed = 0;

    for (const provider of providers) {
      if (this.activeCount >= this.maxConcurrent) {
        break;
      }

      const activeForProvider = this.activeProviderCounts.get(provider) ?? 0;
      let slotsAvailable = Math.min(
        this.perProviderMaxConcurrent - activeForProvider,
        this.maxConcurrent - this.activeCount,
      );

      while (slotsAvailable > 0) {
        const job = await this.jobStore.claimNextJob(
          this.workerId,
          this.leaseMs,
          provider,
        );
        if (!job) {
          break;
        }

        this.providerCircuitManager!.markDispatched(provider);
        claimed += 1;
        this.startJob(job);
        slotsAvailable -= 1;
      }
    }

    // Attempt to claim untagged/unknown-provider jobs with remaining global slots
    if (this.activeCount < this.maxConcurrent) {
      const unknownJob = await this.jobStore.claimNextJob(
        this.workerId,
        this.leaseMs,
        "unknown",
      );
      if (unknownJob) {
        claimed += 1;
        this.startJob(unknownJob);
      }
    }

    return claimed;
  }

  private buildDispatchableProviders(): string[] {
    const dispatchable: string[] = [];

    for (const provider of this.providerIds) {
      if (this.providerCircuitManager!.canDispatch(provider)) {
        dispatchable.push(provider);
      } else {
        this.log.debug("Skipping circuit-open provider", { provider });
      }
    }

    // Shuffle for fairness (Fisher-Yates)
    for (let i = dispatchable.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [dispatchable[i], dispatchable[j]] = [dispatchable[j]!, dispatchable[i]!];
    }

    return dispatchable;
  }

  private startJob(job: VideoJobRecord): void {
    const provider = job.provider ?? "unknown";
    this.activeCount += 1;
    this.activeProviderCounts.set(
      provider,
      (this.activeProviderCounts.get(provider) ?? 0) + 1,
    );

    void this.processJob(job).finally(() => {
      this.activeCount = Math.max(0, this.activeCount - 1);
      const current = this.activeProviderCounts.get(provider) ?? 1;
      if (current <= 1) {
        this.activeProviderCounts.delete(provider);
      } else {
        this.activeProviderCounts.set(provider, current - 1);
      }
    });
  }

  private async processJob(job: VideoJobRecord): Promise<void> {
    this.activeJobs.set(job.id, {
      startedAtMs: Date.now(),
      release: async () => {
        // Shutdown-release is a requeue, not a terminal failure. Previously this
        // path also called enqueueDeadLetter, causing a double-publish: the next
        // worker pod could claim the requeued record while the DLQ reprocessor
        // also re-ran the DLQ entry. If the job fails terminally on the next
        // claim, processVideoJob handles DLQ enqueuing via dlqSource="worker-terminal".
        const released = await this.jobStore.releaseClaim(
          job.id,
          this.workerId,
          "worker shutdown before completion",
        );
        if (released) {
          this.metrics?.recordAlert("video_job_shutdown_release", {
            jobId: job.id,
            attempt: job.attempts,
            workerId: this.workerId,
          });
        }
      },
    });

    /** AbortController used to cancel in-flight generation when heartbeats detect a zombie lease. */
    const heartbeatAbort = new AbortController();

    const workerHeartbeat = new HeartbeatManager({
      jobId: job.id,
      workerId: this.workerId,
      leaseMs: this.leaseMs,
      intervalMs: this.heartbeatIntervalMs,
      renewLease: (id, wid, lease) => this.jobStore.renewLease(id, wid, lease),
      maxConsecutiveFailures: VideoJobWorker.MAX_HEARTBEAT_FAILURES,
      logger: this.log,
      logPrefix: "Video job lease heartbeat",
      onAbort: (reason) => {
        this.metrics?.recordAlert("video_job_heartbeat_abort", {
          jobId: job.id,
          workerId: this.workerId,
          consecutiveFailures: VideoJobWorker.MAX_HEARTBEAT_FAILURES,
        });
        heartbeatAbort.abort(reason);
      },
    });

    try {
      await this.handler.process(job, {
        workerId: this.workerId,
        leaseMs: this.leaseMs,
        signal: heartbeatAbort.signal,
        heartbeat: workerHeartbeat,
      });
    } finally {
      workerHeartbeat.stop();
      this.activeJobs.delete(job.id);
    }
  }
}
