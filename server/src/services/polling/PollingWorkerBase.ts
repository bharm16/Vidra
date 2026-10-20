import { logger } from "@infrastructure/Logger";

/**
 * Shared options for {@link PollingWorkerBase}. Subclasses typically expose
 * their own `Options` interface and forward these fields plus their own
 * domain-specific config.
 */
export interface PollingWorkerOptions {
  /** Stable identifier used in logs and crash alerts. */
  workerId: string;
  /** Base interval between successful ticks. */
  basePollIntervalMs: number;
  /** Upper bound after exponential backoff. Defaults to `max(base * 8, 120_000)`. */
  maxPollIntervalMs?: number;
  /** Multiplier applied to the current interval on failure. Defaults to 2. */
  backoffFactor?: number;
  /**
   * When true, the very first scheduled tick after `start()` uses a uniformly
   * random delay in `[0, basePollIntervalMs)` to avoid thundering-herd on
   * simultaneous replica restarts. Defaults to false to preserve historical
   * behavior of workers that scheduled the first tick immediately or at the
   * full base interval.
   */
  initialJitter?: boolean;
}

/** Public status snapshot returned by {@link PollingWorkerBase.getStatus}. */
export interface PollingWorkerStatus {
  /** True between `start()` and `stop()`. Mirrors the legacy `running` field. */
  running: boolean;
  /** Date of the last completed runOnce attempt, regardless of success. */
  lastRunAt: Date | null;
  /** Date of the last successful runOnce attempt. */
  lastSuccessfulRunAt: Date | null;
  /** Number of consecutive failures since the last success. */
  consecutiveFailures: number;
}

const DEFAULT_BACKOFF_FACTOR = 2;
const DEFAULT_MAX_POLL_FLOOR_MS = 120_000;
const DEFAULT_MAX_POLL_MULTIPLIER = 8;

/**
 * Base class for periodic background workers that follow a "tick loop with
 * adaptive backoff" shape:
 *
 * - `start()` schedules the first tick (optionally jittered).
 * - Each tick invokes `runOnce()` (implemented by the subclass).
 * - `runOnce` returning `true` resets the poll interval to `basePollIntervalMs`.
 * - `runOnce` returning `false` (or throwing) multiplies the current interval
 *   by `backoffFactor`, capped at `maxPollIntervalMs`.
 * - `stop()` clears the pending timer and prevents further ticks.
 *
 * Subclasses must override `runOnce()` and may add their own concurrency guards
 * (the base class does NOT serialize ticks against in-flight runs — historical
 * subclasses each implemented their own `running` guard inside runOnce because
 * the right behaviour varies, e.g. some return `true` on re-entry to avoid
 * spurious backoff).
 */
export abstract class PollingWorkerBase {
  protected readonly workerId: string;
  protected readonly basePollIntervalMs: number;
  protected readonly maxPollIntervalMs: number;
  protected readonly backoffFactor: number;
  protected readonly initialJitter: boolean;
  protected readonly log: ReturnType<typeof logger.child>;

  private timer: NodeJS.Timeout | null = null;
  private currentPollIntervalMs: number;
  private startedFlag = false;
  private lastRunAtInternal: Date | null = null;
  private lastSuccessfulRunAtInternal: Date | null = null;
  private consecutiveFailuresInternal = 0;

  protected constructor(options: PollingWorkerOptions) {
    this.workerId = options.workerId;
    this.basePollIntervalMs = options.basePollIntervalMs;
    this.maxPollIntervalMs =
      options.maxPollIntervalMs ??
      Math.max(
        this.basePollIntervalMs * DEFAULT_MAX_POLL_MULTIPLIER,
        DEFAULT_MAX_POLL_FLOOR_MS,
      );
    this.backoffFactor = options.backoffFactor ?? DEFAULT_BACKOFF_FACTOR;
    this.initialJitter = options.initialJitter ?? false;
    this.log = logger.child({ service: this.workerId });
    this.currentPollIntervalMs = this.basePollIntervalMs;
  }

  /**
   * The per-tick work, implemented by the subclass.
   *
   * Contract:
   * - Return `true` on success (resets backoff to base interval).
   * - Return `false` on a soft failure that should trigger backoff.
   * - Throw to signal a catastrophic failure: the base class records a
   *   `worker_loop_crash` alert and applies backoff.
   *
   * Subclasses are responsible for their own re-entry guards if a tick can
   * still be in flight when the next tick fires (rare but possible if runOnce
   * runs longer than the current interval).
   */
  protected abstract runOnce(): Promise<boolean>;

  start(): void {
    if (this.startedFlag) {
      return;
    }
    this.startedFlag = true;
    this.currentPollIntervalMs = this.basePollIntervalMs;
    const initialDelay = this.initialJitter
      ? Math.floor(Math.random() * this.basePollIntervalMs)
      : 0;
    this.scheduleNextTick(initialDelay);
  }

  stop(): void {
    this.startedFlag = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  getStatus(): PollingWorkerStatus {
    return {
      running: this.startedFlag,
      lastRunAt: this.lastRunAtInternal,
      lastSuccessfulRunAt: this.lastSuccessfulRunAtInternal,
      consecutiveFailures: this.consecutiveFailuresInternal,
    };
  }

  /** True between `start()` and `stop()`. Exposed for subclass guards. */
  protected isStarted(): boolean {
    return this.startedFlag;
  }

  /**
   * Reset the poll interval to base and reschedule. Useful for callbacks that
   * know the upstream condition has cleared (e.g. circuit breaker recovery).
   * No-op when the worker has not been started.
   */
  protected resetPollInterval(): void {
    if (!this.startedFlag) {
      return;
    }
    this.currentPollIntervalMs = this.basePollIntervalMs;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.scheduleNextTick(this.basePollIntervalMs);
  }

  private scheduleNextTick(delayMs: number): void {
    if (!this.startedFlag) {
      return;
    }
    this.timer = setTimeout(() => {
      void this.runLoop();
    }, delayMs);
  }

  private async runLoop(): Promise<void> {
    if (!this.startedFlag) {
      return;
    }
    let success = false;
    try {
      success = await this.runOnce();
    } catch (error) {
      this.consecutiveFailuresInternal += 1;
      this.lastRunAtInternal = new Date();
      this.log.error("Worker loop failed unexpectedly", error as Error);
      success = false;
    }

    if (success) {
      this.currentPollIntervalMs = this.basePollIntervalMs;
    } else {
      this.currentPollIntervalMs = Math.min(
        this.maxPollIntervalMs,
        Math.round(this.currentPollIntervalMs * this.backoffFactor),
      );
    }

    if (this.startedFlag) {
      this.scheduleNextTick(this.currentPollIntervalMs);
    }
  }

  /** Subclass hook to record a successful run. Updates lastRun + lastSuccessfulRun. */
  protected markRunSuccess(): void {
    const now = new Date();
    this.lastRunAtInternal = now;
    this.lastSuccessfulRunAtInternal = now;
    this.consecutiveFailuresInternal = 0;
  }

  /** Subclass hook to record a failed run that did not throw. */
  protected markRunFailure(): void {
    this.lastRunAtInternal = new Date();
    this.consecutiveFailuresInternal += 1;
  }

  /** Test/inspection helper — current effective interval (post-backoff). */
  protected getCurrentPollIntervalMs(): number {
    return this.currentPollIntervalMs;
  }
}
