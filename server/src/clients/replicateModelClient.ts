import Replicate from "replicate";
import type { ReplicatePredictionClient } from "@services/image-generation/providers/runReplicatePrediction";

type WarnSink = {
  warn: (message: string, meta?: Record<string, unknown>) => void;
};

/**
 * SDK construction for the exact native Replicate models (workflow profiles
 * backed by `creation-requests/replicate-models`). Kept in `clients/` so the
 * runner stays free of `new Replicate(...)`.
 */
export function createReplicateModelClient(
  apiToken: string | undefined,
  log: WarnSink,
): ReplicatePredictionClient | null {
  if (!apiToken) {
    log.warn(
      "REPLICATE_API_TOKEN not provided, native Replicate model profiles will be unavailable",
    );
    return null;
  }
  return new Replicate({
    auth: apiToken,
  }) as unknown as ReplicatePredictionClient;
}
