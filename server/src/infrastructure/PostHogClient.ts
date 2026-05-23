import { PostHog } from "posthog-node";

import { resolveHarnessVersion } from "./harnessVersion";
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
