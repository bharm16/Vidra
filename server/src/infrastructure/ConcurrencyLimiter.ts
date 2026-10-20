import { logger } from "@infrastructure/Logger";

/**
 * ConcurrencyService - Manages concurrent API request limits with priority queue
 *
 * Previously located in utils/ - moved to services/ as this is a stateful service,
 * not a utility function.
 *
 * Prevents exceeding OpenAI's rate limits by enforcing a maximum number of
 * concurrent requests. When the limit is reached, new requests are queued
 * and processed when slots become available.
 *
 * Features:
 * - Priority queue (newer requests can cancel older ones)
 * - Request timeout handling
 * - Automatic queue cleanup
 * - Metrics tracking
 *
 * @example
 * const limiter = new ConcurrencyLimiter({ maxConcurrent: 5 });
 * const result = await limiter.execute(async () => {
 *   return await apiClient.call();
 * });
 */

/** Narrow metrics interface — avoids importing the concrete MetricsService class. */
interface ConcurrencyMetrics {
  recordGauge(name: string, value: number): void;
  recordHistogram(name: string, value: number): void;
}

const NULL_METRICS: ConcurrencyMetrics = {
  recordGauge() {},
  recordHistogram() {},
};

interface ConcurrencyLimiterOptions {
  maxConcurrent?: number;
  queueTimeout?: number;
  maxQueueLength?: number;
  enableCancellation?: boolean;
  metricsService?: ConcurrencyMetrics;
}

interface ExecutionOptions {
  signal?: AbortSignal;
  priority?: boolean;
}

interface QueueItem<T> {
  id: number;
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timestamp: number;
  timeoutId: NodeJS.Timeout | null;
}

interface LimiterStats {
  totalExecuted: number;
  totalQueued: number;
  totalCancelled: number;
  totalTimedOut: number;
  totalRejected: number;
  maxQueueLength: number;
  avgQueueTime: number;
  queueTimes: number[];
}

interface QueueStatus {
  activeRequests: number;
  queuedRequests: number;
  availableSlots: number;
  oldestQueuedRequest: number | null;
}

export class ConcurrencyLimiter {
  private readonly maxConcurrent: number;
  private readonly queueTimeout: number;
  private readonly maxQueueLength: number;
  private readonly enableCancellation: boolean;
  private activeCount: number;
  private readonly queue: QueueItem<unknown>[];
  private nextRequestId: number;
  private readonly stats: LimiterStats;
  private readonly metrics: ConcurrencyMetrics;

  /**
   * @param options - Configuration options
   * @param options.maxConcurrent - Maximum concurrent requests (default: 5)
   * @param options.queueTimeout - Max time in queue before rejection (default: 30000ms)
   * @param options.maxQueueLength - Maximum queue depth before rejecting immediately (default: 20)
   * @param options.enableCancellation - Enable request cancellation (default: true)
   * @param options.metricsService - Optional metrics collector for recording gauge/histogram data
   */
  constructor(options: ConcurrencyLimiterOptions = {}) {
    this.maxConcurrent = options.maxConcurrent || 5;
    this.queueTimeout = options.queueTimeout || 30000; // 30 seconds
    this.maxQueueLength = options.maxQueueLength || 20;
    this.enableCancellation = options.enableCancellation !== false;
    this.metrics = options.metricsService ?? NULL_METRICS;

    // Track active requests
    this.activeCount = 0;

    // Priority queue: [{ fn, resolve, reject, timestamp, id }]
    this.queue = [];

    // Track request IDs for cancellation
    this.nextRequestId = 0;

    // Metrics
    this.stats = {
      totalExecuted: 0,
      totalQueued: 0,
      totalCancelled: 0,
      totalTimedOut: 0,
      totalRejected: 0,
      maxQueueLength: 0,
      avgQueueTime: 0,
      queueTimes: [],
    };

    logger.debug("ConcurrencyLimiter initialized", {
      maxConcurrent: this.maxConcurrent,
      queueTimeout: this.queueTimeout,
      maxQueueLength: this.maxQueueLength,
      enableCancellation: this.enableCancellation,
    });
  }

  /**
   * Execute a function with concurrency limiting
   *
   * @param fn - Async function to execute
   * @param options - Execution options
   * @param options.signal - Optional abort signal for cancellation
   * @param options.priority - If true, cancels oldest queued request
   * @returns Result of the function execution
   */
  async execute<T>(
    fn: () => Promise<T>,
    options: ExecutionOptions = {},
  ): Promise<T> {
    const requestId = this.nextRequestId++;
    const startTime = Date.now();

    // Check if we can execute immediately
    if (this.activeCount < this.maxConcurrent) {
      return await this._executeImmediately(fn, requestId);
    }

    // Reject immediately if queue is full (load-shedding)
    if (this.queue.length >= this.maxQueueLength) {
      this.stats.totalRejected++;
      this.metrics.recordGauge("request_queue_length", this.queue.length);

      logger.warn("Request rejected — queue full", {
        requestId,
        queueLength: this.queue.length,
        maxQueueLength: this.maxQueueLength,
        activeCount: this.activeCount,
      });

      const error = new Error(
        `Server busy: ${this.queue.length} requests queued. Try again shortly.`,
      ) as Error & { code?: string; retryAfter?: number };
      error.code = "QUEUE_FULL";
      error.retryAfter = 5;
      throw error;
    }

    // Queue the request
    return await this._queueRequest(fn, requestId, startTime, options);
  }

  /**
   * Execute immediately without queueing
   * @private
   */
  private async _executeImmediately<T>(
    fn: () => Promise<T>,
    requestId: number,
  ): Promise<T> {
    this.activeCount++;
    this.stats.totalExecuted++;

    logger.debug("Executing request immediately", {
      requestId,
      activeCount: this.activeCount,
      queueLength: this.queue.length,
    });

    try {
      const result = await fn();
      return result;
    } finally {
      this.activeCount--;
      this._processQueue();
    }
  }

  /**
   * Queue a request for later execution
   * @private
   */
  private async _queueRequest<T>(
    fn: () => Promise<T>,
    requestId: number,
    startTime: number,
    options: ExecutionOptions,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      // Handle priority requests (cancel oldest if enabled)
      if (
        options.priority &&
        this.enableCancellation &&
        this.queue.length > 0
      ) {
        const oldestRequest = this.queue.shift();
        if (oldestRequest) {
          // Clear timeout before rejecting to prevent memory leak
          if (oldestRequest.timeoutId) {
            clearTimeout(oldestRequest.timeoutId);
          }
          oldestRequest.reject(
            new Error("Request cancelled by higher priority request"),
          );
          this.stats.totalCancelled++;

          logger.debug("Cancelled oldest request for priority", {
            cancelledId: oldestRequest.id,
            newRequestId: requestId,
          });
        }
      }

      // Add to queue
      const queueItem: QueueItem<T> = {
        id: requestId,
        fn: fn as () => Promise<T>,
        resolve: resolve as (value: T) => void,
        reject,
        timestamp: startTime,
        timeoutId: null,
      };

      // Set timeout for queue expiration
      const queueItemUnknown = queueItem as QueueItem<unknown>;
      queueItem.timeoutId = setTimeout(() => {
        this._handleTimeout(queueItemUnknown);
      }, this.queueTimeout) as unknown as NodeJS.Timeout;

      // Handle abort signal if provided
      if (options.signal) {
        options.signal.addEventListener("abort", () => {
          this._cancelRequest(queueItemUnknown);
        });
      }

      this.queue.push(queueItemUnknown);
      this.stats.totalQueued++;
      this.stats.maxQueueLength = Math.max(
        this.stats.maxQueueLength,
        this.queue.length,
      );

      logger.debug("Request queued", {
        requestId,
        queueLength: this.queue.length,
        activeCount: this.activeCount,
      });

      // Record queue metric
      this.metrics.recordGauge("request_queue_length", this.queue.length);
    });
  }

  /**
   * Process the next item in the queue
   * @private
   */
  private _processQueue(): void {
    if (this.queue.length === 0 || this.activeCount >= this.maxConcurrent) {
      return;
    }

    const queueItem = this.queue.shift();
    if (!queueItem) {
      return;
    }

    // Clear the timeout
    if (queueItem.timeoutId) {
      clearTimeout(queueItem.timeoutId);
    }

    // Calculate queue time
    const queueTime = Date.now() - queueItem.timestamp;
    this.stats.queueTimes.push(queueTime);

    // Keep only last 100 queue times for average calculation
    if (this.stats.queueTimes.length > 100) {
      this.stats.queueTimes.shift();
    }

    this.stats.avgQueueTime =
      this.stats.queueTimes.reduce((a, b) => a + b, 0) /
      this.stats.queueTimes.length;

    logger.debug("Processing queued request", {
      requestId: queueItem.id,
      queueTime,
      remainingQueue: this.queue.length,
    });

    // Execute the queued function
    this.activeCount++;
    this.stats.totalExecuted++;

    queueItem
      .fn()
      .then((result) => {
        queueItem.resolve(result);
      })
      .catch((error) => {
        queueItem.reject(error as Error);
      })
      .finally(() => {
        this.activeCount--;
        this._processQueue();
      });

    // Record metrics
    this.metrics.recordGauge("request_queue_length", this.queue.length);
    this.metrics.recordHistogram("request_queue_time_ms", queueTime);
  }

  /**
   * Handle request timeout
   * @private
   */
  private _handleTimeout(queueItem: QueueItem<unknown>): void {
    const index = this.queue.indexOf(queueItem);
    if (index === -1) {
      return; // Already processed
    }

    // Remove from queue
    this.queue.splice(index, 1);
    this.stats.totalTimedOut++;

    const error = new Error(
      `Request timed out after ${this.queueTimeout}ms in queue`,
    ) as Error & { code?: string };
    error.code = "QUEUE_TIMEOUT";

    queueItem.reject(error);

    logger.warn("Request timed out in queue", {
      requestId: queueItem.id,
      queueTime: Date.now() - queueItem.timestamp,
      queueLength: this.queue.length,
    });

    this.metrics.recordGauge("request_queue_length", this.queue.length);
  }

  /**
   * Cancel a specific request
   * @private
   */
  private _cancelRequest(queueItem: QueueItem<unknown>): void {
    const index = this.queue.indexOf(queueItem);
    if (index === -1) {
      return; // Already processed
    }

    // Remove from queue
    this.queue.splice(index, 1);
    this.stats.totalCancelled++;

    // Clear timeout
    if (queueItem.timeoutId) {
      clearTimeout(queueItem.timeoutId);
    }

    const error = new Error("Request cancelled") as Error & { code?: string };
    error.code = "CANCELLED";

    queueItem.reject(error);

    logger.debug("Request cancelled", {
      requestId: queueItem.id,
      queueLength: this.queue.length,
    });

    this.metrics.recordGauge("request_queue_length", this.queue.length);
  }

  /**
   * Get current statistics
   * @returns Current limiter statistics
   */
  getStats(): LimiterStats & {
    activeCount: number;
    queueLength: number;
    maxConcurrent: number;
  } {
    return {
      activeCount: this.activeCount,
      queueLength: this.queue.length,
      maxConcurrent: this.maxConcurrent,
      ...this.stats,
    };
  }

  /**
   * Clear the queue and reject all pending requests
   */
  clearQueue(): void {
    const count = this.queue.length;

    while (this.queue.length > 0) {
      const queueItem = this.queue.shift();
      if (!queueItem) {
        continue;
      }

      if (queueItem.timeoutId) {
        clearTimeout(queueItem.timeoutId);
      }

      queueItem.reject(new Error("Queue cleared"));
    }

    logger.info("Queue cleared", { clearedCount: count });
    this.metrics.recordGauge("request_queue_length", 0);
  }

  /**
   * Get queue status for debugging
   * @returns Queue status information
   */
  getQueueStatus(): QueueStatus {
    const firstItem = this.queue[0];
    return {
      activeRequests: this.activeCount,
      queuedRequests: this.queue.length,
      availableSlots: this.maxConcurrent - this.activeCount,
      oldestQueuedRequest: firstItem ? Date.now() - firstItem.timestamp : null,
    };
  }
}

/** Parse an env var as an integer with a fallback. Exported for DI limiter registration. */
export const parseEnvInt = (
  value: string | undefined,
  fallback: number,
): number => {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

// ConcurrencyLimiter instances should be created via the DI container
// (see server/src/config/services/llm.services.ts)
