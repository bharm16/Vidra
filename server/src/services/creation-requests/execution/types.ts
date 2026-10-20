import { z } from "zod";
import { CapabilityProfileSchema, type CapabilityProfile } from "@shared/schemas/workflow/capability.schemas";
import { MediaMetadataSchema, OwnedObjectSchema } from "@shared/schemas/workflow/media.schemas";
import { OwnerIdSchema, ProjectIdSchema, RequestIdSchema, SlotIdSchema, TimestampSchema } from "@shared/schemas/workflow/identity.schemas";
import type { AcceptedRequest, RequestSlot } from "@shared/schemas/workflow/request.schemas";

export const NativeOutputSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("image"), storagePath: z.string().min(1), model: z.string().min(1), provider: z.string().min(1) }),
  z.strictObject({ kind: z.literal("video"), assetId: z.string().min(1), model: z.string().min(1), provider: z.string().min(1) }),
  z.strictObject({ kind: z.literal("audio"), storagePath: z.string().min(1), model: z.string().min(1), provider: z.string().min(1) }),
  z.strictObject({ kind: z.literal("text"), text: z.string().min(1).max(32000), model: z.string().min(1), provider: z.string().min(1) }),
]);
export type NativeOutput = z.infer<typeof NativeOutputSchema>;
export const VerifiedOutputSchema = z.strictObject({ object: OwnedObjectSchema, metadata: MediaMetadataSchema });
export type VerifiedOutput = z.infer<typeof VerifiedOutputSchema>;
export const WorkflowSpendReservationSchema = z.strictObject({ authority: z.literal("studio_usage/v1"), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), cents: z.number().int().positive(), policyRevision: z.string().min(1), mappingHash: z.string().regex(/^[a-f0-9]{64}$/) });
export const ExecutionAttemptSchema = z.strictObject({
  requestId: RequestIdSchema, slotId: SlotIdSchema, ownerId: OwnerIdSchema, projectId: ProjectIdSchema,
  token: z.string().min(1), snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
  state: z.enum(["running", "produced", "published", "failed", "needs-attention"]),
  startedAt: TimestampSchema, deadlineAt: TimestampSchema, profile: CapabilityProfileSchema,
  sentInstructions: z.string().max(100000), output: NativeOutputSchema.optional(),
  spend: WorkflowSpendReservationSchema.optional(),
});
export type ExecutionAttempt = z.infer<typeof ExecutionAttemptSchema>;

export interface WorkflowNativeExecutor {
  available(profile: CapabilityProfile): boolean;
  execute(request: AcceptedRequest, slot: RequestSlot, profile: CapabilityProfile, sentInstructions: string): Promise<NativeOutput>;
  /** Sees each verified output before it is published; a rejection retries delivery, never the invocation. */
  checkOutput?(attempt: ExecutionAttempt, verified: VerifiedOutput): Promise<void>;
}
export interface WorkflowOutputStorage {
  materialize(attempt: ExecutionAttempt, output: NativeOutput): Promise<VerifiedOutput>;
}

export interface WorkflowSpendGuard {
  qualified(profile: CapabilityProfile): boolean;
  /** True only for the transaction creating this reservation; replay never authorizes another call. */
  reserve(request: AcceptedRequest, slot: RequestSlot, profile: CapabilityProfile): Promise<boolean>;
  reason?(profile: CapabilityProfile): string;
  /** Holds a profile on every instance once a verified output runs past its ceiling's assumed length. */
  checkOutput?(attempt: ExecutionAttempt, verified: VerifiedOutput): Promise<void>;
}

/** Only failures proven to precede invocation may be offered as a fresh attempt. */
export class WorkflowPreflightError extends Error {}

export function instructionsFor(request: AcceptedRequest): string {
  const summaryIds = new Set(request.snapshot.context.summary?.requestIds ?? []);
  return [
    request.materializedContext.projectInstructions ? `Project instructions:\n${request.materializedContext.projectInstructions}` : "",
    request.snapshot.context.summary ? `Selected history summary:\n${request.snapshot.context.summary.text}` : "",
    ...request.materializedContext.entries.filter(entry => !summaryIds.has(entry.requestId)).map(entry => [`Previous request:\n${entry.instructions}`, ...(entry.textOutputs ?? []).map(output => `Previous response:\n${output.text}`)].join("\n\n")),
    request.snapshot.instructions,
  ].filter(Boolean).join("\n\n");
}
