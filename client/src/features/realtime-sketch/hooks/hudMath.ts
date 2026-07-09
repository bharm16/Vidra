/**
 * Pure display math for the latency HUD. The reducer stores raw windows
 * (rttMs, modelMs, resultTimes); these derive what the HUD shows.
 */

const EMA_ALPHA = 0.3;

export function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? null;
  }
  const low = sorted[middle - 1];
  const high = sorted[middle];
  if (low === undefined || high === undefined) {
    return null;
  }
  return (low + high) / 2;
}

/**
 * Update rate as the inverse of an exponential moving average over the
 * inter-result gaps — recent gaps dominate, so the number tracks how the
 * loop feels right now rather than the whole session.
 */
export function updatesPerSecond(resultTimes: number[]): number | null {
  if (resultTimes.length < 2) {
    return null;
  }
  let emaGapMs: number | null = null;
  for (let i = 1; i < resultTimes.length; i += 1) {
    const current = resultTimes[i];
    const previous = resultTimes[i - 1];
    if (current === undefined || previous === undefined) {
      continue;
    }
    const gap = current - previous;
    emaGapMs =
      emaGapMs === null ? gap : EMA_ALPHA * gap + (1 - EMA_ALPHA) * emaGapMs;
  }
  if (emaGapMs === null || emaGapMs <= 0) {
    return null;
  }
  return 1000 / emaGapMs;
}
