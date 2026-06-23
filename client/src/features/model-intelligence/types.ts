import type { z } from "zod";
import type {
  FactorScoreSchema,
  ModelScoreSchema,
  PromptRequirementsSchema,
  RecommendationSummarySchema,
  ModelRecommendationSchema,
} from "@shared/schemas/model-intelligence.schemas";

// Response types are derived from the canonical Zod schema in shared/ — the
// wire contract has a single source of truth. Do not re-declare these by hand.
export type FactorScore = z.infer<typeof FactorScoreSchema>;
export type ModelScore = z.infer<typeof ModelScoreSchema>;
export type PromptRequirements = z.infer<typeof PromptRequirementsSchema>;
export type ModelRecommendationSummary = z.infer<
  typeof RecommendationSummarySchema
>;
export type ModelRecommendation = z.infer<typeof ModelRecommendationSchema>;

// Request-only types (client → server). These have no canonical Zod schema on
// the client, so they stay hand-written here.
export interface ModelRecommendationSpan {
  text: string;
  role?: string;
  category?: string;
  start?: number;
  end?: number;
  confidence?: number;
}

export interface ModelRecommendationRequest {
  prompt: string;
  mode?: "t2v" | "i2v";
  spans?: ModelRecommendationSpan[];
  durationSeconds?: number;
}

export interface ModelRecommendationResponse {
  success: boolean;
  data?: ModelRecommendation;
  error?: string;
  details?: unknown;
}
