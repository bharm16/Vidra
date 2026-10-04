import * as Sentry from "@sentry/react";
import type { User } from "../hooks/types";
import { logger } from "@/services/LoggingService";
import { sanitizeError } from "@/utils/logging";

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
const ENVIRONMENT =
  import.meta.env.VITE_ENVIRONMENT || import.meta.env.MODE || "development";
const RELEASE = import.meta.env.VITE_APP_VERSION || "unknown";
const log = logger.child("sentry");

export function initSentry(): void {
  // Only initialize Sentry if DSN is provided
  if (!SENTRY_DSN) {
    if (import.meta.env.DEV) {
      log.warn("Sentry DSN not configured; error tracking disabled", {
        operation: "initSentry",
      });
    }
    return;
  }

  // Skip init entirely in dev unless the debug flag is set. The existing
  // beforeSend filter drops error events in dev, but Sentry.init itself
  // still emits session/performance envelopes — which pollute the Sentry
  // project quota and add noise to dev network traces.
  // String compare against "true" — VITE_SENTRY_DEBUG="false" must NOT enable.
  if (import.meta.env.DEV && import.meta.env.VITE_SENTRY_DEBUG !== "true") {
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: ENVIRONMENT,
    release: RELEASE,

    // Send default PII (IP addresses, user info)
    sendDefaultPii: true,

    // Performance Monitoring
    integrations: [
      Sentry.browserTracingIntegration(),
      // Only enable Session Replay in production to avoid rate limiting from verbose dev console logs
      ...(ENVIRONMENT === "production"
        ? [
            Sentry.replayIntegration({
              maskAllText: false,
              blockAllMedia: false,
              // Limit replay duration to reduce data volume
              maxReplayDuration: 60000, // 1 minute max
              // Only capture relevant network requests
              networkDetailAllowUrls: [window.location.origin],
              networkCaptureBodies: false, // Don't capture request/response bodies
            }),
          ]
        : []),
    ],

    // Performance Monitoring sample rate (1.0 = 100%)
    tracesSampleRate: ENVIRONMENT === "production" ? 0.1 : 1.0,

    // Session Replay sample rate (only applies when replay integration is enabled)
    // Reduced to 1% in production to minimize data volume and avoid rate limits
    replaysSessionSampleRate: ENVIRONMENT === "production" ? 0.01 : 0, // 1% in prod, disabled in dev
    replaysOnErrorSampleRate: ENVIRONMENT === "production" ? 1.0 : 0, // Always capture on errors in prod, disabled in dev

    // Filter out local development errors
    beforeSend(event, hint) {
      // Don't send events in development unless explicitly enabled.
      // String compare against "true" — VITE_SENTRY_DEBUG="false" must NOT enable.
      if (
        ENVIRONMENT === "development" &&
        import.meta.env.VITE_SENTRY_DEBUG !== "true"
      ) {
        return null;
      }

      // Filter out errors from browser extensions
      const error = hint.originalException;
      if (
        error &&
        typeof error === "object" &&
        "message" in error &&
        typeof error.message === "string"
      ) {
        if (
          error.message.includes("chrome-extension://") ||
          error.message.includes("moz-extension://")
        ) {
          return null;
        }
      }

      return event;
    },

    // Ignore specific errors
    ignoreErrors: [
      // Browser extension errors
      "chrome-extension://",
      "moz-extension://",
      // Network errors that aren't actionable
      "NetworkError",
      "Network request failed",
      // User canceled actions
      "AbortError",
      "The operation was aborted",
      // Firebase auth cancelled flows
      "auth/popup-closed-by-user",
      "auth/cancelled-popup-request",
      // Sentry rate limit errors (prevents error recursion)
      "429",
      "Too Many Requests",
      "ingest.us.sentry.io",
    ],

    // Set context for all events
    initialScope: {
      tags: {
        platform: "web",
        app: "vidra",
      },
    },
  });

  // Set up custom context
  Sentry.setTag("browser", navigator.userAgent);
}

// Helper to set user context (call after Firebase auth)
export function setSentryUser(
  user: {
    uid?: string;
    email?: string | null;
    displayName?: string | null;
  } | null,
): void {
  if (!SENTRY_DSN) return;

  if (user) {
    const uid = typeof user.uid === "string" ? user.uid : undefined;
    const email = typeof user.email === "string" ? user.email : undefined;
    const displayName =
      typeof user.displayName === "string" ? user.displayName : undefined;

    const username = displayName || email?.split("@")[0];
    const sentryUser: { id?: string; email?: string; username?: string } = {};
    if (uid) sentryUser.id = uid;
    if (email) sentryUser.email = email;
    if (username) sentryUser.username = username;

    Sentry.setUser(Object.keys(sentryUser).length > 0 ? sentryUser : null);
  } else {
    Sentry.setUser(null);
  }
}

// Helper to add breadcrumbs for debugging
export function addSentryBreadcrumb(
  category: string,
  message: string,
  data: Record<string, unknown> = {},
): void {
  if (!SENTRY_DSN) return;

  Sentry.addBreadcrumb({
    category,
    message,
    level: "info",
    data,
  });
}

// Helper to capture exceptions manually
export function captureException(
  error: unknown,
  context: Record<string, unknown> = {},
): void {
  if (!SENTRY_DSN) {
    const errObj =
      error instanceof Error ? error : new Error(sanitizeError(error).message);
    log.error("captureException called but Sentry is not configured", errObj, {
      operation: "captureException",
      context,
    });
    return;
  }

  Sentry.captureException(error, {
    contexts: {
      custom: context,
    },
  });
}

// Helper to capture messages
export function captureMessage(
  message: string,
  level: "info" | "warning" | "error" = "info",
  context: Record<string, unknown> = {},
): void {
  if (!SENTRY_DSN) {
    // Fallback logging when Sentry is not configured
    if (level === "error") {
      log.error(message, undefined, { operation: "captureMessage", context });
    } else if (level === "warning") {
      log.warn(message, { operation: "captureMessage", context });
    } else {
      log.info(message, { operation: "captureMessage", context });
    }
    return;
  }

  Sentry.captureMessage(message, {
    level,
    contexts: {
      custom: context,
    },
  });
}

export default Sentry;
