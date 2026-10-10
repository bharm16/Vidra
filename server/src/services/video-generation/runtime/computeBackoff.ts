/**
 * Exponential backoff with deterministic jitter for video-job retries and
 * dead-letter reprocessing. Doubling from a 30s floor to a 5-minute ceiling.
 *
 * Jitter source is `now` (not Math.random) so the function is unit-testable
 * without time travel. The jitter magnitude is controlled by `jitterRatio`:
 * 0.1 ≈ ±10%, 0.2 ≈ ±20%. Retry uses 0.1; DLQ uses 0.2 so batches failing
 * in the same provider outage don't re-fire in lockstep.
 */

const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 5 * 60 * 1_000;

export const RETRY_JITTER_RATIO = 0.1;
export const DLQ_JITTER_RATIO = 0.2;

interface ComputeBackoffOptions {
  jitterRatio: number;
  now?: number;
}

export function computeBackoffMs(
  attempt: number,
  options: ComputeBackoffOptions,
): number {
  const now = options.now ?? Date.now();
  const safeAttempt =
    Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 0;
  const exponential = BASE_DELAY_MS * 2 ** safeAttempt;
  const capped = Math.min(exponential, MAX_DELAY_MS);
  // (now % 1000) - 500 is in [-500, 499]. Scaling by (capped * ratio * 2 / 1000)
  // produces ±ratio of the capped delay. Ratio 0.1 matches the historical
  // retry divisor of 5000; ratio 0.2 matches the historical DLQ divisor of 2500.
  const jitterScale = (capped * options.jitterRatio * 2) / 1000;
  const jitter = Math.floor((now % 1000) - 500) * jitterScale;
  const jittered = Math.floor(capped + jitter);
  return Math.max(BASE_DELAY_MS, Math.min(MAX_DELAY_MS, jittered));
}
