import { z } from "zod";
import { ImportIdSchema } from "./import.schemas";
import {
  ConversationIdSchema, DraftIdSchema, EditIdSchema, OwnerIdSchema,
  ProjectIdSchema, RequestIdSchema, RevisionSchema, SlotIdSchema,
  TimestampSchema, VersionIdSchema, WorkflowSchemaVersion,
} from "./identity.schemas";

export const CreationActionSchema = z.enum([
  "make-image", "edit-image", "upscale-image", "make-video", "animate-image",
  "edit-video", "extend-video", "ask", "expand-description", "improve-words",
  "import", "accept-sketch", "export-video",
]);
export type CreationAction = z.infer<typeof CreationActionSchema>;

export const InputRoleSchema = z.enum(["primary", "reference", "mask", "start-frame", "end-frame", "clip", "audio"]);
export const ResolvedInputSchema = z.strictObject({
  role: InputRoleSchema,
  state: z.literal("resolved"),
  versionId: VersionIdSchema,
});
export const PendingInputSchema = z.strictObject({
  role: InputRoleSchema,
  state: z.literal("pending"),
  requestId: RequestIdSchema,
  slotId: SlotIdSchema,
});
export const ImportInputSchema = z.strictObject({ role: InputRoleSchema, state: z.literal("importing"), importId: ImportIdSchema });
export const DraftInputSchema = z.discriminatedUnion("state", [ResolvedInputSchema, PendingInputSchema, ImportInputSchema]);
export type DraftInput = z.infer<typeof DraftInputSchema>;

export const DraftSettingsSchema = z.strictObject({
  profileId: z.string().min(1).max(160),
  profileRevision: z.string().min(1).max(160),
  parameters: z.record(z.string().min(1).max(80), z.union([z.string().max(4000), z.number().finite(), z.boolean()])),
  outputCount: z.number().int().min(1).max(8),
});
export const BranchContextSchema = z.strictObject({
  origin: z.enum(["empty", "branch", "explicit", "unknown"]),
  parentRequestId: RequestIdSchema.optional(),
  requestIds: z.array(RequestIdSchema).max(200),
  projectInstructionsRevision: RevisionSchema,
  summary: z.strictObject({ requestIds: z.array(RequestIdSchema).min(1).max(200), text: z.string().min(1).max(32000) }).optional(),
});
export const ProjectDestinationSchema = z.strictObject({
  projectId: ProjectIdSchema,
  conversationId: ConversationIdSchema,
});
export const ContextualTargetSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("draft"), draftId: DraftIdSchema, revision: RevisionSchema }),
  z.strictObject({ kind: z.literal("video-edit"), editId: EditIdSchema, revision: RevisionSchema }),
  z.strictObject({ kind: z.literal("media"), versionId: VersionIdSchema }),
]);

export const DraftContentSchema = z.strictObject({
  action: CreationActionSchema,
  instructions: z.string().max(32000),
  inputs: z.array(DraftInputSchema).max(16),
  settings: DraftSettingsSchema,
  context: BranchContextSchema,
  destination: ProjectDestinationSchema,
  contextualTarget: ContextualTargetSchema.optional(),
});
export type DraftContent = z.infer<typeof DraftContentSchema>;

export const CreationDraftSchema = z.strictObject({
  schemaVersion: WorkflowSchemaVersion,
  id: DraftIdSchema,
  ownerId: OwnerIdSchema,
  projectId: ProjectIdSchema,
  conversationId: ConversationIdSchema,
  revision: RevisionSchema,
  status: z.enum(["open", "parked", "submitted", "discarded"]),
  ...DraftContentSchema.shape,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
}).superRefine((draft, ctx) => {
  if (draft.destination.projectId !== draft.projectId || draft.destination.conversationId !== draft.conversationId) {
    ctx.addIssue({ code: "custom", path: ["destination"], message: "A draft destination must belong to its project and conversation" });
  }
  if (new Set(draft.context.requestIds).size !== draft.context.requestIds.length) {
    ctx.addIssue({ code: "custom", path: ["context", "requestIds"], message: "Context requests must be unique and ordered" });
  }
});
export type CreationDraft = z.infer<typeof CreationDraftSchema>;

export const SaveDraftCommandSchema = z.strictObject({
  expectedRevision: RevisionSchema,
  content: DraftContentSchema,
});
export const CreateDraftCommandSchema = z.strictObject({ id: DraftIdSchema, content: DraftContentSchema });
export const RestoreDraftCommandSchema = z.strictObject({ expectedRevision: RevisionSchema, sourceRevision: RevisionSchema });
export const DraftConflictSchema = z.strictObject({
  id: z.string().regex(/^conflict_[a-f0-9]{64}$/),
  draftId: DraftIdSchema,
  ownerId: OwnerIdSchema,
  expectedRevision: RevisionSchema,
  content: DraftContentSchema,
  createdAt: TimestampSchema,
});
export type DraftConflict = z.infer<typeof DraftConflictSchema>;
export type SaveDraftResult = { state: "saved"; draft: CreationDraft } | { state: "conflict"; current: CreationDraft; retained: DraftConflict };
