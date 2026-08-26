import type {
  CoherenceCheckRequest,
  CoherenceCheckResult,
} from "../types/coherence";
// The result schema is the shared contract itself, not a local restatement of
// it — the server derives its types from the same module.
import { CoherenceCheckResultSchema } from "@shared/schemas/coherence.schemas";
import { apiRequest } from "@/services/apiRequest";

export interface CoherenceCheckFetchOptions {
  signal?: AbortSignal;
}

export async function checkPromptCoherence(
  payload: CoherenceCheckRequest,
  options: CoherenceCheckFetchOptions = {},
): Promise<CoherenceCheckResult> {
  return apiRequest(
    "/enhancement/prompt-coherence",
    CoherenceCheckResultSchema,
    {
      method: "POST",
      body: payload,
      ...(options.signal ? { signal: options.signal } : {}),
    },
  );
}
