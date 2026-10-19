import { z } from "zod";
import type { CapabilityProfile } from "@shared/schemas/workflow/capability.schemas";
import { canonicalJson } from "@shared/workflow/canonicalJson";
import { sha256Hex } from "@utils/hash";

export const WorkflowSpendPolicySchema = z.strictObject({
  revision: z.string().min(1).max(160), validUntil: z.iso.datetime(),
  ceilings: z.array(z.strictObject({ profileId: z.string().min(1).max(160), profileRevision: z.string().min(1).max(160), mappingHash: z.string().regex(/^[a-f0-9]{64}$/), maximumCentsPerSlot: z.number().int().positive().max(100000), source: z.url() })).max(100),
}).refine(policy => new Set(policy.ceilings.map(ceiling => ceiling.profileId)).size === policy.ceilings.length, "Cost policies cannot have duplicate profiles");
export type WorkflowSpendPolicy = z.infer<typeof WorkflowSpendPolicySchema>;

/** Cost qualification pins the complete offered parameter envelope, not just a model nickname. */
export function workflowSpendMappingHash(profile: CapabilityProfile): string {
  const { id, revision, action, provider, endpoint, mode, inputs, output, parameters, constraints, generatedAudio } = profile;
  return sha256Hex(canonicalJson({ id, revision, action, provider, endpoint, mode, inputs, output, parameters, constraints, generatedAudio, ...(output.kind === "text" ? { maxContextCharacters: profile.maxContextCharacters, maxOutputTokens: 4000, operation: "studio_turn" } : {}) }));
}

/**
 * Official model-page billingConfig observed 2026-10-17 through public HTML only.
 * One native invocation produces one output. Ceilings include headroom and the
 * maximum offered resolution/duration, and consume the EXISTING Studio cap.
 * Schnell: $3/1000 outputs; Kontext: $0.01/output; Wan2.2: max $0.10/output;
 * Wan2.5: max $0.15/second x 10 seconds. No customer-credit pricing is used.
 */
export const DEFAULT_WORKFLOW_SPEND_POLICY: WorkflowSpendPolicy = WorkflowSpendPolicySchema.parse({
  revision: "replicate-public-pricing/2026-10-17/1", validUntil: "2026-11-17T00:00:00.000Z", ceilings: [
    { profileId: "flux-schnell", profileRevision: "native/2026-10-17/1", mappingHash: "c72c1b19a3b93af496907f2a404f875bda6e0a3ae9cbb25b6b99632616c23cb6", maximumCentsPerSlot: 1, source: "https://replicate.com/black-forest-labs/flux-schnell" },
    { profileId: "flux-kontext-fast", profileRevision: "native/2026-10-17/1", mappingHash: "58acf499bb7e577f028e268d26b4c92cfdfe8e76673f79eea3bf21b2e2fa394a", maximumCentsPerSlot: 2, source: "https://replicate.com/prunaai/flux-kontext-fast" },
    { profileId: "wan-2.2-t2v", profileRevision: "native/2026-10-17/1", mappingHash: "557a9337f07f2a4b22b51a9172deaf080ac3966cfed194fbabb76cabce069ec1", maximumCentsPerSlot: 20, source: "https://replicate.com/wan-video/wan-2.2-t2v-fast" },
    { profileId: "wan-2.5-i2v", profileRevision: "native/2026-10-17/1", mappingHash: "833c06f1677a73705c1996ba9bbc93a339f62ad64576ecd720d043dea9dd4ce2", maximumCentsPerSlot: 200, source: "https://replicate.com/wan-video/wan-2.5-i2v" },
  ],
});
