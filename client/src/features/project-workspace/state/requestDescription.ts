import type { AcceptedRequest } from "@shared/schemas/workflow/request.schemas";
import type { CapabilityProfile } from "@shared/schemas/workflow/capability.schemas";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { actionEntry, roleParameter } from "@shared/workflow/actionRegistry";
import { countLabel, derivedParameter, secondsLabel, valueLabel } from "./capabilitySettings";

/** Only the exact captured revision supplies names and fixed facts. */
function captured(request: AcceptedRequest, profile: CapabilityProfile | undefined): CapabilityProfile | undefined {
  return profile?.id === request.snapshot.settings.profileId && profile.revision === request.snapshot.settings.profileRevision ? profile : undefined;
}

/**
 * Stored requests stay readable without their profile: a snapshot saved before profiles declared
 * roles reads its duration, shape, resolution and sound under the names it was saved with.
 */
function savedValues(request: AcceptedRequest): { duration: unknown; shape: unknown; resolution: unknown; sound: unknown } {
  const parameters = request.snapshot.settings.parameters;
  return { duration: parameters.duration ?? parameters.durationSeconds, shape: parameters.aspectRatio ?? parameters.aspect_ratio ?? parameters.shape, resolution: parameters.resolution, sound: parameters.generateAudio ?? parameters.audio ?? parameters.sound };
}

/** The snapshot supplies values; a matching catalog revision supplies names and fixed facts. */
export function requestSettingsDescription(request: AcceptedRequest, profile: CapabilityProfile | undefined, media: MediaVersion[]): string {
  const model = captured(request, profile);
  const ownedMedia = media.filter(version => version.ownerId === request.ownerId && version.projectId === request.projectId);
  const saved = savedValues(request);
  const shapePolicy = model ? roleParameter(model, "shape")?.[1] ?? model.parameters.aspectRatio : undefined;
  const requiredImage = model?.inputs.find(input => input.minCount > 0 && input.kinds.includes("image"));
  const shape = saved.shape === "match_input_image" ? derivedParameter(shapePolicy?.policy === "derived" && shapePolicy.from === "input-aspect" ? shapePolicy : { policy: "derived", from: "input-aspect", ...(requiredImage ? { role: requiredImage.role } : {}) }, request.snapshot, ownedMedia) : saved.shape;
  const voice = model ? roleParameter(model, "voice") : undefined;
  const voiceValue = voice ? request.snapshot.settings.parameters[voice[0]] : undefined;
  return [
    typeof saved.duration === "number" ? `${saved.duration} ${saved.duration === 1 ? "second" : "seconds"}` : undefined,
    shape,
    saved.resolution,
    voice && voiceValue !== undefined ? valueLabel(model, voice[0], voiceValue) : undefined,
    saved.sound === true || saved.sound === undefined && model?.generatedAudio === "always" ? "sound included" : saved.sound === false ? "sound off" : undefined,
  ].filter((value): value is string => typeof value === "string" && value.length > 0).join(" · ");
}

/** One generation's setup line in the feed: "Make video · Wan 3 · 16:9 · 5s", "Make voiceover · ElevenLabs v3 · Rachel · 2 takes". */
export function requestHistoryDescription(request: AcceptedRequest, profiles: CapabilityProfile[]): string {
  const model = profiles.find(candidate => candidate.id === request.snapshot.settings.profileId && candidate.revision === request.snapshot.settings.profileRevision);
  const parameters = request.snapshot.settings.parameters;
  const declared = (role: Parameters<typeof roleParameter>[1]): string | undefined => {
    const found = model?.presentation ? roleParameter(model, role) : undefined;
    const current = found ? parameters[found[0]] ?? (found[1].policy === "fixed" ? found[1].value : undefined) : undefined;
    return found && current !== undefined && current !== "match_input_image" ? valueLabel(model, found[0], current) : undefined;
  };
  const saved = savedValues(request);
  const shape = model?.presentation ? declared("shape") : typeof saved.shape === "string" && saved.shape !== "match_input_image" ? saved.shape : undefined;
  const duration = model?.presentation ? declared("duration") : typeof saved.duration === "number" ? secondsLabel(saved.duration) : undefined;
  const count = request.slots.length > 1 ? countLabel(request.snapshot.action, request.slots.length) : undefined;
  return [actionEntry(request.snapshot.action).label, model?.label, declared("voice"), shape, duration, declared("scale"), count].filter((part): part is string => part !== undefined).join(" · ");
}
