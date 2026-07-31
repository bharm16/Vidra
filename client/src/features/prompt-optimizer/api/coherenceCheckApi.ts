import { buildFirebaseAuthHeaders } from "@/services/http/firebaseAuth";
import type {
  CoherenceCheckRequest,
  CoherenceCheckResult,
} from "../types/coherence";
// The result schema is the shared contract itself, not a local restatement of
// it — the server derives its types from the same module.
import { CoherenceCheckResultSchema } from "@shared/schemas/coherence.schemas";
import { ApiSuccessResponseSchema } from "@shared/schemas/api.schemas";

export interface CoherenceCheckFetchOptions {
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

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
  return ApiSuccessResponseSchema(CoherenceCheckResultSchema).parse(
    responsePayload,
  ).data;
}
