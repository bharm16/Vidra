import { randomUUID } from "node:crypto";
import { logger } from "@infrastructure/Logger";
import type {
  CaptureArgs,
  IPostHogClient,
} from "@infrastructure/PostHogClient";

/**
 * The distinctId for user-attributed telemetry: the userId when it carries a
 * value, otherwise a fresh anonymous id.
 *
 * Note: LlmCallTelemetryService deliberately falls back to `"system"` instead —
 * its events are not user-attributed — so it does not use this helper.
 */
export function resolveDistinctId(userId: string | null): string {
  return userId && userId.trim().length > 0 ? userId : `anon-${randomUUID()}`;
}

/**
 * Emit one PostHog event, swallowing emission failures as a non-fatal debug log.
 * Telemetry must never break the request path it observes.
 */
export function emitCaptured(
  client: IPostHogClient,
  capture: CaptureArgs,
  requestId: string,
): void {
  try {
    client.capture(capture);
  } catch (err) {
    logger.debug("Telemetry emission failed (non-fatal)", {
      error: err instanceof Error ? err.message : String(err),
      requestId,
    });
  }
}
