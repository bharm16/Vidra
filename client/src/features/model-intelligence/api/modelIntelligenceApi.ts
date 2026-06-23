import { apiClient } from "@/services/ApiClient";
import { ModelRecommendationResponseSchema } from "./schemas";
import type { ModelRecommendationRequest, ModelRecommendation } from "../types";

export async function fetchModelRecommendation(
  payload: ModelRecommendationRequest,
  signal?: AbortSignal,
): Promise<ModelRecommendation> {
  const data = await apiClient.post(
    "/model-intelligence/recommend",
    payload,
    signal ? { signal } : undefined,
  );
  const parsed = ModelRecommendationResponseSchema.parse(data);

  if (!parsed.success || !parsed.data) {
    throw new Error(parsed.error || "Failed to load model recommendation");
  }

  return parsed.data;
}
