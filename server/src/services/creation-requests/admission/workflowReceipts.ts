import type { Firestore, Transaction } from "firebase-admin/firestore";
import { z } from "zod";
import { AcceptedRequestSchema, SubmissionCommandSchema, type AcceptedRequest } from "@shared/schemas/workflow/request.schemas";
import { CreationDraftSchema } from "@shared/schemas/workflow/draft.schemas";
import { ConversationSchema } from "@shared/schemas/workflow/project.schemas";
import { EditIdSchema, OwnerIdSchema, ProjectIdSchema, RequestIdSchema, SubmissionIdSchema } from "@shared/schemas/workflow/identity.schemas";
import { ExportIdSchema } from "@shared/schemas/workflow/video-edit.schemas";
import { CapabilityProfileSchema } from "@shared/schemas/workflow/capability.schemas";
import { PreparedActionSchema, type PreparedAction } from "@shared/schemas/workflow/preparation.schemas";
import { canonicalJson } from "@shared/workflow/canonicalJson";
import { sha256Hex } from "@utils/hash";
import { WorkflowError } from "@services/projects/WorkflowError";
import { conversationNameAfterFirstRequest } from "@shared/workflow/conversationName";

const WorkflowReceiptSchema = z.strictObject({
  kind: z.literal("workflow/v2"), userId: OwnerIdSchema, route: z.literal("workflow/v2"),
  key: SubmissionIdSchema, projectId: ProjectIdSchema, requestId: RequestIdSchema,
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/), reviewedHash: z.string().regex(/^[a-f0-9]{64}$/),
});
const ConsumedDraftSchema = z.strictObject({
  ownerId: OwnerIdSchema, projectId: ProjectIdSchema, requestId: RequestIdSchema,
  reviewedHash: z.string().regex(/^[a-f0-9]{64}$/),
});
const VideoExportReceiptBindingSchema = z.strictObject({
  kind: z.literal("video-export/v1"),
  ownerId: OwnerIdSchema,
  projectId: ProjectIdSchema,
  editId: EditIdSchema,
  exportId: ExportIdSchema,
  payloadHash: z.string(),
});

export const WorkflowOutboxSchema = z.strictObject({
  schemaVersion: z.literal("vidra-execution/v2"), requestId: RequestIdSchema,
  ownerId: OwnerIdSchema, projectId: ProjectIdSchema,
  state: z.enum(["queued", "claimed", "observing", "complete", "needs-attention"]),
  profile: CapabilityProfileSchema, deadlineAt: z.iso.datetime(), createdAt: z.iso.datetime(),
});
export type WorkflowOutbox = z.infer<typeof WorkflowOutboxSchema>;

export interface WorkflowAdmissionInput {
  ownerId: string;
  projectId: string;
  command: unknown;
  prepare(transaction: Transaction): Promise<PreparedAction>;
}

export interface VideoExportReceiptScope {
  ownerId: string;
  projectId: string;
  editId: string;
  submissionId: string;
  executionDraftId: string;
  executionDraftRevision: number;
  payloadHash: string;
}

export function workflowReceiptId(ownerId: string, submissionId: string): string {
  return sha256Hex(`${ownerId}|workflow/v2|${submissionId}`);
}

export function workflowExecutionDraftKey(ownerId: string, executionDraftId: string, executionDraftRevision: number): string {
  return sha256Hex(`${ownerId}|${executionDraftId}|${executionDraftRevision}`);
}

function rejectExportIdentity(data: unknown): void {
  if (typeof data === "object" && data !== null && "kind" in data && data.kind === "video-export/v1") throw new WorkflowError("submission_conflict", "This action identity belongs to an accepted video export.");
}

export async function recoverVideoExportReceiptInTransaction<T>(
  database: Firestore,
  transaction: Transaction,
  scope: VideoExportReceiptScope,
  readExport: (transaction: Transaction, exportId: string) => Promise<T>,
): Promise<T | undefined> {
  const submissionRef = database.collection("request_idempotency").doc(workflowReceiptId(scope.ownerId, scope.submissionId));
  const executionKey = workflowExecutionDraftKey(scope.ownerId, scope.executionDraftId, scope.executionDraftRevision);
  const executionRef = database.collection("creation_consumed_drafts").doc(executionKey);
  const submission = await transaction.get(submissionRef);
  const execution = await transaction.get(executionRef);
  for (const row of [submission, execution]) {
    if (!row.exists) continue;
    const raw = z.object({ kind: z.string().optional() }).parse(row.data());
    if (raw.kind !== "video-export/v1") {
      throw new WorkflowError("submission_conflict", "This action identity belongs to another accepted request.");
    }
    const binding = VideoExportReceiptBindingSchema.parse(row.data());
    if (binding.ownerId !== scope.ownerId || binding.projectId !== scope.projectId || binding.editId !== scope.editId || binding.payloadHash !== scope.payloadHash) {
      throw new WorkflowError("submission_conflict", "This export action identity is already bound to different settings.");
    }
    const existing = await readExport(transaction, binding.exportId);
    // A second tab's submission gets the same immutable receipt.
    if (!submission.exists) transaction.create(submissionRef, binding);
    return existing;
  }
  return undefined;
}

export function commitVideoExportReceiptInTransaction(
  database: Firestore,
  transaction: Transaction,
  input: VideoExportReceiptScope & { exportId: string },
): void {
  const submissionRef = database.collection("request_idempotency").doc(workflowReceiptId(input.ownerId, input.submissionId));
  const executionKey = workflowExecutionDraftKey(input.ownerId, input.executionDraftId, input.executionDraftRevision);
  const executionRef = database.collection("creation_consumed_drafts").doc(executionKey);
  const binding = VideoExportReceiptBindingSchema.parse({
    kind: "video-export/v1",
    ownerId: input.ownerId,
    projectId: input.projectId,
    editId: input.editId,
    exportId: input.exportId,
    payloadHash: input.payloadHash,
  });
  transaction.create(submissionRef, binding);
  transaction.create(executionRef, binding);
}

/** All v2 consumption, receipt, intent and outbox facts commit in one authority. */
export async function acceptWorkflowRequest(database: Firestore, input: WorkflowAdmissionInput): Promise<AcceptedRequest> {
  const ownerId = OwnerIdSchema.parse(input.ownerId);
  const projectId = ProjectIdSchema.parse(input.projectId);
  const command = SubmissionCommandSchema.parse(input.command);
  const payloadHash = sha256Hex(canonicalJson({ projectId, command }));
  const receiptRef = database.collection("request_idempotency").doc(workflowReceiptId(ownerId, command.submissionId));
  const consumedId = workflowExecutionDraftKey(ownerId, command.draftId, command.draftRevision);
  const consumedRef = database.collection("creation_consumed_drafts").doc(consumedId);
  const timestamp = new Date().toISOString();
  return database.runTransaction(async transaction => {
    const receiptRow = await transaction.get(receiptRef);
    const consumedRow = await transaction.get(consumedRef);
    rejectExportIdentity(receiptRow.data());
    rejectExportIdentity(consumedRow.data());
    let priorRequestId: string | undefined;
    if (receiptRow.exists) {
      const receipt = WorkflowReceiptSchema.parse(receiptRow.data());
      if (receipt.userId !== ownerId || receipt.payloadHash !== payloadHash || receipt.projectId !== projectId) throw new WorkflowError("submission_conflict", "This submission identity already names a different captured request.");
      priorRequestId = receipt.requestId;
    } else if (consumedRow.exists) {
      const consumed = ConsumedDraftSchema.parse(consumedRow.data());
      if (consumed.ownerId !== ownerId || consumed.projectId !== projectId || consumed.reviewedHash !== command.reviewedHash) throw new WorkflowError("submission_conflict", "This draft revision was accepted with a different setup.");
      priorRequestId = consumed.requestId;
    }
    if (priorRequestId) {
      const row = await transaction.get(database.collection("creation_requests").doc(priorRequestId));
      if (!row.exists) throw new WorkflowError("read_only", "The accepted receipt needs recovery. It cannot become a new generation.");
      const request = AcceptedRequestSchema.parse(row.data());
      if (request.ownerId !== ownerId || request.projectId !== projectId) throw new WorkflowError("access_denied", "This receipt is unavailable.");
      if (!receiptRow.exists) transaction.create(receiptRef, WorkflowReceiptSchema.parse({ kind: "workflow/v2", userId: ownerId, route: "workflow/v2", key: command.submissionId, projectId, requestId: request.id, payloadHash, reviewedHash: command.reviewedHash }));
      return request;
    }
    const prepared = PreparedActionSchema.parse(await input.prepare(transaction));
    if (prepared.state !== "ready") throw new WorkflowError("invalid_settings", prepared.reasons[0]?.message ?? "This action is not ready.");
    if (prepared.draftId !== command.draftId || prepared.draftRevision !== command.draftRevision || prepared.reviewedHash !== command.reviewedHash || prepared.snapshot.destination.projectId !== projectId) throw new WorkflowError("revision_conflict", "The reviewed setup changed before acceptance. Review the retained draft again.");
    if (prepared.profile.pricing.mode !== "free" || prepared.profile.pricing.maximumCreditsPerSlot !== 0) throw new WorkflowError("capability_unavailable", "This release supports bounded free testing only.");
    const projectRef = database.collection("creation_projects").doc(projectId);
    const draftRef = projectRef.collection("drafts").doc(command.draftId);
    const conversationRef = projectRef.collection("conversations").doc(prepared.snapshot.destination.conversationId);
    const draftRow = await transaction.get(draftRef);
    const conversationRow = await transaction.get(conversationRef);
    const draft = CreationDraftSchema.parse(draftRow.data());
    const conversation = ConversationSchema.parse(conversationRow.data());
    if (draft.ownerId !== ownerId || conversation.ownerId !== ownerId || conversation.projectId !== projectId || draft.projectId !== projectId || draft.conversationId !== conversation.id) throw new WorkflowError("access_denied", "This execution draft is unavailable.");
    if (draft.status !== "open" && draft.status !== "parked") throw new WorkflowError("read_only", "This execution draft is already immutable.");
    if (draft.revision !== command.draftRevision || conversation.status !== "active") throw new WorkflowError("revision_conflict", "The execution destination changed before acceptance.");
    const requestId = RequestIdSchema.parse(`request_${consumedId}`);
    const request = AcceptedRequestSchema.parse({
      schemaVersion: "vidra-workflow/v2", id: requestId, ownerId, projectId, conversationId: conversation.id,
      submissionId: command.submissionId, executionDraftId: draft.id, executionDraftRevision: draft.revision,
      acceptanceSequence: conversation.acceptanceSequence + 1, snapshotHash: prepared.reviewedHash,
      snapshot: prepared.snapshot, materializedContext: prepared.materializedContext, acceptedAt: timestamp,
      slots: prepared.slotPlan.map(slot => ({
        id: `slot_${sha256Hex(`${requestId}:${slot.ordinal}`)}`, ...slot,
        outcome: "queued", delivery: "none", usage: { mode: "free", reserved: 0, settled: 0 },
      })),
    });
    transaction.create(database.collection("creation_requests").doc(request.id), request);
    transaction.create(receiptRef, WorkflowReceiptSchema.parse({ kind: "workflow/v2", userId: ownerId, route: "workflow/v2", key: command.submissionId, projectId, requestId: request.id, payloadHash, reviewedHash: prepared.reviewedHash }));
    // No TTL on v2 receipts or consumption tombstones: uncertainty cannot expire into permission.
    transaction.create(consumedRef, ConsumedDraftSchema.parse({ ownerId, projectId, requestId: request.id, reviewedHash: prepared.reviewedHash }));
    transaction.set(draftRef, CreationDraftSchema.parse({ ...draft, status: "submitted", updatedAt: timestamp }));
    transaction.set(conversationRef, ConversationSchema.parse({ ...conversation, name: conversationNameAfterFirstRequest(conversation.name, conversation.acceptanceSequence, prepared.snapshot.instructions), acceptanceSequence: request.acceptanceSequence, updatedAt: timestamp }));
    transaction.create(database.collection("creation_outbox").doc(request.id), WorkflowOutboxSchema.parse({
      schemaVersion: "vidra-execution/v2", requestId: request.id, ownerId, projectId,
      state: "queued", profile: prepared.profile, createdAt: timestamp,
      deadlineAt: new Date(Date.parse(timestamp) + prepared.profile.recovery.deadlineSeconds * 1000).toISOString(),
    }));
    return request;
  });
}

export async function readWorkflowRequest(database: Firestore, owner: string, submission: string): Promise<AcceptedRequest | undefined> {
  const ownerId = OwnerIdSchema.parse(owner);
  const submissionId = SubmissionIdSchema.parse(submission);
  const row = await database.collection("request_idempotency").doc(workflowReceiptId(ownerId, submissionId)).get();
  if (!row.exists) return undefined;
  rejectExportIdentity(row.data());
  const receipt = WorkflowReceiptSchema.parse(row.data());
  if (receipt.userId !== ownerId) throw new WorkflowError("access_denied", "This receipt is unavailable.");
  const requestRow = await database.collection("creation_requests").doc(receipt.requestId).get();
  if (!requestRow.exists) throw new WorkflowError("read_only", "The receipt is accepted but its request needs recovery. Do not submit another generation.");
  const request = AcceptedRequestSchema.parse(requestRow.data());
  if (request.ownerId !== ownerId) throw new WorkflowError("access_denied", "This request is unavailable.");
  return request;
}
