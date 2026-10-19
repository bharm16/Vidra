import { z } from "zod";
import { AcceptedSnapshotSchema, MaterializedContextSchema } from "./request.schemas";
import { CapabilityProfileSchema } from "./capability.schemas";
import { DraftIdSchema, RevisionSchema } from "./identity.schemas";

export const PreparationReasonSchema = z.strictObject({
  code: z.enum(["draft_frozen", "profile_unknown", "profile_changed", "profile_unavailable", "input_pending", "input_missing", "input_denied", "input_incompatible", "settings_invalid", "context_limit", "context_invalid"]),
  message: z.string().min(1),
  field: z.string().optional(),
});
export const PreparedSlotSchema = z.strictObject({
  ordinal: z.number().int().min(1).max(8),
  seed: z.number().int().min(0).max(2147483647).optional(),
});
export type PreparedSlot = z.infer<typeof PreparedSlotSchema>;
export const PreparedActionSchema = z.discriminatedUnion("state", [
  z.strictObject({
    state: z.literal("ready"), draftId: DraftIdSchema, draftRevision: RevisionSchema,
    snapshot: AcceptedSnapshotSchema, materializedContext: MaterializedContextSchema,
    reviewedHash: z.string().regex(/^[a-f0-9]{64}$/), profile: CapabilityProfileSchema,
    slotPlan: z.array(PreparedSlotSchema).min(1).max(8),
  }).superRefine((prepared, ctx) => {
    if (prepared.slotPlan.length !== prepared.snapshot.settings.outputCount || prepared.slotPlan.some((slot, index) => slot.ordinal !== index + 1)) {
      ctx.addIssue({ code: "custom", path: ["slotPlan"], message: "Prepared slots must preserve the reviewed output count and order" });
    }
    const policy = prepared.profile.parameters.seed;
    for (const [index, slot] of prepared.slotPlan.entries()) {
      const seed = slot.seed;
      const requested = prepared.snapshot.settings.parameters.seed;
      if (seed === undefined) {
        if (typeof requested === "number" && requested >= 0) ctx.addIssue({ code: "custom", path: ["slotPlan", index, "seed"], message: "Each slot must capture its effective seed before review" });
        continue;
      }
      const valid = policy?.policy === "fixed" ? seed === policy.value : policy?.policy === "editable" && (policy.domain.kind === "enum" ? policy.domain.values.includes(seed) : seed >= policy.domain.min && seed <= policy.domain.max && Math.abs((seed - policy.domain.min) / policy.domain.step - Math.round((seed - policy.domain.min) / policy.domain.step)) < 1e-8);
      if (!valid || (typeof requested === "number" && requested >= 0 && seed !== requested)) {
        ctx.addIssue({ code: "custom", path: ["slotPlan", index, "seed"], message: "The effective slot seed must match the reviewed seed policy and domain" });
      }
    }
  }),
  z.strictObject({
    state: z.literal("blocked"), draftId: DraftIdSchema, draftRevision: RevisionSchema,
    reasons: z.array(PreparationReasonSchema).min(1), profile: CapabilityProfileSchema.optional(),
  }),
]);
export type PreparedAction = z.infer<typeof PreparedActionSchema>;
export type PreparationReason = z.infer<typeof PreparationReasonSchema>;
