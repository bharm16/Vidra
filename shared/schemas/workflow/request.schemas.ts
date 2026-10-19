import { z } from "zod";
import { DraftContentSchema, ResolvedInputSchema } from "./draft.schemas";
import {
  ConversationIdSchema, DraftIdSchema, OwnerIdSchema, ProjectIdSchema,
  RequestIdSchema, RevisionSchema, SlotIdSchema, SubmissionIdSchema,
  TimestampSchema, VersionIdSchema, WorkflowSchemaVersion,
} from "./identity.schemas";

export const AcceptedSnapshotSchema = DraftContentSchema.extend({ inputs: z.array(ResolvedInputSchema).max(16) });
export const SlotUsageSchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("free"), reserved: z.literal(0), settled: z.literal(0) }),
  z.strictObject({ mode: z.literal("paid"), quoteId: z.string().min(1), reserved: z.number().int().nonnegative(), settled: z.number().int().nonnegative() }),
]);
export const RequestSlotSchema = z.strictObject({
  id: SlotIdSchema,
  ordinal: z.number().int().min(1).max(8),
  seed: z.number().int().min(0).max(2147483647).optional(),
  outcome: z.enum(["queued", "running", "unknown", "completed", "failed", "cancelled", "needs-attention"]),
  delivery: z.enum(["none", "storing", "stored", "attaching", "ready", "storage-failed", "attachment-failed", "lost"]),
  versionId: VersionIdSchema.optional(),
  text: z.string().max(32000).optional(),
  error: z.strictObject({ code: z.string().min(1).max(100), message: z.string().max(2000) }).optional(),
  cancellation: z.enum(["not-requested", "requested", "unsupported", "confirmed", "completion-won"]).default("not-requested"),
  usage: SlotUsageSchema,
});
export type RequestSlot = z.infer<typeof RequestSlotSchema>;

export const MaterializedContextSchema = z.strictObject({
  projectInstructions: z.string().max(32000),
  entries: z.array(z.strictObject({ requestId: RequestIdSchema, instructions: z.string().max(32000), textOutputs: z.array(z.strictObject({ slotId: SlotIdSchema, text: z.string().max(32000) })).max(8).optional() })).max(200),
});

export const AcceptedRequestSchema = z.strictObject({
  schemaVersion: WorkflowSchemaVersion,
  id: RequestIdSchema,
  ownerId: OwnerIdSchema,
  projectId: ProjectIdSchema,
  conversationId: ConversationIdSchema,
  submissionId: SubmissionIdSchema,
  executionDraftId: DraftIdSchema,
  executionDraftRevision: RevisionSchema,
  acceptanceSequence: RevisionSchema,
  snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
  snapshot: AcceptedSnapshotSchema,
  materializedContext: MaterializedContextSchema,
  slots: z.array(RequestSlotSchema).min(1).max(8),
  acceptedAt: TimestampSchema,
}).superRefine((request, ctx) => {
  if (request.snapshot.destination.projectId !== request.projectId || request.snapshot.destination.conversationId !== request.conversationId) {
    ctx.addIssue({ code: "custom", path: ["snapshot", "destination"], message: "Accepted destination is immutable and must match the request" });
  }
  if (request.slots.length !== request.snapshot.settings.outputCount || request.slots.some((slot, index) => slot.ordinal !== index + 1) || new Set(request.slots.map(slot => slot.id)).size !== request.slots.length) {
    ctx.addIssue({ code: "custom", path: ["slots"], message: "Output slots must have unique identities and stable consecutive ordinals" });
  }
  if (request.materializedContext.entries.length !== request.snapshot.context.requestIds.length || request.materializedContext.entries.some((entry, index) => entry.requestId !== request.snapshot.context.requestIds[index])) {
    ctx.addIssue({ code: "custom", path: ["materializedContext"], message: "Materialized context must retain the exact captured request order" });
  }
});
export type AcceptedRequest = z.infer<typeof AcceptedRequestSchema>;

export const SubmissionCommandSchema = z.strictObject({
  submissionId: SubmissionIdSchema,
  draftId: DraftIdSchema,
  draftRevision: RevisionSchema,
  reviewedHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type SubmissionCommand = z.infer<typeof SubmissionCommandSchema>;
