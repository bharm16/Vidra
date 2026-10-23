import type { Firestore, Transaction } from "firebase-admin/firestore";
import { z } from "zod";
import type { CapabilityProfile } from "@shared/schemas/workflow/capability.schemas";
import { AcceptedRequestSchema, type AcceptedRequest, type RequestSlot } from "@shared/schemas/workflow/request.schemas";
import { ProjectSchema } from "@shared/schemas/workflow/project.schemas";
import { StudioCapExceededError, studioUsageDayKey } from "@services/studio/storage/FirestoreStudioProjectStore";
import { canonicalJson } from "@shared/workflow/canonicalJson";
import { OwnerIdSchema, RequestIdSchema, SlotIdSchema, TimestampSchema } from "@shared/schemas/workflow/identity.schemas";
import { logger } from "@infrastructure/Logger";
import { ExecutionAttemptSchema, WorkflowPreflightError, WorkflowSpendReservationSchema, type ExecutionAttempt, type VerifiedOutput, type WorkflowSpendGuard } from "./types";
import { DEFAULT_WORKFLOW_SPEND_POLICY, WorkflowSpendPolicySchema, workflowSpendMappingHash, type WorkflowSpendPolicy } from "./workflowSpendPolicy";

const StudioUsageSchema = z.object({ userId: z.string(), day: z.string(), reservedCents: z.number().nonnegative().finite() });
/** One per profile. It stays until an operator reviews the ceiling and deletes it. */
const SPEND_HOLDS = "workflow_spend_holds";
const SpendHoldSchema = z.strictObject({ profileId: z.string().min(1).max(160), maximumOutputSeconds: z.number().positive(), observedSeconds: z.number().nonnegative(), requestId: RequestIdSchema, slotId: SlotIdSchema, heldAt: TimestampSchema });
type ProviderSpendReservation = z.infer<typeof WorkflowSpendReservationSchema>;

/** Same Studio authority/counter, atomically paired with the canonical slot's permanent reservation marker. */
export class StudioWorkflowSpendGuard implements WorkflowSpendGuard {
  private readonly policy: WorkflowSpendPolicy;
  private readonly dailyCapCents: number;
  /** Holds this instance has written, met or loaded; reservations check the stored record regardless. */
  private readonly held = new Set<string>();
  private readonly log = logger.child({ service: "StudioWorkflowSpendGuard" });
  private refresh: NodeJS.Timeout | undefined;
  constructor(private readonly database: Firestore, options: { dailyCapCents: number; policy?: unknown }, private readonly now: () => number = Date.now) {
    this.dailyCapCents = z.number().int().nonnegative().parse(options.dailyCapCents);
    this.policy = WorkflowSpendPolicySchema.parse(options.policy ?? DEFAULT_WORKFLOW_SPEND_POLICY);
  }

  qualified(profile: CapabilityProfile): boolean {
    const ceiling = this.policy.ceilings.find(entry => entry.profileId === profile.id);
    return !this.held.has(profile.id) && this.dailyCapCents > 0 && Date.parse(this.policy.validUntil) > this.now() && ceiling?.profileRevision === profile.revision && ceiling.mappingHash === workflowSpendMappingHash(profile) && ceiling.maximumCentsPerSlot <= this.dailyCapCents;
  }

  reason(_profile: CapabilityProfile): string { return "This model is unavailable during bounded free testing. Choose another available model; your instructions and inputs are retained."; }

  /** Learns holds other instances stored, before serving and then every refreshMs, so the model list greys them out. */
  async start(refreshMs = 5 * 60_000): Promise<void> {
    await this.loadHolds();
    if (this.refresh) return;
    this.refresh = setInterval(() => { void this.loadHolds(); }, refreshMs);
    this.refresh.unref();
  }

  stop(): void { clearInterval(this.refresh); this.refresh = undefined; }

  /** Holds only accumulate while a server runs; a deleted record re-opens its profile at the next restart. */
  private async loadHolds(): Promise<void> {
    try { for (const row of (await this.database.collection(SPEND_HOLDS).get()).docs) this.held.add(row.id); }
    catch (error) { this.log.warn("Stored spend holds could not be read; reservations still check them", { error: error instanceof Error ? error.message : String(error) }); }
  }

  /** A model that takes no duration is priced at an assumed length; a longer verified output means its ceiling is wrong. */
  async checkOutput(attempt: ExecutionAttempt, verified: VerifiedOutput): Promise<void> {
    const bound = this.policy.ceilings.find(entry => entry.profileId === attempt.profile.id)?.maximumOutputSeconds;
    if (bound === undefined || verified.metadata.state !== "verified" || verified.metadata.durationSeconds <= bound) return;
    this.held.add(attempt.profile.id);
    const hold = SpendHoldSchema.parse({ profileId: attempt.profile.id, maximumOutputSeconds: bound, observedSeconds: verified.metadata.durationSeconds, requestId: attempt.requestId, slotId: attempt.slotId, heldAt: new Date(this.now()).toISOString() });
    this.log.error("A verified output ran past its cost ceiling's length; the profile is held until the ceiling is reviewed and its hold deleted", undefined, { ...hold, collection: SPEND_HOLDS });
    await this.database.collection(SPEND_HOLDS).doc(hold.profileId).set(hold);
  }

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
        const spend = await this.reserveProviderSpendInTransaction(transaction, { ownerId: captured.ownerId, day, profile });
        transaction.set(attemptRef, { ...attempt, spend });
        return true;
      });
    } catch (error) {
      if (error instanceof StudioCapExceededError) throw new WorkflowPreflightError("The daily free-testing allowance has been reached. This action did not start.");
      throw error;
    }
  }

  /** Caller proves and permanently consumes its dispatch identity in this same transaction. */
  async reserveProviderSpendInTransaction(transaction: Transaction, input: { ownerId: string; day: string; profile: CapabilityProfile }): Promise<ProviderSpendReservation> {
    const { ownerId, day, profile } = input;
    OwnerIdSchema.parse(ownerId);
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(day);
    if (!this.qualified(profile)) throw new WorkflowPreflightError(this.reason(profile));
    const ceiling = this.policy.ceilings.find(entry => entry.profileId === profile.id);
    if (!ceiling) throw new WorkflowPreflightError(this.reason(profile));
    const hold = await transaction.get(this.database.collection(SPEND_HOLDS).doc(profile.id));
    if (hold.exists) { this.held.add(profile.id); throw new WorkflowPreflightError(this.reason(profile)); }
    const usageRef = this.database.collection("studio_usage").doc(`${ownerId}_${day}`);
    const usageRow = await transaction.get(usageRef);
    const usage = usageRow.exists ? StudioUsageSchema.parse(usageRow.data()) : { userId: ownerId, day, reservedCents: 0 };
    if (usage.userId !== ownerId || usage.day !== day) throw new WorkflowPreflightError("The free-testing allowance is unavailable.");
    if (usage.reservedCents + ceiling.maximumCentsPerSlot > this.dailyCapCents) throw new WorkflowPreflightError("The daily free-testing allowance has been reached. This action did not start.");
    const spend = WorkflowSpendReservationSchema.parse({ authority: "studio_usage/v1", day, cents: ceiling.maximumCentsPerSlot, policyRevision: this.policy.revision, mappingHash: ceiling.mappingHash });
    transaction.set(usageRef, { userId: ownerId, day, reservedCents: usage.reservedCents + spend.cents });
    return spend;
  }
}
