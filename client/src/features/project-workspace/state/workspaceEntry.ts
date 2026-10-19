import { z } from "zod";
import { ConversationIdSchema, DraftIdSchema, OwnerIdSchema, ProjectIdSchema } from "@shared/schemas/workflow/identity.schemas";
import type { CreationDraft } from "@shared/schemas/workflow/draft.schemas";

const TargetSchema = z.strictObject({ ownerId: OwnerIdSchema, projectId: ProjectIdSchema, conversationId: ConversationIdSchema.optional(), draftId: DraftIdSchema.optional() }).refine(target => !target.draftId || Boolean(target.conversationId), "A draft return needs its conversation.");
const CreatedTargetSchema = z.strictObject({ ownerId: OwnerIdSchema, projectId: ProjectIdSchema });
const ReopenTicketSchema = z.strictObject({ kind: z.literal("reopen"), entryId: z.uuid(), ownerId: OwnerIdSchema, projectId: ProjectIdSchema, conversationId: ConversationIdSchema.optional(), draftId: DraftIdSchema.optional() }).refine(target => !target.draftId || Boolean(target.conversationId), "A draft return needs its conversation.");
const CreatedTicketSchema = z.strictObject({ kind: z.literal("created"), entryId: z.uuid(), ownerId: OwnerIdSchema, projectId: ProjectIdSchema, conversationId: z.never().optional(), draftId: z.never().optional() });
const TicketSchema = z.union([ReopenTicketSchema, CreatedTicketSchema]);
const NavigationSchema = z.object({ workspaceEntry: TicketSchema });
export type WorkspaceEntryTarget = z.input<typeof TargetSchema>;
export type WorkspaceEntryTicket = z.output<typeof TicketSchema>;
export interface WorkspaceEntryBinding { kind: WorkspaceEntryTicket["kind"]; entryId: string; ownerId: string; projectId: string; conversationId: string; draftId: string; }
type EntryDraft = Pick<CreationDraft, "id" | "ownerId" | "projectId" | "conversationId" | "status">;

/** Navigation provenance only; it never becomes draft or request data. */
export function reopenWorkspaceState(target: WorkspaceEntryTarget): { workspaceEntry: WorkspaceEntryTicket } {
  return { workspaceEntry: ReopenTicketSchema.parse({ ...TargetSchema.parse(target), kind: "reopen", entryId: crypto.randomUUID() }) };
}

/** A successful project creation is an explicit entry, independent of its name or content. */
export function createdWorkspaceState(target: z.input<typeof CreatedTargetSchema>): { workspaceEntry: WorkspaceEntryTicket } {
  return { workspaceEntry: CreatedTicketSchema.parse({ ...CreatedTargetSchema.parse(target), kind: "created", entryId: crypto.randomUUID() }) };
}

/** Retire only this creation ticket; unrelated router state and return tickets survive. */
export function consumeCreatedWorkspaceEntry(state: unknown, entryId: string): { consumed: boolean; state: unknown } {
  const parsed = NavigationSchema.safeParse(state);
  if (!parsed.success || parsed.data.workspaceEntry.kind !== "created" || parsed.data.workspaceEntry.entryId !== entryId || typeof state !== "object" || state === null) return { consumed: false, state };
  const remaining = Object.fromEntries(Object.entries(state).filter(([key]) => key !== "workspaceEntry"));
  return { consumed: true, state: Object.keys(remaining).length ? remaining : undefined };
}

export function workspaceEntryPath(target: WorkspaceEntryTarget): string {
  const parsed = TargetSchema.parse(target);
  const query = parsed.conversationId ? `?conversation=${encodeURIComponent(parsed.conversationId)}` : "";
  // The exact draft travels in the validated ticket, not a second URL selector.
  return `/app/project/${encodeURIComponent(parsed.projectId)}${query}`;
}

export function readWorkspaceEntry(state: unknown, ownerId: string, projectId: string): WorkspaceEntryTicket | undefined {
  const parsed = NavigationSchema.safeParse(state);
  return parsed.success && parsed.data.workspaceEntry.ownerId === ownerId && parsed.data.workspaceEntry.projectId === projectId ? parsed.data.workspaceEntry : undefined;
}

export function bindWorkspaceEntry(ticket: WorkspaceEntryTicket, draft: EntryDraft | undefined): WorkspaceEntryBinding | undefined {
  if (!draft || !["open", "parked"].includes(draft.status) || draft.ownerId !== ticket.ownerId || draft.projectId !== ticket.projectId || ticket.conversationId && draft.conversationId !== ticket.conversationId || ticket.draftId && draft.id !== ticket.draftId) return undefined;
  return { kind: ticket.kind, entryId: ticket.entryId, ownerId: draft.ownerId, projectId: draft.projectId, conversationId: draft.conversationId, draftId: draft.id };
}

/** Edits and save acknowledgements retain the opened working copy's identity. */
export function workspaceEntryMatches(binding: WorkspaceEntryBinding | undefined, draft: EntryDraft | undefined): boolean {
  return Boolean(binding && draft && ["open", "parked"].includes(draft.status) && binding.ownerId === draft.ownerId && binding.projectId === draft.projectId && binding.conversationId === draft.conversationId && binding.draftId === draft.id);
}
