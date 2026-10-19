import { canonicalJson } from "@shared/workflow/canonicalJson";
import { DraftIdSchema, type DraftId } from "@shared/schemas/workflow/identity.schemas";

/** Deterministic across tabs/reloads, so a lost create response reuses the same empty draft. */
export async function initialDraftId(ownerId: string, projectId: string, conversationId: string, retiredDraftIds: string[]): Promise<DraftId> {
  const bytes = new TextEncoder().encode(canonicalJson({ version: "vidra-initial-draft/v1", ownerId, projectId, conversationId, retiredDraftIds: [...retiredDraftIds].sort() }));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
  return DraftIdSchema.parse(`draft_initial_${hash}`);
}
