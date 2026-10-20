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
 *
 * Native Replicate models, observed 2026-10-19 (ceil of maximum x 1.1 unless noted):
 * Wan 3: readme $0.20/s at 1080p (billing lists $0.10/s; the higher is used) x 20 s.
 * Gemini Omni 1.1: $0.45/s at 4K x 11 s (10 s observed output); no further headroom.
 * Grok extension: $0.05/s x (15 s source + 10 s continuation). Topaz video: the 4K/60
 * guide ($0.747 per 5 s) scaled to the $0.08 unit price x 20 s; no further headroom.
 * Luma reframe: $0.06/s x 10 s. Nano Banana 2.1: $0.1134 at 4K. GPT Image 2.5
 * Sunburst: $0.50 at max. Ideogram 4.5 precise edit: $0.22 at high. Topaz image:
 * 2 units x $0.08 at the 40 MP limit. Eleven v3: $0.10/1k characters x 5,000
 * (script + both continuity texts). Lyria 3: $0.04 per clip. Scribe v2:
 * $0.003667/min x 15 min.
 */
export const DEFAULT_WORKFLOW_SPEND_POLICY: WorkflowSpendPolicy = WorkflowSpendPolicySchema.parse({
  revision: "replicate-public-pricing/2026-10-19/1", validUntil: "2026-11-17T00:00:00.000Z", ceilings: [
    { profileId: "flux-schnell", profileRevision: "native/2026-10-17/1", mappingHash: "c72c1b19a3b93af496907f2a404f875bda6e0a3ae9cbb25b6b99632616c23cb6", maximumCentsPerSlot: 1, source: "https://replicate.com/black-forest-labs/flux-schnell" },
    { profileId: "flux-kontext-fast", profileRevision: "native/2026-10-17/1", mappingHash: "58acf499bb7e577f028e268d26b4c92cfdfe8e76673f79eea3bf21b2e2fa394a", maximumCentsPerSlot: 2, source: "https://replicate.com/prunaai/flux-kontext-fast" },
    { profileId: "wan-2.2-t2v", profileRevision: "native/2026-10-17/1", mappingHash: "557a9337f07f2a4b22b51a9172deaf080ac3966cfed194fbabb76cabce069ec1", maximumCentsPerSlot: 20, source: "https://replicate.com/wan-video/wan-2.2-t2v-fast" },
    { profileId: "wan-2.5-i2v", profileRevision: "native/2026-10-17/1", mappingHash: "833c06f1677a73705c1996ba9bbc93a339f62ad64576ecd720d043dea9dd4ce2", maximumCentsPerSlot: 200, source: "https://replicate.com/wan-video/wan-2.5-i2v" },
    { profileId: "wan-3-t2v", profileRevision: "native/2026-10-19/1", mappingHash: "4c010ea670c30de29555c8b97e70fe5d3944d69378c74c0b6f60cdb9828ce15c", maximumCentsPerSlot: 440, source: "https://replicate.com/alibaba/wan-3" },
    { profileId: "wan-3-i2v", profileRevision: "native/2026-10-19/1", mappingHash: "42ea18d047f566104a292aa6f45aabd9d84fd52369f9a6f51cf34bb94c5fac4b", maximumCentsPerSlot: 440, source: "https://replicate.com/alibaba/wan-3" },
    { profileId: "gemini-omni-1.1-t2v", profileRevision: "native/2026-10-19/1", mappingHash: "c5a244406e6b05bb00590bb9c1cb7603f42335bc1361dd2a0753d5cc388ffaf6", maximumCentsPerSlot: 495, source: "https://replicate.com/google/gemini-omni-1.1" },
    { profileId: "gemini-omni-1.1-i2v", profileRevision: "native/2026-10-19/1", mappingHash: "9214777e49baae3305c6d9790e017a22034ec39af71ebc5ad322af2d866b7f5b", maximumCentsPerSlot: 495, source: "https://replicate.com/google/gemini-omni-1.1" },
    { profileId: "gemini-omni-1.1-edit", profileRevision: "native/2026-10-19/1", mappingHash: "348e8e0921a3a54739b0166c4285ffe9cdc5c8e553903bdf90d602ab77a077f6", maximumCentsPerSlot: 495, source: "https://replicate.com/google/gemini-omni-1.1" },
    { profileId: "grok-imagine-video-extension", profileRevision: "native/2026-10-19/1", mappingHash: "12bcf3a1c3aa3226e05bd324ea357477513df3dd059e9ea77f08614a9a396c48", maximumCentsPerSlot: 138, source: "https://replicate.com/xai/grok-imagine-video-extension" },
    { profileId: "topaz-video-upscale", profileRevision: "native/2026-10-19/1", mappingHash: "7d4f14f1449971e3372d3c11b38e208c0c1c37205297c686dfcd0d6889286a85", maximumCentsPerSlot: 479, source: "https://replicate.com/topazlabs/video-upscale" },
    { profileId: "luma-reframe-video", profileRevision: "native/2026-10-19/1", mappingHash: "068b628b30dd54aaff3b9e2cdd2db935b4c9340402fdbeb253d525c3ddecafd0", maximumCentsPerSlot: 66, source: "https://replicate.com/luma/reframe-video" },
    { profileId: "nano-banana-2.1", profileRevision: "native/2026-10-19/1", mappingHash: "4336b551586846d602e1328ed6fe73142cd6efbe1ddc8e8f8e83fbff03c098f5", maximumCentsPerSlot: 13, source: "https://replicate.com/google/nano-banana-2.1" },
    { profileId: "nano-banana-2.1-edit", profileRevision: "native/2026-10-19/1", mappingHash: "5137e001f940507ffcf3c14cb4ceb1e0421a21562bac77545a49c894dd04ceb5", maximumCentsPerSlot: 13, source: "https://replicate.com/google/nano-banana-2.1" },
    { profileId: "gpt-image-2.5-sunburst", profileRevision: "native/2026-10-19/1", mappingHash: "d31fdeaa4f96cc905c501cee0338fb67802018b5c9eed22ceb3840823ac15f81", maximumCentsPerSlot: 55, source: "https://replicate.com/openai/gpt-image-2.5-sunburst" },
    { profileId: "gpt-image-2.5-sunburst-edit", profileRevision: "native/2026-10-19/1", mappingHash: "f14ccc388822002b5b10746c90231f50cf1b1db28c77001e52395fcbe47746ac", maximumCentsPerSlot: 55, source: "https://replicate.com/openai/gpt-image-2.5-sunburst" },
    { profileId: "ideogram-4.5-precise-edit", profileRevision: "native/2026-10-19/1", mappingHash: "21d594fe3dc7c34271b0760f151f9df9050a774f81ae53171003919c539f57f7", maximumCentsPerSlot: 25, source: "https://replicate.com/ideogram-ai/ideogram-4-5-precise-edit" },
    { profileId: "topaz-image-upscale", profileRevision: "native/2026-10-19/1", mappingHash: "4c06d3034a615a6f6b53800a3d80e35710300d29456a9c5fdf2811d43a8b9b97", maximumCentsPerSlot: 18, source: "https://replicate.com/topazlabs/image-upscale" },
    { profileId: "elevenlabs-v3", profileRevision: "native/2026-10-19/1", mappingHash: "7248a2353157e86a47d1346e919767be9ab289fe3ac9470fd798cd45d89d3b30", maximumCentsPerSlot: 55, source: "https://replicate.com/elevenlabs/v3" },
    { profileId: "lyria-3", profileRevision: "native/2026-10-19/1", mappingHash: "99c960afdd2df49f3170d6025a668a23dee205388f5f6e560395f8de002ee2ad", maximumCentsPerSlot: 5, source: "https://replicate.com/google/lyria-3" },
    { profileId: "elevenlabs-scribe-v2", profileRevision: "native/2026-10-19/1", mappingHash: "f6eacf167039bc944d9fc3dd34cbb9411f9f2a61276b5f8a099dcd0b27bd1e53", maximumCentsPerSlot: 7, source: "https://replicate.com/elevenlabs/scribe-v2" },
  ],
});
