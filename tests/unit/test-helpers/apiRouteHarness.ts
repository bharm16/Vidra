/**
 * Shared harness for API-route integration suites.
 *
 * The ALLOWED_API_KEYS save/set/restore ritual was restated byte-identically
 * in six route suites (tests/unit had more copies before the frozen motion
 * clone was deleted). Same factoring move as the loopbackTestServer helper
 * that already serves 8 consumers in server/src.
 */
import { afterEach, beforeEach } from "vitest";

/**
 * Register beforeEach/afterEach hooks that point ALLOWED_API_KEYS at the
 * suite's key and restore the previous value afterwards. Call at describe
 * scope.
 */
export function useTestApiKey(apiKey: string): void {
  let previous: string | undefined;
  beforeEach(() => {
    previous = process.env.ALLOWED_API_KEYS;
    process.env.ALLOWED_API_KEYS = apiKey;
  });
  afterEach(() => {
    if (previous === undefined) {
      delete process.env.ALLOWED_API_KEYS;
      return;
    }
    process.env.ALLOWED_API_KEYS = previous;
  });
}
