import { logger as rootLogger } from "@infrastructure/Logger";

export type HeartbeatLogger = {
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (
    message: string,
    error?: Error,
    meta?: Record<string, unknown>,
  ) => void;
};

export interface HeartbeatManagerOptions {
  jobId: string;
  workerId: string;
  leaseMs: number;
  intervalMs: number;
  renewLease: (
    jobId: string,
    workerId: string,
    leaseMs: number,
  ) => Promise<boolean>;
  /**
   * When set, the heartbeat triggers `onAbort` after this many consecutive
   * failures. When undefined, failures are logged but the heartbeat never
   * aborts (used by the inline processor which has no zombie-lease concern).
   */
  maxConsecutiveFailures?: number | undefined;
  onAbort?: ((reason: Error) => void) | undefined;
  onFailure?:
    | ((consecutiveFailures: number, error?: Error) => void)
    | undefined;
  logger?: HeartbeatLogger | undefined;
  logPrefix?: string | undefined;
}

const ABORT_MESSAGE = "Lease heartbeat lost — aborting to prevent zombie job";

/**
 * Owns the heartbeat timer for a single video job. Replaces duplicated
 * start/stop/renew bookkeeping in VideoJobWorker and processVideoJob.
 */
export class HeartbeatManager {
  private timer: NodeJS.Timeout | null = null;
  private consecutiveFailures = 0;
  private readonly log: HeartbeatLogger;

  constructor(private readonly options: HeartbeatManagerOptions) {
    this.log =
      options.logger ?? rootLogger.child({ service: "HeartbeatManager" });
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.beat();
    }, this.options.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.consecutiveFailures = 0;
  }

  private async beat(): Promise<void> {
    try {
      const renewed = await this.options.renewLease(
        this.options.jobId,
        this.options.workerId,
        this.options.leaseMs,
      );
      if (renewed) {
        this.consecutiveFailures = 0;
        return;
      }
      this.recordFailure();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.recordFailure(err);
    }
  }

  private recordFailure(error?: Error): void {
    this.consecutiveFailures += 1;
    const prefix = this.options.logPrefix ?? "Heartbeat";
    this.log.warn(
      error
        ? `${prefix} failed`
        : `${prefix} skipped (lease may have been reclaimed)`,
      {
        jobId: this.options.jobId,
        workerId: this.options.workerId,
        consecutiveFailures: this.consecutiveFailures,
        ...(error ? { error: error.message } : {}),
      },
    );
    this.options.onFailure?.(this.consecutiveFailures, error);
    this.checkAbort();
  }

  private checkAbort(): void {
    const max = this.options.maxConsecutiveFailures;
    if (typeof max !== "number") return;
    if (this.consecutiveFailures < max) return;
    this.log.error(
      `${this.options.logPrefix ?? "Heartbeat"} abort threshold reached — lease likely expired`,
      undefined,
      {
        jobId: this.options.jobId,
        workerId: this.options.workerId,
        consecutiveFailures: this.consecutiveFailures,
      },
    );
    this.options.onAbort?.(new Error(ABORT_MESSAGE));
  }
}
