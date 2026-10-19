import { DraftContentSchema } from "@shared/schemas/workflow/draft.schemas";
import { OwnerIdSchema } from "@shared/schemas/workflow/identity.schemas";
import { canonicalJson } from "@shared/workflow/canonicalJson";
import { DraftCheckpointStore, type DraftCheckpoint } from "./DraftCheckpointStore";

interface RetentionCheck { ownerId: string; prepare(): Promise<boolean>; }
/** Other unfinished work a feature keeps on this device for an account, such as an upload. */
export interface DeviceWorkCheck { label: string; unfinished(ownerId: string): Promise<boolean>; }
const checks = new Set<RetentionCheck>();
export interface WorkspaceDraftReturnTarget { ownerId: string; projectId: string; conversationId: string; draftId: string; }
export type WorkspaceSignOutPreparation =
  | { safe: true }
  | { safe: false; reason: string; canSignOutWithDeviceCopy?: true; returnToDraft?: WorkspaceDraftReturnTarget };

/** Competing writer copies may share a destination; unrelated drafts do not. */
function returnTarget(drafts: readonly DraftCheckpoint[]): { returnToDraft?: WorkspaceDraftReturnTarget } {
  const targets = new Map<string, WorkspaceDraftReturnTarget>();
  for (const draft of drafts) {
    const target = { ownerId: draft.ownerId, projectId: draft.projectId, conversationId: draft.record.conversationId, draftId: draft.draftId };
    targets.set(canonicalJson(target), target);
  }
  const target = targets.size === 1 ? targets.values().next().value : undefined;
  return target ? { returnToDraft: target } : {};
}

/** Mounted workspaces register their own authoritative flush/checkpoint boundary. */
export function registerWorkspaceRetention(ownerId: string, prepare: () => Promise<boolean>): () => void {
  const check = { ownerId, prepare };
  checks.add(check);
  return () => { checks.delete(check); };
}

export async function prepareWorkspaceSignOut(ownerId: string, deviceWork: readonly DeviceWorkCheck[] = []): Promise<WorkspaceSignOutPreparation> {
  const owner = OwnerIdSchema.parse(ownerId);
  const owned = [...checks].filter(check => check.ownerId === ownerId);
  const results = await Promise.allSettled(owned.map(check => check.prepare()));
  if (results.some(result => result.status === "rejected" || !result.value)) return { safe: false, reason: "Keep a usable copy of your unfinished work before signing out." };
  const device = new DraftCheckpointStore();
  try {
    const retained = await device.retention(owner);
    if (retained.drafts.some(draft => draft.ownerId !== owner || draft.record.ownerId !== owner || draft.projectId !== draft.record.projectId || draft.draftId !== draft.record.id) || retained.submissions.some(submission => submission.ownerId !== owner)) throw new Error("Device work belongs to a different account or draft.");
    const unknown = retained.submissions.filter(submission => submission.state === "unknown");
    if (unknown.length) {
      const matching = retained.drafts.filter(draft => unknown.some(submission => submission.projectId === draft.projectId && submission.command.draftId === draft.draftId));
      const allLocated = unknown.every(submission => matching.some(draft => submission.projectId === draft.projectId && submission.command.draftId === draft.draftId));
      return { safe: false, reason: "A request has not finished confirming. Return to your draft and check the request before signing out.", ...(allLocated ? returnTarget(matching) : {}) };
    }
    // Schema projection is the exact draft content; metadata and server revision
    // are not authoring changes. The acknowledged checkpoint stores its new
    // server record, so an already saved edit does not become a false warning.
    const contentSchema = DraftContentSchema.strip();
    const acknowledged = retained.drafts.filter(draft => canonicalJson(draft.content) === canonicalJson(contentSchema.parse(draft.record)));
    const pendingDrafts = retained.drafts.filter(draft => {
      if (draft.record.status === "discarded" || canonicalJson(draft.content) === canonicalJson(contentSchema.parse(draft.record))) return false;
      // Reopening creates a new writer copy. Its newer server acknowledgement
      // can cover the same words in an older tab or legacy row without removing
      // either recovery copy. Different competing content remains unfinished.
      return !acknowledged.some(saved => saved.projectId === draft.projectId && saved.draftId === draft.draftId && Math.min(saved.record.revision, saved.serverRevision) >= draft.serverRevision && canonicalJson(saved.content) === canonicalJson(draft.content));
    });
    if (pendingDrafts.length) return { safe: false, reason: "This tab has a draft that hasn’t finished saving. Return to it before you leave, or sign out and keep a copy on this device for this account.", canSignOutWithDeviceCopy: true, ...returnTarget(pendingDrafts) };
    const unfinished = (await Promise.all(deviceWork.map(async check => (await check.unfinished(owner)) ? [check.label] : []))).flat();
    if (unfinished.length) return { safe: false, reason: `Unfinished work is still on this device: ${unfinished.join(", ")}. Return to it before you leave, or sign out and keep a copy on this device for this account.`, canSignOutWithDeviceCopy: true };
    return { safe: true };
  } catch {
    return { safe: false, reason: "Your saved work on this device could not be checked. Keep this tab open and try again before signing out." };
  } finally { device.close(); }
}
