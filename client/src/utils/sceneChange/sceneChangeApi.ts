import type { SceneChangeRequest, SceneChangeResponse } from "./types";
import { buildFirebaseAuthHeaders } from "@/services/http/firebaseAuth";

export async function detectSceneChange(
  request: SceneChangeRequest,
  fetchImpl?: typeof fetch,
): Promise<SceneChangeResponse> {
  const fetchFn =
    fetchImpl || (typeof fetch !== "undefined" ? fetch : undefined);

  if (!fetchFn) {
    throw new Error("Fetch is not available in this environment.");
  }

  const authHeaders = await buildFirebaseAuthHeaders();
  const response = await fetchFn("/api/enhancement/scene-change", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return (await response.json()) as SceneChangeResponse;
}
