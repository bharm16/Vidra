import { CapabilityProfileSchema, type CapabilityProfile } from "@shared/schemas/workflow/capability.schemas";
import { DraftContentSchema, type DraftContent } from "@shared/schemas/workflow/draft.schemas";
import { MediaVersionSchema, type MediaVersion } from "@shared/schemas/workflow/media.schemas";

/** Controlled UI fixtures only. These profiles are never registered with an executor or provider. */
const base = {
  schemaVersion: "vidra-workflow/v2", revision: "controlled-ui/1", provider: "controlled-ui-fixture", endpoint: "controlled/not-dispatched", action: "make-video", mode: "text-to-video", availability: "qualified", inputs: [], output: { kind: "video", maxCount: 1 }, maxContextCharacters: 32000,
  recovery: { start: "supported", status: "supported", cancel: "unsupported", result: "supported", deadlineSeconds: 600 }, generatedAudio: "always", pricing: { mode: "free", maximumCreditsPerSlot: 0 },
};
const FIXTURE_ROLES: Record<string, { label: string; role?: "shape" | "duration" | "resolution" | "sound" }> = { aspectRatio: { label: "Shape", role: "shape" }, duration: { label: "Duration", role: "duration" }, durationSeconds: { label: "Duration", role: "duration" }, resolution: { label: "Resolution", role: "resolution" }, generateAudio: { label: "Sound", role: "sound" }, numFrames: { label: "Frames" } };
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
const input = (role: "start-frame" | "end-frame" | "reference" | "clip" | "audio", media: MediaVersion): DraftContent["inputs"][number] => ({ role, state: "resolved", versionId: media.id });
export interface ModelSourceCase {
  key: string; nodeId: string; profile: CapabilityProfile; content: DraftContent; media: MediaVersion[]; lookupStatus?: "ready" | "loading" | "error"; menu?: "Duration" | "Shape" | "Resolution" | "Model" | "Advanced";
}
export const modelSourceCases: ModelSourceCase[] = [
  { key: "G01", nodeId: "1030:84332", profile: veo, content: modelContent(veo), media: [], lookupStatus: "loading" },
  { key: "G02", nodeId: "1030:84410", profile: veo, content: modelContent(veo), media: [] },
  { key: "G03", nodeId: "1030:84502", profile: veo, content: modelContent(veo), media: [], menu: "Duration" },
  { key: "G04", nodeId: "1030:84608", profile: veo, content: modelContent(veo), media: [], menu: "Shape" },
  { key: "G05", nodeId: "1030:84713", profile: veo, content: modelContent(veo), media: [], menu: "Resolution" },
  { key: "G07", nodeId: "1030:84929", profile: veo, content: modelContent(veo, { duration: 8, resolution: "1080p" }), media: [] },
  { key: "G08", nodeId: "1030:85023", profile: veoFrames, content: modelContent(veoFrames, {}, [input("end-frame", runner)]), media: [runner] },
  { key: "G09", nodeId: "1030:85126", profile: veoFrames, content: modelContent(veoFrames, {}, [input("start-frame", runner), input("end-frame", desk)]), media: [runner, desk] },
  { key: "G10", nodeId: "1030:85225", profile: veoReferences, content: modelContent(veoReferences, {}, [input("reference", runner), input("reference", desk)]), media: [runner, desk] },
  { key: "G12", nodeId: "1032:85077", profile: wan25, content: modelContent(wan25, {}, [input("start-frame", runner)]), media: [runner] },
  { key: "G18", nodeId: "1032:85658", profile: veo, content: modelContent(veo), media: [], lookupStatus: "error" },
  { key: "G22", nodeId: "1032:85991", profile: veo, content: modelContent(veo), media: [], menu: "Model" },
  { key: "G24", nodeId: "1032:86212", profile: wan25, content: modelContent(wan25, {}, [input("start-frame", portrait)]), media: [portrait] },
  { key: "G25", nodeId: "1032:86305", profile: wan22, content: modelContent(wan22), media: [] },
  { key: "G26", nodeId: "1032:86392", profile: veo, content: modelContent(veo, {}, [input("audio", audio)]), media: [audio] },
  { key: "G27", nodeId: "1032:86492", profile: wan22, content: modelContent(wan22), media: [], menu: "Advanced" },
  { key: "G28", nodeId: "1032:86590", profile: wan22, content: modelContent(wan22, { numFrames: 121 }), media: [] },
  { key: "G29", nodeId: "1032:86682", profile: veoExtension, content: modelContent(veoExtension, {}, [input("clip", clip)]), media: [clip] },
  { key: "G30", nodeId: "1032:86770", profile: veoExtension, content: modelContent(veoExtension, {}, [input("clip", ineligibleClip)]), media: [ineligibleClip] },
  { key: "G31", nodeId: "1037:87424", profile: veoFrames, content: modelContent(veoFrames, {}, [input("start-frame", runner)]), media: [runner] },
  { key: "G32", nodeId: "1037:87524", profile: veoFrames, content: modelContent(veoFrames, {}, [input("start-frame", chosenFrame)]), media: [chosenFrame] },
];
