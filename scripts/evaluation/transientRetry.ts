/**
 * Retries a call that failed for a passing reason.
 *
 * A golden-set run makes hundreds of provider calls. Groq answers bursts with
 * 429s that say how long to wait ("try again in 1.2s"), and a few calls a run
 * time out, lose the connection, hit a 5xx, or fail Groq's JSON validation
 * (the model wrote invalid JSON once). Before this, each became a dropped
 * prompt: it left the score, support shrank, and a different random subset
 * fell out on every run. Anything else is a real failure, thrown at once.
 */

const TRANSIENT =
  /\b429\b|rate limit|timeout|timed out|fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|\b5\d\d\b|json_validate_failed/i;
// Groq writes the wait as "1.2s", "479.52ms", or compound like "1m20.5s".
const RETRY_AFTER = /try again in ((?:\d+(?:\.\d+)?(?:ms|h|m|s))+)/i;
const DURATION_PART = /(\d+(?:\.\d+)?)(ms|h|m|s)/gi;
const UNIT_MS: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 };

/** How long the provider asked us to wait, in ms, or undefined when it didn't say. */
export function retryAfterMs(message: string): number | undefined {
  const duration = RETRY_AFTER.exec(message)?.[1];
  if (!duration) return undefined;
  let total = 0;
  for (const [, value, unit] of duration.matchAll(DURATION_PART)) {
    total += Number.parseFloat(value ?? "0") * (UNIT_MS[unit?.toLowerCase() ?? ""] ?? 0);
  }
  return Number.isFinite(total) ? total : undefined;
}

export async function withTransientRetry<T>(
  call: () => Promise<T>,
  {
    attempts = 6,
    sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms)),
  }: { attempts?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await call();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt >= attempts || !TRANSIENT.test(message)) throw error;
      // The provider's own wait plus a little slack; otherwise back off 1s, 2s, 4s…
      const asked = retryAfterMs(message);
      await sleep(asked !== undefined ? asked + 250 : Math.min(1000 * 2 ** (attempt - 1), 16_000));
    }
  }
}
