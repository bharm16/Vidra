import { z } from "zod";
import { FolderIdSchema, OwnerIdSchema } from "@shared/schemas/workflow/identity.schemas";
/** New projects are folders for library work; the retained id makes a lost response safe to retry. */
const IntentSchema = z.strictObject({ ownerId: OwnerIdSchema, folderId: FolderIdSchema, name: z.string().trim().min(1).max(200) });
export type ProjectCreationIntent = z.infer<typeof IntentSchema>;
const key = (ownerId: string): string => `vidra-project-create-v2:${encodeURIComponent(ownerId)}`;
export function readProjectCreationIntent(ownerId: string): ProjectCreationIntent | undefined {
  const raw = sessionStorage.getItem(key(ownerId));
  if (!raw) return undefined;
  const parsed = IntentSchema.parse(JSON.parse(raw) as unknown);
  if (parsed.ownerId !== ownerId) throw new Error("The pending project belongs to another account. Sign in to the original account.");
  return parsed;
}
export function keepProjectCreationIntent(ownerId: string, name: string): ProjectCreationIntent {
  const previous = readProjectCreationIntent(ownerId);
  if (previous) return previous;
  const intent = IntentSchema.parse({ ownerId, folderId: `folder_${crypto.randomUUID()}`, name });
  sessionStorage.setItem(key(ownerId), JSON.stringify(intent));
  // Confirm the receipt is retained before publishing a new project remotely.
  if (sessionStorage.getItem(key(ownerId)) !== JSON.stringify(intent)) throw new Error("This device could not retain the new project request. Allow browser storage and try again.");
  return intent;
}
export function clearProjectCreationIntent(ownerId: string, folderId: string): void { const current = readProjectCreationIntent(ownerId); if (current?.folderId === folderId) sessionStorage.removeItem(key(ownerId)); }
