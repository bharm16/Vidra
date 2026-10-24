import type { Firestore, Transaction } from "firebase-admin/firestore";
import { z } from "zod";
import { EditIdSchema, OwnerIdSchema, ProjectIdSchema } from "@shared/schemas/workflow/identity.schemas";
import { ExportIdSchema } from "@shared/schemas/workflow/video-edit.schemas";
import { sha256Hex } from "@utils/hash";
import { WorkflowError } from "@services/projects/WorkflowError";

/** Shared cross-kind identity authority. Native preparation callbacks are private to creation. */
const VideoExportReceiptBindingSchema = z.strictObject({
  kind: z.literal("video-export/v1"),
  ownerId: OwnerIdSchema,
  projectId: ProjectIdSchema,
  editId: EditIdSchema,
  exportId: ExportIdSchema,
  payloadHash: z.string(),
});

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
