import { OptimizeResponseSchema } from "@shared/schemas/optimization.schemas";
import { buildFirebaseAuthHeaders } from "@/services/http/firebaseAuth";

/**
 * Rewrites a whole request through POST /api/optimize. A still picture takes the
 * renderer's single-keyframe preview; a clip takes the full motion prompt. The
 * selected profile lets the server follow its model's own wording guidance.
 */
export async function requestImprovedWords(words: string, still: boolean, profileId?: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch("/api/optimize", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await buildFirebaseAuthHeaders()) },
    body: JSON.stringify({ prompt: words, ...(profileId ? { profileId } : {}) }),
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error("Improved words are unavailable. Your words are unchanged.");
  const { data } = OptimizeResponseSchema.parse(await response.json());
  const improved = (still ? data.previewPrompt : undefined) ?? data.prompt;
  if (!improved.trim()) throw new Error("Improved words are unavailable. Your words are unchanged.");
  return improved.trim();
}
