import { buildFirebaseAuthHeaders } from "@/services/http/firebaseAuth";
import { z } from "zod";
import type {
  CoherenceCheckRequest,
  CoherenceCheckResult,
} from "../types/coherence";

export interface CoherenceCheckFetchOptions {
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

const CoherenceEditSchema = z.union([
  z.object({
    type: z.literal("replaceSpanText"),
    spanId: z.string().optional(),
    replacementText: z.string().optional(),
    anchorQuote: z.string().optional(),
  }),
  z.object({
    type: z.literal("removeSpan"),
    spanId: z.string().optional(),
    anchorQuote: z.string().optional(),
  }),
]);

const CoherenceRecommendationSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  rationale: z.string(),
  edits: z.array(CoherenceEditSchema),
  confidence: z.number().optional(),
});

const CoherenceFindingSchema = z.object({
  id: z.string().optional(),
  severity: z.enum(["low", "medium", "high", "suggestion"]).optional(),
  message: z.string(),
  reasoning: z.string(),
  involvedSpanIds: z.array(z.string()).optional(),
  recommendations: z.array(CoherenceRecommendationSchema),
});

const CoherenceCheckResultSchema = z.object({
  conflicts: z.array(CoherenceFindingSchema),
  harmonizations: z.array(CoherenceFindingSchema),
});

export async function checkPromptCoherence(
  payload: CoherenceCheckRequest,
  options: CoherenceCheckFetchOptions = {},
): Promise<CoherenceCheckResult> {
  const fetchFn =
    options.fetchImpl || (typeof fetch !== "undefined" ? fetch : undefined);
  if (!fetchFn) {
    throw new Error("Fetch is not available in this environment.");
  }

  const authHeaders = await buildFirebaseAuthHeaders();
  const response = await fetchFn("/api/enhancement/prompt-coherence", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
    },
    body: JSON.stringify(payload),
    ...(options.signal ? { signal: options.signal } : {}),
  });

  if (!response.ok) {
    throw new Error(`Failed to check coherence: ${response.status}`);
  }

  const responsePayload = (await response.json()) as unknown;
  return CoherenceCheckResultSchema.parse(responsePayload);
}
