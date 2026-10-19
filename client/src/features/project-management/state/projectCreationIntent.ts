import { z } from "zod";
import { ConversationIdSchema, OwnerIdSchema, ProjectIdSchema } from "@shared/schemas/workflow/identity.schemas";
const IntentSchema = z.strictObject({ ownerId: OwnerIdSchema, projectId: ProjectIdSchema, conversationId: ConversationIdSchema, name: z.string().trim().min(1).max(200) });
export type ProjectCreationIntent = z.infer<typeof IntentSchema>;
const key = (ownerId: string): string => `vidra-project-create-v1:${encodeURIComponent(ownerId)}`;
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
  const intent = IntentSchema.parse({ ownerId, projectId: `project_${crypto.randomUUID()}`, conversationId: `conversation_${crypto.randomUUID()}`, name });
  sessionStorage.setItem(key(ownerId), JSON.stringify(intent));
  // Confirm the receipt is retained before publishing a new project remotely.
  if (sessionStorage.getItem(key(ownerId)) !== JSON.stringify(intent)) throw new Error("This device could not retain the new project request. Allow browser storage and try again.");
  return intent;
}
export function clearProjectCreationIntent(ownerId: string, projectId: string): void { const current = readProjectCreationIntent(ownerId); if (current?.projectId === projectId) sessionStorage.removeItem(key(ownerId)); }
