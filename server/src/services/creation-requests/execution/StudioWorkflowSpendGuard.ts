import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import type { CapabilityProfile } from "@shared/schemas/workflow/capability.schemas";
import { AcceptedRequestSchema, type AcceptedRequest, type RequestSlot } from "@shared/schemas/workflow/request.schemas";
import { ProjectSchema } from "@shared/schemas/workflow/project.schemas";
import { StudioCapExceededError, studioUsageDayKey } from "@services/studio/storage/FirestoreStudioProjectStore";
import { canonicalJson } from "@shared/workflow/canonicalJson";
import { ExecutionAttemptSchema, WorkflowPreflightError, WorkflowSpendReservationSchema, type WorkflowSpendGuard } from "./types";
import { DEFAULT_WORKFLOW_SPEND_POLICY, WorkflowSpendPolicySchema, workflowSpendMappingHash, type WorkflowSpendPolicy } from "./workflowSpendPolicy";

const StudioUsageSchema = z.object({ userId: z.string(), day: z.string(), reservedCents: z.number().nonnegative().finite() });

/** Same Studio authority/counter, atomically paired with the canonical slot's permanent reservation marker. */
export class StudioWorkflowSpendGuard implements WorkflowSpendGuard {
  private readonly policy: WorkflowSpendPolicy;
  private readonly dailyCapCents: number;
  constructor(private readonly database: Firestore, options: { dailyCapCents: number; policy?: unknown }, private readonly now: () => number = Date.now) {
    this.dailyCapCents = z.number().int().nonnegative().parse(options.dailyCapCents);
    this.policy = WorkflowSpendPolicySchema.parse(options.policy ?? DEFAULT_WORKFLOW_SPEND_POLICY);
  }

  qualified(profile: CapabilityProfile): boolean {
    const ceiling = this.policy.ceilings.find(entry => entry.profileId === profile.id);
    return this.dailyCapCents > 0 && Date.parse(this.policy.validUntil) > this.now() && ceiling?.profileRevision === profile.revision && ceiling.mappingHash === workflowSpendMappingHash(profile) && ceiling.maximumCentsPerSlot <= this.dailyCapCents;
  }

  reason(_profile: CapabilityProfile): string { return "This model is unavailable during bounded free testing. Choose another available model; your instructions and inputs are retained."; }

  async reserve(request: AcceptedRequest, slot: RequestSlot, profile: CapabilityProfile): Promise<boolean> {
    if (!this.qualified(profile)) throw new WorkflowPreflightError(this.reason(profile));
    const ceiling = this.policy.ceilings.find(entry => entry.profileId === profile.id);
    if (!ceiling) throw new WorkflowPreflightError(this.reason(profile));
    try {
      return await this.database.runTransaction(async transaction => {
        const requestRef = this.database.collection("creation_requests").doc(request.id);
        const attemptRef = requestRef.collection("execution_attempts").doc(slot.id);
        const [requestRow, attemptRow, projectRow] = await Promise.all([transaction.get(requestRef), transaction.get(attemptRef), transaction.get(this.database.collection("creation_projects").doc(request.projectId))]);
        if (!requestRow.exists || !attemptRow.exists || !projectRow.exists) throw new WorkflowPreflightError("This accepted action is unavailable.");
        const captured = AcceptedRequestSchema.parse(requestRow.data()); const attempt = ExecutionAttemptSchema.parse(attemptRow.data()); const project = ProjectSchema.parse(projectRow.data());
        const currentSlot = captured.slots.find(candidate => candidate.id === slot.id);
        if (captured.ownerId !== request.ownerId || captured.projectId !== request.projectId || captured.snapshotHash !== request.snapshotHash || canonicalJson(captured.snapshot) !== canonicalJson(request.snapshot) || !currentSlot || currentSlot.seed !== slot.seed || currentSlot.ordinal !== slot.ordinal || attempt.ownerId !== captured.ownerId || attempt.projectId !== captured.projectId || attempt.requestId !== captured.id || attempt.slotId !== slot.id || attempt.snapshotHash !== captured.snapshotHash || workflowSpendMappingHash(attempt.profile) !== workflowSpendMappingHash(profile)) throw new WorkflowPreflightError("This accepted action identity is unavailable.");
        if (attempt.spend) {
          if (attempt.spend.mappingHash !== ceiling.mappingHash || attempt.spend.cents < ceiling.maximumCentsPerSlot) throw new WorkflowPreflightError("This action's existing allowance no longer covers its captured settings.");
          return false;
        }
        if (attempt.state !== "running" || currentSlot.outcome !== "running" || project.ownerId !== captured.ownerId || project.status !== "active" || (project.origin.kind !== "new" && project.origin.authority !== "workflow")) throw new WorkflowPreflightError("This action can no longer start.");
        const day = studioUsageDayKey(new Date(attempt.startedAt));
        const usageRef = this.database.collection("studio_usage").doc(`${captured.ownerId}_${day}`);
        const usageRow = await transaction.get(usageRef);
        const usage = usageRow.exists ? StudioUsageSchema.parse(usageRow.data()) : { userId: captured.ownerId, day, reservedCents: 0 };
        if (usage.userId !== captured.ownerId || usage.day !== day) throw new WorkflowPreflightError("The free-testing allowance is unavailable.");
        if (usage.reservedCents + ceiling.maximumCentsPerSlot > this.dailyCapCents) throw new StudioCapExceededError(usage.reservedCents, ceiling.maximumCentsPerSlot, this.dailyCapCents);
        const spend = WorkflowSpendReservationSchema.parse({ authority: "studio_usage/v1", day, cents: ceiling.maximumCentsPerSlot, policyRevision: this.policy.revision, mappingHash: ceiling.mappingHash });
        transaction.set(usageRef, { userId: captured.ownerId, day, reservedCents: usage.reservedCents + spend.cents });
        transaction.set(attemptRef, { ...attempt, spend });
        return true;
      });
    } catch (error) {
      if (error instanceof StudioCapExceededError) throw new WorkflowPreflightError("The daily free-testing allowance has been reached. This action did not start.");
      throw error;
    }
  }
}
