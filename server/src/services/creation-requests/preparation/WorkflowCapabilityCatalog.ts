import { CapabilityProfileSchema, type CapabilityProfile } from "@shared/schemas/workflow/capability.schemas";
import type { WorkflowProfileCatalog } from "./ActionPreparationService";
import type { WorkflowSpendGuard } from "@services/creation-requests/execution/types";
import { REPLICATE_MODEL_DEFINITIONS, replicateModelFor, type ReplicateModelDefinition } from "@services/creation-requests/replicate-models";

export interface WorkflowRuntimeAvailability {
  imageProviders: ReadonlySet<string>;
  videoAvailable(model: string): boolean;
  textAvailable: boolean;
  textProvider?: string;
  textModel?: string;
  /** Whether exact native Replicate models can run (a token, outside replay). */
  replicateAvailable?: boolean;
  spendGuard?: Pick<WorkflowSpendGuard, "qualified" | "reason">;
}

export type WorkflowAdapterBinding =
  | { kind: "image"; providerId: "replicate-flux-schnell" | "replicate-flux-kontext-fast"; requiresPrimaryImage: boolean }
  | { kind: "video"; endpoint: string; requiresStartFrame: boolean }
  | { kind: "text"; operation: "studio_turn"; action: "ask" | "expand-description" | "improve-words" }
  | { kind: "replicate"; definition: ReplicateModelDefinition };

const IMAGE_PROVIDER_BY_PROFILE_ID: Record<string, "replicate-flux-schnell" | "replicate-flux-kontext-fast"> = {
  "flux-schnell": "replicate-flux-schnell",
  "flux-kontext-fast": "replicate-flux-kontext-fast",
};
const VIDEO_PROFILE_IDS = new Set(["wan-2.2-t2v", "wan-2.5-i2v"]);

export function resolveWorkflowAdapterBinding(
  profile: Pick<CapabilityProfile, "id" | "action" | "endpoint">,
): WorkflowAdapterBinding | undefined {
  const imageProvider = IMAGE_PROVIDER_BY_PROFILE_ID[profile.id];
  if (imageProvider) {
    return {
      kind: "image",
      providerId: imageProvider,
      requiresPrimaryImage: profile.id === "flux-kontext-fast",
    };
  }
  if (VIDEO_PROFILE_IDS.has(profile.id)) {
    return {
      kind: "video",
      endpoint: profile.endpoint,
      requiresStartFrame: profile.id === "wan-2.5-i2v",
    };
  }
  const definition = replicateModelFor(profile);
  if (definition && definition.profile.action === profile.action) return { kind: "replicate", definition };
  if (profile.action === "ask" || profile.action === "expand-description" || profile.action === "improve-words") {
    return {
      kind: "text",
      operation: "studio_turn",
      action: profile.action,
    };
  }
  return undefined;
}

export function isWorkflowProfileRuntimeAvailable(
  profile: CapabilityProfile,
  runtime: WorkflowRuntimeAvailability,
): boolean {
  if (profile.availability !== "qualified") return false;
  if (runtime.spendGuard && runtime.spendGuard.qualified(profile) !== true) return false;
  const binding = resolveWorkflowAdapterBinding(profile);
  if (!binding) return false;
  if (binding.kind === "image") return runtime.imageProviders.has(binding.providerId);
  if (binding.kind === "video") return runtime.videoAvailable(binding.endpoint);
  if (binding.kind === "replicate") return runtime.replicateAvailable === true;
  return (
    runtime.textAvailable &&
    (runtime.textProvider === undefined || runtime.textProvider === profile.provider) &&
    (runtime.textModel === undefined || runtime.textModel === profile.endpoint)
  );
}

const common = {
  schemaVersion: "vidra-workflow/v2", revision: "native/2026-10-17/1", provider: "replicate",
  maxContextCharacters: 32000, output: { kind: "video", maxCount: 1 },
  recovery: { start: "supported", status: "unsupported", cancel: "unsupported", result: "unsupported", deadlineSeconds: 1200 },
  pricing: { mode: "free", maximumCreditsPerSlot: 0 },
};
const WAN_NEGATIVE = "morphing, distorted, disfigured, text, watermark, low quality, blurry, static, extra limbs, fused fingers";

/** Runtime availability means a mapped adapter is configured; it does not claim provider quality. */
export function workflowRuntimeProfiles(runtime?: WorkflowRuntimeAvailability): CapabilityProfile[] {
  const baseAvailability: Pick<CapabilityProfile, "availability" | "unavailableReason"> = runtime === undefined
    ? { availability: "unqualified", unavailableReason: "This action's runtime availability has not been checked. Your request is retained." }
    : { availability: "qualified" };
  const profiles: unknown[] = [
    { ...common, id: "wan-2.2-t2v", label: "Wan 2.2", action: "make-video", endpoint: "wan-video/wan-2.2-t2v-fast", mode: "text-to-video", inputs: [], ...baseAvailability, generatedAudio: "unsupported", parameters: {
      resolution: { policy: "fixed", value: "720p" }, aspectRatio: { policy: "editable", domain: { kind: "enum", values: ["16:9", "9:16"] }, defaultValue: "16:9" },
      numFrames: { policy: "editable", domain: { kind: "enum", values: [81, 121] }, defaultValue: 81 }, framesPerSecond: { policy: "fixed", value: 16 }, durationSeconds: { policy: "derived", from: "frame-duration" },
      promptExpansion: { policy: "fixed", value: false }, negativePrompt: { policy: "fixed", value: WAN_NEGATIVE },
    } },
    { ...common, id: "wan-2.5-i2v", label: "Wan 2.5", action: "animate-image", endpoint: "wan-video/wan-2.5-i2v", mode: "image-to-video", inputs: [{ role: "start-frame", kinds: ["image"], minCount: 1, maxCount: 1 }], ...baseAvailability, generatedAudio: "unknown", parameters: {
      durationSeconds: { policy: "editable", domain: { kind: "enum", values: [5, 10] }, defaultValue: 5 }, resolution: { policy: "editable", domain: { kind: "enum", values: ["480p", "720p", "1080p"] }, defaultValue: "720p" },
      aspectRatio: { policy: "derived", from: "input-aspect", role: "start-frame" }, promptExpansion: { policy: "fixed", value: true }, negativePrompt: { policy: "fixed", value: WAN_NEGATIVE },
    } },
    { ...common, id: "flux-schnell", label: "Flux Schnell", action: "make-image", endpoint: "black-forest-labs/flux-schnell", mode: "text-to-image", inputs: [], output: { kind: "image", maxCount: 4 }, ...baseAvailability, generatedAudio: "unsupported", parameters: {
      aspectRatio: { policy: "editable", domain: { kind: "enum", values: ["1:1", "16:9", "21:9", "3:2", "2:3", "4:5", "5:4", "9:16", "9:21"] }, defaultValue: "16:9" }, outputFormat: { policy: "fixed", value: "webp" }, outputQuality: { policy: "fixed", value: 80 },
    } },
    { ...common, id: "flux-kontext-fast", label: "Flux Kontext Fast", action: "edit-image", endpoint: "prunaai/flux-kontext-fast", mode: "image-edit", inputs: [{ role: "primary", kinds: ["image"], minCount: 1, maxCount: 1 }], output: { kind: "image", maxCount: 1 }, ...baseAvailability, generatedAudio: "unsupported", parameters: {
      aspectRatio: { policy: "fixed", value: "match_input_image" }, outputFormat: { policy: "fixed", value: "webp" }, outputQuality: { policy: "fixed", value: 80 }, speedMode: { policy: "fixed", value: "Juiced" },
    } },
  ];
  profiles.push(...REPLICATE_MODEL_DEFINITIONS.map(definition => ({ ...definition.profile, ...baseAvailability })));
  for (const [action, label] of [["ask", "Ask"], ["expand-description", "Expand description"], ["improve-words", "Improve words"]] as const) profiles.push({ ...common, id: `text-${action}`, label, action, provider: runtime?.textProvider ?? "configured-text", endpoint: runtime?.textModel ?? "studio_turn", mode: "text-assistance", inputs: [], output: { kind: "text", maxCount: 1 }, ...baseAvailability, generatedAudio: "unsupported", parameters: {} });
  return profiles.map(input => {
    const profile = CapabilityProfileSchema.parse(input);
    if (!runtime) return profile;
    const runtimeWithoutSpend: WorkflowRuntimeAvailability = {
      imageProviders: runtime.imageProviders,
      videoAvailable: runtime.videoAvailable.bind(runtime),
      textAvailable: runtime.textAvailable,
      ...(runtime.textProvider !== undefined ? { textProvider: runtime.textProvider } : {}),
      ...(runtime.textModel !== undefined ? { textModel: runtime.textModel } : {}),
      ...(runtime.replicateAvailable !== undefined ? { replicateAvailable: runtime.replicateAvailable } : {}),
    };
    if (!isWorkflowProfileRuntimeAvailable(profile, runtimeWithoutSpend)) {
      return CapabilityProfileSchema.parse({
        ...profile,
        availability: "unavailable",
        unavailableReason: "This model is not configured. Choose another available model; your instructions and inputs are retained.",
      });
    }
    if (runtime.spendGuard?.qualified(profile) !== true) {
      return CapabilityProfileSchema.parse({
        ...profile,
        availability: "unavailable",
        unavailableReason: runtime.spendGuard?.reason?.(profile) ?? "This model is unavailable during bounded free testing. Your instructions and inputs are retained.",
      });
    }
    return profile;
  });
}

export class WorkflowCapabilityCatalog implements WorkflowProfileCatalog {
  private readonly profiles: CapabilityProfile[];
  constructor(profiles?: CapabilityProfile[], runtime?: WorkflowRuntimeAvailability) {
    this.profiles = profiles?.map(profile => CapabilityProfileSchema.parse(profile)) ?? workflowRuntimeProfiles(runtime);
  }
  get(id: string): CapabilityProfile | undefined { return this.profiles.find(profile => profile.id === id); }
  list(): CapabilityProfile[] { return this.profiles.map(profile => CapabilityProfileSchema.parse(profile)); }
}
