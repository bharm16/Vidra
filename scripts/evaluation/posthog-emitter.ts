import { PostHog } from "posthog-node";
import { randomUUID } from "node:crypto";
import { userInfo } from "node:os";

import { resolveHarnessVersion } from "../../server/src/infrastructure/harnessVersion.js";

export interface EmitArgs {
  distinctId: string;
  event: string;
  properties: Record<string, unknown>;
}

export interface IEvalEmitter {
  emit(args: EmitArgs): void;
  shutdown(): Promise<void>;
}

class EvalEmitterReal implements IEvalEmitter {
  private readonly client: PostHog;

  constructor(apiKey: string, host?: string) {
    this.client = new PostHog(apiKey, {
      ...(host ? { host } : {}),
      flushAt: 1,
      flushInterval: 1000,
    });
  }

  emit(args: EmitArgs): void {
    try {
      this.client.capture({
        distinctId: args.distinctId,
        event: args.event,
        // F5 (2026-05-23): stamp harnessVersion onto every emitted event so
        // judge output (`quality.scored`) carries the same process-build
        // attribution as surface events from the server's PostHogClient.
        // Caller-supplied properties take precedence — allows tests +
        // targeted attribution to override.
        properties: {
          harnessVersion: resolveHarnessVersion(),
          ...args.properties,
        },
      });
    } catch {
      // never throw upstream
    }
  }

  async shutdown(): Promise<void> {
    await this.client.shutdown();
  }
}

class EvalEmitterNoop implements IEvalEmitter {
  emit(): void {}
  async shutdown(): Promise<void> {}
}

export function createEvalEmitter(): IEvalEmitter {
  const apiKey = process.env.POSTHOG_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    return new EvalEmitterNoop();
  }
  return new EvalEmitterReal(apiKey, process.env.POSTHOG_HOST);
}

export function resolveDistinctId(): string {
  const runId = process.env.GITHUB_RUN_ID;
  if (runId) return `ci-${runId}`;

  try {
    const username = userInfo().username;
    if (username) return `local-${username}`;
  } catch {
    // fall through
  }

  return `anon-${randomUUID()}`;
}
