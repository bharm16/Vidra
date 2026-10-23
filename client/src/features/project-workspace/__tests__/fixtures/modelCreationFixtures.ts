import { CapabilityProfileSchema, type CapabilityProfile } from "@shared/schemas/workflow/capability.schemas";
import { DraftContentSchema, type DraftContent } from "@shared/schemas/workflow/draft.schemas";
import { MediaVersionSchema, type MediaVersion } from "@shared/schemas/workflow/media.schemas";

/** Controlled UI fixtures only. These profiles are never registered with an executor or provider. */
const base = {
  schemaVersion: "vidra-workflow/v2", revision: "controlled-ui/1", provider: "controlled-ui-fixture", endpoint: "controlled/not-dispatched", action: "make-video", mode: "text-to-video", availability: "qualified", inputs: [], output: { kind: "video", maxCount: 1 }, maxContextCharacters: 32000,
  recovery: { start: "supported", status: "supported", cancel: "unsupported", result: "supported", deadlineSeconds: 600 }, generatedAudio: "always", pricing: { mode: "free", maximumCreditsPerSlot: 0 },
};
const FIXTURE_ROLES: Record<string, { label: string; role?: "shape" | "duration" | "resolution" | "sound"; format?: "seconds" }> = { aspectRatio: { label: "Shape", role: "shape" }, duration: { label: "Duration", role: "duration", format: "seconds" }, durationSeconds: { label: "Duration", role: "duration", format: "seconds" }, resolution: { label: "Resolution", role: "resolution" }, generateAudio: { label: "Sound", role: "sound" }, numFrames: { label: "Frames" } };
/** Fixtures declare their roles the way catalog profiles do. */
export function presented(profile: Record<string, unknown> & { parameters: Record<string, unknown> }): CapabilityProfile {
  const parameters = Object.fromEntries(Object.keys(profile.parameters).flatMap(name => FIXTURE_ROLES[name] ? [[name, FIXTURE_ROLES[name]]] : []));
  return CapabilityProfileSchema.parse({ ...profile, presentation: { words: "required", parameters } });
}
export const veo = presented({ ...base, id: "controlled-veo-text", label: "Veo 3.1", inputs: [{ role: "start-frame", kinds: ["image"], minCount: 0, maxCount: 1 }, { role: "end-frame", kinds: ["image"], minCount: 0, maxCount: 1 }, { role: "reference", kinds: ["image"], minCount: 0, maxCount: 3 }], parameters: { aspectRatio: { policy: "editable", defaultValue: "16:9", domain: { kind: "enum", values: ["16:9", "9:16"] } }, duration: { policy: "editable", defaultValue: 4, domain: { kind: "enum", values: [4, 6, 8] } }, resolution: { policy: "editable", defaultValue: "720p", domain: { kind: "enum", values: ["720p", "1080p", "4K"] } } }, constraints: [{ parameter: "resolution", equals: "1080p", requires: { duration: [8] }, reason: "1080p requires 8 seconds." }, { parameter: "resolution", equals: "4K", requires: { duration: [8] }, reason: "4K requires 8 seconds." }] });
export const veoFrames = presented({ ...veo, id: "controlled-veo-frames", mode: "image-to-video", inputs: [{ role: "start-frame", kinds: ["image"], minCount: 1, maxCount: 1 }, { role: "end-frame", kinds: ["image"], minCount: 0, maxCount: 1 }] });
export const veoReferences = presented({ ...veo, id: "controlled-veo-references", mode: "reference-to-video", inputs: [{ role: "reference", kinds: ["image"], minCount: 1, maxCount: 3 }], parameters: { ...veo.parameters, duration: { policy: "fixed", value: 8 } } });
export const wan25 = presented({ ...base, id: "controlled-wan25", label: "Wan 2.5", mode: "image-to-video", inputs: [{ role: "start-frame", kinds: ["image"], minCount: 1, maxCount: 1 }], generatedAudio: "optional", parameters: { aspectRatio: { policy: "derived", from: "input-aspect", role: "start-frame" }, duration: { policy: "editable", defaultValue: 5, domain: { kind: "enum", values: [5, 10] } }, resolution: { policy: "editable", defaultValue: "720p", domain: { kind: "enum", values: ["480p", "720p", "1080p"] } }, generateAudio: { policy: "editable", defaultValue: true, domain: { kind: "enum", values: [true, false] } } } });
export const wan22 = presented({ ...base, id: "controlled-wan22", label: "Wan 2.2", generatedAudio: "unsupported", parameters: { aspectRatio: { policy: "editable", defaultValue: "16:9", domain: { kind: "enum", values: ["16:9", "9:16"] } }, durationSeconds: { policy: "derived", from: "frame-duration" }, resolution: { policy: "editable", defaultValue: "480p", domain: { kind: "enum", values: ["480p", "720p"] } }, numFrames: { policy: "editable", defaultValue: 81, domain: { kind: "range", min: 17, max: 161, step: 4 } }, framesPerSecond: { policy: "fixed", value: 16 }, outputFormat: { policy: "fixed", value: "mp4" } } });
export const veoExtension = presented({ ...base, id: "controlled-veo-extension", label: "Veo 3.1", action: "extend-video", mode: "video-extension", inputs: [{ role: "clip", kinds: ["video"], minCount: 1, maxCount: 1, minDurationSeconds: 1, maxDurationSeconds: 8 }], parameters: { aspectRatio: { policy: "derived", from: "input-aspect", role: "clip" }, duration: { policy: "fixed", value: 7 }, resolution: { policy: "fixed", value: "720p" } } });

const at = "2026-10-17T00:00:00.000Z";
function version(id: string, kind: MediaVersion["kind"], label: string, width?: number, height?: number, durationSeconds = 0): MediaVersion {
  return MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", id, ownerId: "creator", projectId: "project_model_fixture", kind, label, origin: { kind: "upload" }, sourceInputs: [], object: { identity: "unknown", assetId: id, storagePath: `controlled/${id}` }, metadata: { state: "verified", ...(width !== undefined ? { width, height } : {}), durationSeconds, audio: kind === "image" ? "absent" : "present", probeVersion: "controlled-ui" }, association: "linked", createdAt: at });
}
export const runner = version("version_runner", "image", "Runner", 1920, 1080);
export const desk = version("version_desk", "image", "Desk", 1920, 1080);
export const portrait = version("version_portrait", "image", "Desk portrait", 1080, 1920);
export const clip = version("version_clip", "video", "Evening run", 1920, 1080, 8);
export const ineligibleClip = version("version_ineligible", "video", "Long clip", 1920, 1080, 12);
export const audio = version("version_audio", "audio", "Beat.wav", undefined, undefined, 4);
export const chosenFrame = MediaVersionSchema.parse({ ...runner, id: "version_chosen_frame", origin: { kind: "frame", versionId: clip.id, timestampSeconds: 2.5 } });

export function modelContent(profile: CapabilityProfile, parameters: DraftContent["settings"]["parameters"] = {}, inputs: DraftContent["inputs"] = []): DraftContent {
  const defaults = Object.fromEntries(Object.entries(profile.parameters).flatMap(([name, policy]) => policy.policy === "fixed" ? [[name, policy.value]] : policy.policy === "editable" ? [[name, policy.defaultValue]] : []));
  return DraftContentSchema.parse({ action: profile.action, instructions: "Follow the runner around the curve. Keep the camera low and the stadium lights cool.", inputs, settings: { profileId: profile.id, profileRevision: profile.revision, parameters: { ...defaults, ...parameters }, outputCount: 1 }, context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 }, destination: { projectId: "project_model_fixture", conversationId: "conversation_model_fixture" } });
}
