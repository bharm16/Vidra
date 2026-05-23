import { execFileSync } from "node:child_process";

/**
 * Resolve a build-version identifier for telemetry attribution (F5,
 * 2026-05-22). Read order:
 *   1. process.env.HARNESS_VERSION — explicit build-time injection (Docker,
 *      CI, deploy pipeline). Highest precedence so prod builds without git
 *      can still attribute.
 *   2. `git rev-parse --short HEAD` — dev/local; runs once at module load
 *      via execFileSync (argv-array form, no shell, no injection surface).
 *   3. "unknown" — no env, no git (rare; container without git binary).
 *
 * Used by both the server's PostHogClient (which emits surface events like
 * `optimize.completed`, `suggestions.completed`) and the quality-judge's
 * EvalEmitter (which emits `quality.scored` from a separate process). A
 * single resolver guarantees both emitters agree on the build identity —
 * the whole point of F5 attribution is process-build consistency across
 * processes, so divergent resolution would defeat the attribution.
 */

let cachedGitCommit: string | null = null;

function resolveGitCommit(): string {
  if (cachedGitCommit !== null) {
    return cachedGitCommit;
  }
  try {
    cachedGitCommit = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    cachedGitCommit = "unknown";
  }
  return cachedGitCommit;
}

export function resolveHarnessVersion(): string {
  // Read env fresh each call so tests can override via beforeEach. The git
  // fallback is memoized — execFileSync only runs once per process.
  const envValue = process.env.HARNESS_VERSION;
  if (typeof envValue === "string" && envValue.trim().length > 0) {
    return envValue.trim();
  }
  return resolveGitCommit();
}
