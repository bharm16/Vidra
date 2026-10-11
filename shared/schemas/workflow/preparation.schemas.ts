import { z } from "zod";
import { AcceptedSnapshotSchema, MaterializedContextSchema } from "./request.schemas";
import { CapabilityProfileSchema } from "./capability.schemas";
import { DraftIdSchema, RevisionSchema } from "./identity.schemas";

export const PreparationReasonSchema = z.strictObject({
  code: z.enum(["draft_frozen", "profile_unknown", "profile_changed", "profile_unavailable", "input_pending", "input_missing", "input_denied", "input_incompatible", "settings_invalid", "context_limit", "context_invalid"]),
  message: z.string().min(1),
  field: z.string().optional(),
});
export const PreparedActionSchema = z.discriminatedUnion("state", [
  z.strictObject({
    state: z.literal("ready"), draftId: DraftIdSchema, draftRevision: RevisionSchema,
    snapshot: AcceptedSnapshotSchema, materializedContext: MaterializedContextSchema,
    reviewedHash: z.string().regex(/^[a-f0-9]{64}$/), profile: CapabilityProfileSchema,
  }),
  z.strictObject({
    state: z.literal("blocked"), draftId: DraftIdSchema, draftRevision: RevisionSchema,
    reasons: z.array(PreparationReasonSchema).min(1), profile: CapabilityProfileSchema.optional(),
  }),
]);
export type PreparedAction = z.infer<typeof PreparedActionSchema>;
export type PreparationReason = z.infer<typeof PreparationReasonSchema>;
