import { logger } from "@infrastructure/Logger";
import type { GenerationParams } from "@services/prompt-optimization/types";

interface NormalizeGenerationParamsInput {
  generationParams: unknown;
  targetModel?: string;
  operation: string;
  requestId: string;
  userId?: string;
}

interface NormalizeGenerationParamsResult {
  normalizedGenerationParams: GenerationParams | null;
  error?: {
    status: number;
    error: string;
    details?: string;
  };
}

/**
 * Keeps the plain settings values a request carries and drops anything else.
 * Which values a model accepts is the provider adapter's call; the composer's
 * capability profiles decide what a person can choose.
 */
export const normalizeGenerationParams = ({
  generationParams,
  targetModel,
  operation,
  requestId,
  userId,
}: NormalizeGenerationParamsInput): NormalizeGenerationParamsResult => {
  if (!generationParams || typeof generationParams !== "object" || Array.isArray(generationParams)) {
    return { normalizedGenerationParams: null };
  }

  const normalized: GenerationParams = {};
  const dropped: string[] = [];
  for (const [key, value] of Object.entries(generationParams)) {
    if (typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) normalized[key] = value;
    else dropped.push(key);
  }
  if (dropped.length > 0) {
    logger.warn("Dropped non-scalar generation parameters", { operation, requestId, userId, targetModel, dropped });
  }

  return { normalizedGenerationParams: normalized };
};
