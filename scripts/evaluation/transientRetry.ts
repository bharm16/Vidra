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
const RETRY_AFTER = /try again in ([\d.]+)\s*(ms|s)\b/i;

/** How long the provider asked us to wait, in ms, or undefined when it didn't say. */
export function retryAfterMs(message: string): number | undefined {
  const match = RETRY_AFTER.exec(message);
  if (!match) return undefined;
  const value = Number.parseFloat(match[1] ?? "");
  if (!Number.isFinite(value)) return undefined;
  return match[2]?.toLowerCase() === "ms" ? value : value * 1000;
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
