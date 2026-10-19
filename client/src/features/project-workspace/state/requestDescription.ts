import type { AcceptedRequest } from "@shared/schemas/workflow/request.schemas";
import type { CapabilityProfile } from "@shared/schemas/workflow/capability.schemas";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { derivedParameter } from "./capabilitySettings";

const ACTION_LABELS: Record<string, string> = { "make-image": "Make image", "edit-image": "Edit image", "upscale-image": "Upscale image", "make-video": "Make video", "animate-image": "Animate image", "edit-video": "Edit video", "extend-video": "Extend video", ask: "Ask", "improve-words": "Improve words", "expand-description": "Expand description" };

/** The snapshot supplies values; a matching catalog revision supplies names and fixed facts. */
export function requestSettingsDescription(request: AcceptedRequest, profile: CapabilityProfile | undefined, media: MediaVersion[]): string {
  const parameters = request.snapshot.settings.parameters;
  const capturedProfile = profile?.id === request.snapshot.settings.profileId && profile.revision === request.snapshot.settings.profileRevision ? profile : undefined;
  const duration = parameters.duration ?? parameters.durationSeconds;
  const aspect = parameters.aspectRatio ?? parameters.aspect_ratio ?? parameters.shape;
  const aspectPolicy = capturedProfile?.parameters.aspectRatio ?? capturedProfile?.parameters.aspect_ratio ?? capturedProfile?.parameters.shape;
  const requiredImage = capturedProfile?.inputs.find(input => input.minCount > 0 && input.kinds.includes("image"));
  const ownedMedia = media.filter(version => version.ownerId === request.ownerId && version.projectId === request.projectId);
  const shape = aspect === "match_input_image" ? derivedParameter(aspectPolicy?.policy === "derived" && aspectPolicy.from === "input-aspect" ? aspectPolicy : { policy: "derived", from: "input-aspect", ...(requiredImage ? { role: requiredImage.role } : {}) }, request.snapshot, ownedMedia) : aspect;
  const audio = parameters.generateAudio ?? parameters.audio ?? parameters.sound;
  return [typeof duration === "number" ? `${duration} ${duration === 1 ? "second" : "seconds"}` : undefined, shape, parameters.resolution, audio === true || audio === undefined && capturedProfile?.generatedAudio === "always" ? "sound included" : audio === false ? "sound off" : undefined].filter(value => value !== undefined).join(" · ");
}

export function requestHistoryDescription(request: AcceptedRequest, profiles: CapabilityProfile[]): string {
  const profile = profiles.find(candidate => candidate.id === request.snapshot.settings.profileId && candidate.revision === request.snapshot.settings.profileRevision);
  const parameters = request.snapshot.settings.parameters;
  const duration = parameters.duration ?? parameters.durationSeconds;
  const aspect = parameters.aspectRatio ?? parameters.aspect_ratio ?? parameters.shape;
  return [ACTION_LABELS[request.snapshot.action], profile?.label, aspect === "match_input_image" ? undefined : aspect, typeof duration === "number" ? `${duration}s` : undefined].filter(value => value !== undefined).join(" · ");
}
