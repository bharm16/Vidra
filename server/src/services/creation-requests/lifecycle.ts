import type { Firestore } from "firebase-admin/firestore";
import { SubmissionCommandSchema, type AcceptedRequest } from "@shared/schemas/workflow/request.schemas";
import type { PreparedAction } from "@shared/schemas/workflow/preparation.schemas";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import type { ActionPreparationService } from "./preparation/ActionPreparationService";
import type { WorkflowExecutionService } from "./execution/WorkflowExecutionService";
import { acceptWorkflowRequest, readWorkflowRequest } from "./admission/workflowReceipts";

/** Owns atomic preparation/acceptance and dispatch. Transport callers never handle transactions or outbox ordering. */
export class CreationRequestLifecycle {
  constructor(private readonly database: Firestore, private readonly preparation: ActionPreparationService, private readonly execution: WorkflowExecutionService) {}
  prepare(ownerId: string, projectId: string, draftId: string): Promise<PreparedAction> { return this.preparation.prepare(ownerId, projectId, draftId); }
  async accept(ownerId: string, projectId: string, input: unknown): Promise<AcceptedRequest> {
    const command = SubmissionCommandSchema.parse(input);
    const request = await acceptWorkflowRequest(this.database, { ownerId, projectId, command, prepare: transaction => this.preparation.prepareInTransaction(transaction, ownerId, projectId, command.draftId) });
    // Durable authority precedes dispatch; replay schedules only the already accepted attempt.
    await this.execution.start(ownerId, request.id);
    return request;
  }
  recover(ownerId: string, submissionId: string): Promise<AcceptedRequest | undefined> { return readWorkflowRequest(this.database, ownerId, submissionId); }
  status(ownerId: string, requestId: string): Promise<AcceptedRequest> { return this.execution.get(ownerId, requestId); }
  cancel(ownerId: string, requestId: string): Promise<AcceptedRequest> { return this.execution.cancel(ownerId, requestId); }
  reconcile(ownerId: string, requestId: string): Promise<AcceptedRequest> { return this.execution.reconcile(ownerId, requestId); }
  recovery(ownerId: string): Promise<MediaVersion[]> { return this.execution.recovery(ownerId); }
}
