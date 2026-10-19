import { z } from "zod";
import { OwnerIdSchema, ProjectIdSchema, VersionIdSchema } from "@shared/schemas/workflow/identity.schemas";
import { WorkflowShareIdSchema } from "@shared/schemas/workflow/sharing.schemas";

const CheckpointSchema = z.strictObject({ ownerId: OwnerIdSchema, projectId: ProjectIdSchema, versionId: VersionIdSchema, id: WorkflowShareIdSchema });
export interface ShareScope { ownerId: string; projectId: string; versionId: string }
export interface PublicationCheckpoint extends ShareScope { id: string }
const inMemory = new Map<string, PublicationCheckpoint>();
function key(scope: ShareScope): string { return `vidra:workflow-share:v1:${encodeURIComponent(scope.ownerId)}:${scope.projectId}:${scope.versionId}`; }
export function readPublication(scope: ShareScope): PublicationCheckpoint | undefined {
  try {
    const raw = localStorage.getItem(key(scope)); if (!raw) return inMemory.get(key(scope));
    const parsed = CheckpointSchema.safeParse(JSON.parse(raw));
    return parsed.success && parsed.data.ownerId === scope.ownerId && parsed.data.projectId === scope.projectId && parsed.data.versionId === scope.versionId ? parsed.data : undefined;
  } catch { return inMemory.get(key(scope)); }
}
export function writePublication(checkpoint: PublicationCheckpoint): boolean {
  inMemory.set(key(checkpoint), CheckpointSchema.parse(checkpoint));
  try { localStorage.setItem(key(checkpoint), JSON.stringify(CheckpointSchema.parse(checkpoint))); return true; } catch { return false; }
}
export function clearPublication(scope: ShareScope): void { inMemory.delete(key(scope)); try { localStorage.removeItem(key(scope)); } catch { /* In-memory identity remains authoritative for this panel. */ } }
