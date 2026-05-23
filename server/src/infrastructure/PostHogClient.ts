import { execFileSync } from "node:child_process";

import { PostHog } from "posthog-node";

import { getRequestContext } from "./requestContext";
import {
  TELEMETRY_SOURCES,
  type TelemetrySource,
} from "#shared/types/telemetry";

export interface CaptureArgs {
  distinctId: string;
  event: string;
  properties?: Record<string, unknown>;
  timestamp?: Date;
}

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
 * Stamped onto every event in PostHogClient.capture() so the calibration
 * sampler can filter by harness era without the MIN_EVENT_TIMESTAMP cutoff
 * Sub-project D added. The field name is `harnessVersion` per the handoff
 * doc; it's broader than synthetic harness — it identifies the process
 * build regardless of source (user, synthetic, ci, dogfood).
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

function resolveHarnessVersion(): string {
  // Read env fresh each call so tests can override via beforeEach. The git
  // fallback is memoized — execFileSync only runs once per process.
  const envValue = process.env.HARNESS_VERSION;
  if (typeof envValue === "string" && envValue.trim().length > 0) {
    return envValue.trim();
  }
  return resolveGitCommit();
}

export interface IPostHogClient {
  capture(args: CaptureArgs): void;
  shutdown(): Promise<void>;
}

class PostHogClientReal implements IPostHogClient {
  private readonly client: PostHog;

  constructor(apiKey: string, host?: string) {
    this.client = new PostHog(apiKey, {
      ...(host ? { host } : {}),
      flushAt: 20,
      flushInterval: 10000,
    });
  }

  capture(args: CaptureArgs): void {
    try {
      const ctx = getRequestContext();
      const rawSource = ctx?.source;
      const source: TelemetrySource =
        typeof rawSource === "string" &&
        (TELEMETRY_SOURCES as readonly string[]).includes(rawSource)
          ? (rawSource as TelemetrySource)
          : "unknown";
      this.client.capture({
        ...args,
        // Caller-supplied properties take precedence — allows synthetic/CI
        // callers to override source (existing behavior) and harnessVersion
        // (F5 override channel, used for tests + targeted attribution).
        properties: {
          source,
          harnessVersion: resolveHarnessVersion(),
          ...(args.properties ?? {}),
        },
      });
    } catch {
      // Telemetry must never throw upstream. posthog-node queues internally
      // and retries network failures itself; this catch covers misuse / OOM.
    }
  }

  async shutdown(): Promise<void> {
    try {
      await this.client.shutdown();
    } catch {
      // shutdown is best-effort; ignore failures on process exit.
    }
  }
}

class PostHogClientNoop implements IPostHogClient {
  capture(): void {
    // no-op
  }

  async shutdown(): Promise<void> {
    // no-op
  }
}

/**
 * Factory: returns a real client when POSTHOG_API_KEY is set, otherwise a
 * silent no-op. Keeps local dev painless and gates production telemetry on
 * the env var alone — no application-level feature flag needed.
 */
export function createPostHogClient(): IPostHogClient {
  const apiKey = process.env.POSTHOG_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    return new PostHogClientNoop();
  }
  return new PostHogClientReal(apiKey, process.env.POSTHOG_HOST);
}
