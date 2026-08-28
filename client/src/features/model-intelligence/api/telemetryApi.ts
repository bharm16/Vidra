import { apiClient } from "@/services/ApiClient";
import { logger } from "@/services/LoggingService";
import { FEATURES } from "@/config/features.config";

export type ModelRecommendationEvent = {
  event:
    | "recommendation_viewed"
    | "compare_opened"
    | "model_selected"
    | "generation_started";
  recommendationId?: string | undefined;
  promptId?: string | undefined;
  recommendedModelId?: string | undefined;
  selectedModelId?: string;
  mode?: "t2v" | "i2v";
  durationSeconds?: number;
  timeSinceRecommendationMs?: number;
};

const log = logger.child("modelIntelligenceTelemetry");

export async function trackModelRecommendationEvent(
  event: ModelRecommendationEvent,
): Promise<void> {
  // ADR-0002: model-intelligence is frozen — no telemetry traffic while off.
  // This is the single guard: call sites must not re-check the flag.
  if (!FEATURES.MODEL_INTELLIGENCE_UI) return;
  try {
    // Normalize timing here so call sites don't each restate the clamp
    // (they used to, and the two copies had started to drift).
    const payload =
      typeof event.timeSinceRecommendationMs === "number"
        ? {
            ...event,
            timeSinceRecommendationMs: Math.max(
              0,
              Math.round(event.timeSinceRecommendationMs),
            ),
          }
        : event;
    await apiClient.post("/model-intelligence/track", payload);
  } catch (error) {
    log.debug("Model intelligence telemetry failed", {
      event: event.event,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
