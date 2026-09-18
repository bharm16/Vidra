import {
  SketchAcceptResultSchema,
  type SketchAcceptRequest,
  type SketchAcceptResult,
} from "@shared/schemas/sketch.schemas";

import { apiRequest } from "@/services/apiRequest";

/**
 * "Use this" — the Live editor's one accept door (ADR-0022 decision 5, #87).
 *
 * The wire boundary, and nothing more: the request is assembled by the caller
 * from the output that was on screen, and the response is validated here. No
 * transform, because the server's result and the UI's need are the same shape.
 *
 * Unlike the frame relay beside it, this is an ordinary Vidra API call, so it
 * rides `apiRequest` — auth headers, the `{ success, data }` envelope, and a
 * rejection carrying the server's own creator-facing sentence.
 */
export async function acceptLiveOutput(
  request: SketchAcceptRequest,
  signal?: AbortSignal,
): Promise<SketchAcceptResult> {
  return apiRequest("/sketch/accept", SketchAcceptResultSchema, {
    method: "POST",
    body: request,
    ...(signal ? { signal } : {}),
  });
}
