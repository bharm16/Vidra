import { randomUUID } from "node:crypto";
import { FieldPath } from "firebase-admin/firestore";
import type { DocumentReference, Firestore, Transaction } from "firebase-admin/firestore";
import { AcceptedRequestSchema, RequestSlotSchema, type AcceptedRequest, type RequestSlot } from "@shared/schemas/workflow/request.schemas";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { ProjectSchema } from "@shared/schemas/workflow/project.schemas";
import { OwnerIdSchema, RequestIdSchema, VersionIdSchema } from "@shared/schemas/workflow/identity.schemas";
import { WorkflowOutboxSchema } from "@services/admission/idempotency/workflowReceipts";
import type { MediaVersionIndex } from "@services/media-history/MediaVersionIndex";
import { WorkflowError } from "@services/projects/WorkflowError";
import { ExecutionAttemptSchema, NativeOutputSchema, VerifiedOutputSchema, instructionsFor, type ExecutionAttempt, type NativeOutput, type VerifiedOutput } from "./types";

/** One permanent attempt per accepted output slot. A lost lease never permits another provider call. */
export class WorkflowExecutionStore {
  constructor(private readonly database: Firestore, private readonly media: MediaVersionIndex, private readonly now: () => string = () => new Date().toISOString()) {}

  private ref(id: string): DocumentReference { return this.database.collection("creation_requests").doc(RequestIdSchema.parse(id)); }
  private attemptRef(id: string, slotId: string): DocumentReference { return this.ref(id).collection("execution_attempts").doc(slotId); }

  async get(owner: string, id: string, transaction?: Transaction): Promise<AcceptedRequest> {
    const ownerId = OwnerIdSchema.parse(owner);
    const ref = this.ref(id);
    const row = transaction ? await transaction.get(ref) : await ref.get();
    if (!row.exists) throw new WorkflowError("not_found", "This request is unavailable.");
    const request = AcceptedRequestSchema.parse(row.data());
    if (request.ownerId !== ownerId || request.id !== id) throw new WorkflowError("access_denied", "This request is unavailable.");
    return request;
  }

  async claim(owner: string, id: string, slotId: string): Promise<{ request: AcceptedRequest; attempt?: ExecutionAttempt }> {
    return this.database.runTransaction(async transaction => {
      const request = await this.get(owner, id, transaction);
      const slot = request.slots.find(candidate => candidate.id === slotId);
      if (!slot) throw new WorkflowError("not_found", "This output is unavailable.");
      const ref = this.attemptRef(id, slotId);
      const prior = await transaction.get(ref);
      if (prior.exists || slot.outcome !== "queued") return { request };
      const outboxRef = this.database.collection("creation_outbox").doc(id);
      const outboxRow = await transaction.get(outboxRef);
      if (!outboxRow.exists) throw new WorkflowError("read_only", "This accepted request needs recovery. Do not submit it again.");
      const outbox = WorkflowOutboxSchema.parse(outboxRow.data());
      if (outbox.ownerId !== owner || outbox.requestId !== id || outbox.projectId !== request.projectId || outbox.profile.id !== request.snapshot.settings.profileId || outbox.profile.revision !== request.snapshot.settings.profileRevision) throw new WorkflowError("submission_conflict", "The accepted execution identity does not match its captured setup.");
      const projectRow = await transaction.get(this.database.collection("creation_projects").doc(request.projectId));
      const project = projectRow.exists ? ProjectSchema.parse(projectRow.data()) : undefined;
      if (!project || project.status !== "active" || project.ownerId !== owner || (project.origin.kind !== "new" && project.origin.authority !== "workflow")) {
        const next = this.replaceSlot(request, slotId, { outcome: "cancelled", cancellation: "confirmed" });
        transaction.set(this.ref(id), next);
        return { request: next };
      }
      const attempt = ExecutionAttemptSchema.parse({ requestId: id, slotId, ownerId: owner, projectId: request.projectId, token: randomUUID(), snapshotHash: request.snapshotHash, state: "running", startedAt: this.now(), deadlineAt: new Date(Date.parse(this.now()) + outbox.profile.recovery.deadlineSeconds * 1000).toISOString(), profile: outbox.profile, sentInstructions: instructionsFor(request) });
      const next = this.replaceSlot(request, slotId, { outcome: "running" });
      transaction.create(ref, attempt);
      transaction.set(this.ref(id), next);
      transaction.set(outboxRef, { ...outbox, state: "claimed" });
      return { request: next, attempt };
    });
  }

  async attempts(owner: string, id: string): Promise<ExecutionAttempt[]> {
    const request = await this.get(owner, id);
    const rows = await this.ref(id).collection("execution_attempts").get();
    return rows.docs.map(row => {
      const attempt = ExecutionAttemptSchema.parse(row.data());
      if (attempt.ownerId !== owner || attempt.requestId !== id || attempt.snapshotHash !== request.snapshotHash || !request.slots.some(slot => slot.id === attempt.slotId)) throw new WorkflowError("access_denied", "This execution is unavailable.");
      return attempt;
    });
  }

  async produced(attempt: ExecutionAttempt, input: NativeOutput): Promise<void> {
    const output = NativeOutputSchema.parse(input);
    await this.database.runTransaction(async transaction => {
      const request = await this.get(attempt.ownerId, attempt.requestId, transaction);
      const ref = this.attemptRef(attempt.requestId, attempt.slotId);
      const row = await transaction.get(ref);
      const current = ExecutionAttemptSchema.parse(row.data());
      this.fence(attempt, current, request);
      if (current.output) {
        if (JSON.stringify(current.output) !== JSON.stringify(output)) throw new WorkflowError("submission_conflict", "This output already has a different stored result.");
        return;
      }
      transaction.set(ref, ExecutionAttemptSchema.parse({ ...current, state: "produced", output }));
      transaction.set(this.ref(request.id), this.replaceSlot(request, attempt.slotId, { outcome: "completed", delivery: output.kind === "text" ? "none" : "storing" }));
    });
  }

  async publish(attempt: ExecutionAttempt, verified?: VerifiedOutput): Promise<AcceptedRequest> {
    return this.database.runTransaction(async transaction => {
      const request = await this.get(attempt.ownerId, attempt.requestId, transaction);
      const ref = this.attemptRef(request.id, attempt.slotId);
      const row = await transaction.get(ref);
      const current = ExecutionAttemptSchema.parse(row.data());
      this.fence(attempt, current, request);
      if (current.state === "published") return request;
      if (!current.output) throw new WorkflowError("read_only", "This output has not completed yet.");
      let patch: Partial<RequestSlot>;
      if (current.output.kind === "text") patch = { outcome: "completed", delivery: "ready", text: current.output.text };
      else {
        const stored = VerifiedOutputSchema.parse(verified);
        const versionId = VersionIdSchema.parse(`version_${current.slotId.slice(5)}`);
        const projectRow = await transaction.get(this.database.collection("creation_projects").doc(request.projectId));
        const project = projectRow.exists ? ProjectSchema.parse(projectRow.data()) : undefined;
        await this.media.publishInTransaction(
          transaction,
          project,
          {
            id: versionId,
            ownerId: request.ownerId,
            projectId: request.projectId,
            kind: current.output.kind,
            label: request.snapshot.instructions.trim().slice(0, 160) || (current.output.kind === "image" ? "Picture" : "Clip"),
            origin: { kind: "generated", requestId: request.id, slotId: current.slotId },
            sourceInputs: request.snapshot.inputs,
            ...stored,
            createdAt: current.startedAt,
          },
          { conflictMessage: "This result identity already belongs to different stored bytes." },
        );
        patch = { outcome: "completed", delivery: "ready", versionId };
      }
      const next = this.replaceSlot(request, current.slotId, patch, true);
      transaction.set(this.ref(request.id), next);
      transaction.set(ref, ExecutionAttemptSchema.parse({ ...current, state: "published" }));
      return next;
    });
  }

  async fail(attempt: ExecutionAttempt, kind: "preflight" | "unknown" | "delivery", preflightMessage?: string): Promise<void> {
    await this.database.runTransaction(async transaction => {
      const request = await this.get(attempt.ownerId, attempt.requestId, transaction);
      const ref = this.attemptRef(request.id, attempt.slotId);
      const row = await transaction.get(ref);
      const current = ExecutionAttemptSchema.parse(row.data());
      this.fence(attempt, current, request);
      if (current.state === "published" || (current.output && kind !== "delivery")) return;
      const error = kind === "preflight" ? { code: "not_started", message: preflightMessage ?? "This action could not start. Your request is retained; choose an available model and try again." } : kind === "delivery" ? { code: "delivery_pending", message: "Your result was made, but could not finish saving. Retry saving this result." } : { code: "outcome_unknown", message: "The provider's outcome could not be confirmed. This request will not be submitted again automatically." };
      transaction.set(ref, { ...current, state: current.output ? "produced" : kind === "preflight" ? "failed" : "needs-attention" });
      transaction.set(this.ref(request.id), this.replaceSlot(request, current.slotId, { outcome: current.output ? "completed" : kind === "preflight" ? "failed" : "needs-attention", delivery: current.output ? "storage-failed" : "none", error }));
    });
  }

  async cancel(owner: string, id: string): Promise<AcceptedRequest> {
    return this.database.runTransaction(async transaction => {
      const request = await this.get(owner, id, transaction);
      const slots = request.slots.map(slot => {
        if (slot.outcome === "queued") return RequestSlotSchema.parse({ ...slot, outcome: "cancelled", cancellation: "confirmed" });
        if (slot.outcome === "running" || slot.outcome === "unknown" || slot.outcome === "needs-attention") return RequestSlotSchema.parse({ ...slot, cancellation: "unsupported" });
        return slot;
      });
      const next = AcceptedRequestSchema.parse({ ...request, slots });
      transaction.set(this.ref(id), next);
      return next;
    });
  }

  async recoveries(owner: string): Promise<MediaVersion[]> {
    return this.media.listRecoveries(owner);
  }

  async queued(limit = 20, after?: string): Promise<Array<{ ownerId: string; requestId: string }>> {
    let query = this.database.collection("creation_outbox").where("state", "in", ["queued", "claimed", "observing"]).orderBy(FieldPath.documentId()).limit(limit);
    if (after) query = query.startAfter(RequestIdSchema.parse(after));
    const rows = await query.get();
    return rows.docs.map(row => { const outbox = WorkflowOutboxSchema.parse(row.data()); return { ownerId: outbox.ownerId, requestId: outbox.requestId }; });
  }

  async finishOutbox(owner: string, id: string): Promise<void> {
    await this.database.runTransaction(async transaction => {
      const request = await this.get(owner, id, transaction);
      const ref = this.database.collection("creation_outbox").doc(id);
      const row = await transaction.get(ref);
      if (!row.exists) return;
      const outbox = WorkflowOutboxSchema.parse(row.data());
      const active = request.slots.some(slot => slot.outcome === "queued" || slot.outcome === "running" || (slot.outcome === "completed" && slot.delivery !== "ready"));
      transaction.set(ref, { ...outbox, state: active ? "observing" : request.slots.some(slot => slot.outcome === "needs-attention" || slot.outcome === "unknown") ? "needs-attention" : "complete" });
    });
  }

  private fence(expected: ExecutionAttempt, actual: ExecutionAttempt, request: AcceptedRequest): void {
    if (expected.token !== actual.token || actual.snapshotHash !== request.snapshotHash || actual.requestId !== request.id || actual.ownerId !== request.ownerId || actual.projectId !== request.projectId || actual.slotId !== expected.slotId) throw new WorkflowError("submission_conflict", "This execution attempt no longer owns this output.");
  }

  private replaceSlot(request: AcceptedRequest, id: string, patch: Partial<RequestSlot>, clearError = false): AcceptedRequest {
    return AcceptedRequestSchema.parse({ ...request, slots: request.slots.map(slot => {
      if (slot.id !== id) return slot;
      if (!clearError) return RequestSlotSchema.parse({ ...slot, ...patch });
      const { error: _error, ...retained } = slot;
      return RequestSlotSchema.parse({ ...retained, ...patch });
    }) });
  }
}
