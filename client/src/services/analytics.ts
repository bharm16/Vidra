/**
 * Analytics Service
 *
 * Thin wrapper around Firebase Analytics that:
 * - Handles the case where analytics is unavailable (dev, ad blockers)
 * - Provides typed event names for product actions
 * - Keeps tracking calls centralized rather than scattered across components
 */

import { getFirebaseAnalytics } from "@/config/firebase";

type EventParams = Record<string, string | number | boolean>;

type LogEventFn = (
  instance: unknown,
  name: string,
  params?: EventParams,
) => void;

let logEventFn: LogEventFn | null = null;

// Lazy-load the logEvent function to match the lazy analytics initialization
async function ensureLogEvent(): Promise<LogEventFn | null> {
  if (logEventFn) return logEventFn;
  try {
    const mod = await import("firebase/analytics");
    logEventFn = mod.logEvent as unknown as LogEventFn;
    return logEventFn;
  } catch {
    return null;
  }
}

/**
 * Track a custom analytics event. Safe to call when analytics is unavailable.
 */
export async function trackEvent(
  name: string,
  params?: EventParams,
): Promise<void> {
  const analytics = getFirebaseAnalytics();
  if (!analytics) return;
  const log = await ensureLogEvent();
  if (log) log(analytics, name, params);
}

/**
 * Track a page view. Called on route changes.
 */
export async function trackPageView(path: string): Promise<void> {
  await trackEvent("page_view", { page_path: path });
}

// ── Product Events ──────────────────────────────────────────────────────────

export function trackPromptOptimize(mode: string): void {
  void trackEvent("prompt_optimize", { mode });
}

export function trackSuggestionRequest(category: string): void {
  void trackEvent("suggestion_request", { category });
}

export function trackPreviewGenerate(mediaType: string): void {
  void trackEvent("preview_generate", { media_type: mediaType });
}

export function trackSessionCreate(): void {
  void trackEvent("session_create");
}

export function trackShare(): void {
  void trackEvent("prompt_share");
}
