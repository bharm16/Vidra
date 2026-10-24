import { afterAll, beforeAll, expect, it } from "vitest";
import { ProjectStore } from "@services/projects/ProjectStore";
import { ConversationStore } from "@services/projects/ConversationStore";
import { CreationDraftStore } from "@services/creation-drafts/CreationDraftStore";
import { CreationContextService } from "@services/creation-context/CreationContextService";
import { createTestLifecycle } from "../helpers/workflow/lifecycle";
import { WorkflowCapabilityCatalog } from "@services/creation-requests/catalog";
import { StudioWorkflowSpendGuard } from "@services/creation-requests/spend";
import { CapabilityProfileSchema } from "@shared/schemas/workflow/capability.schemas";
import { MediaVersionSchema } from "@shared/schemas/workflow/media.schemas";
import { createWorkflowTestDatabase } from "../helpers/workflow/emulator";

const database = createWorkflowTestDatabase();
const projects = new ProjectStore(database);
const conversations = new ConversationStore(database, projects);
const drafts = new CreationDraftStore(database, projects, conversations);
const contexts = new CreationContextService(database, projects);
const profile = CapabilityProfileSchema.parse({
  schemaVersion: "vidra-workflow/v2", id: "wan-t2v", revision: "1", label: "Wan 2.2",
  action: "make-video", provider: "controlled", endpoint: "wan-video/wan-2.2-t2v-fast", mode: "text-to-video",
  availability: "qualified", inputs: [], output: { kind: "video", maxCount: 1 }, maxContextCharacters: 32000,
  parameters: { numFrames: { policy: "editable", domain: { kind: "range", min: 81, max: 121, step: 1 }, defaultValue: 81 }, framesPerSecond: { policy: "editable", domain: { kind: "range", min: 5, max: 30, step: 1 }, defaultValue: 16 } },
  recovery: { start: "supported", status: "supported", cancel: "unsupported", result: "supported", deadlineSeconds: 600 }, generatedAudio: "unsupported", pricing: { mode: "free", maximumCreditsPerSlot: 0 },
});
const requiredInputProfile = CapabilityProfileSchema.parse({ ...profile, id: "controlled-required-input", inputs: [{ role: "start-frame", kinds: ["image"], minCount: 1, maxCount: 1 }] });
const freshSeedProfile = CapabilityProfileSchema.parse({ ...profile, id: "controlled-fresh-seed", output: { kind: "video", maxCount: 2 }, parameters: { seed: { policy: "editable", domain: { kind: "enum", values: [-1, 4, 8] }, defaultValue: -1 } } });
const audioProfile = CapabilityProfileSchema.parse({ ...profile, id: "controlled-audio-reference", inputs: [{ role: "audio", kinds: ["audio"], minCount: 1, maxCount: 1, minDurationSeconds: 3, maxDurationSeconds: 30 }], parameters: { duration: { policy: "derived", from: "input-duration", role: "audio" } } });
const providerChosenProfile = CapabilityProfileSchema.parse({ ...profile, id: "controlled-provider-seed", parameters: { seed: { policy: "fixed", value: -1 } } });
const ownedAudio = MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "version_reference_audio", ownerId: "creator", projectId: "project_prepare", kind: "audio", label: "Audio reference", origin: { kind: "upload" }, sourceInputs: [], object: { identity: "unknown", assetId: "owned-audio", storagePath: "users/creator/audio.wav" }, metadata: { state: "verified", audio: "present", durationSeconds: 10, probeVersion: "controlled/1" }, association: "linked", createdAt: "2026-10-10T20:00:00.000Z" });
const preparation = createTestLifecycle({ database, projects, conversations, drafts, contexts, profiles: { get: id => [profile, requiredInputProfile, freshSeedProfile, audioProfile, providerChosenProfile].find(candidate => candidate.id === id) }, media: { get: async (_owner, _project, id) => id === ownedAudio.id ? ownedAudio : undefined } });
afterAll(async () => { await database.terminate(); });
beforeAll(async () => {
  await projects.create("creator", { id: "project_prepare", name: "Campaign" });
  await conversations.create("creator", "project_prepare", { id: "conversation_prepare", name: "Ideas" });
});

it("ACTION-01 prepares direct video, preserves invalid settings and never invents a starting image", async () => {
  const content = { action: "make-video", instructions: "A runner on a floodlit track", inputs: [], settings: { profileId: "wan-t2v", profileRevision: "1", parameters: { numFrames: 81, framesPerSecond: 16 }, outputCount: 1 }, context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 }, destination: { projectId: "project_prepare", conversationId: "conversation_prepare" } };
  await drafts.create("creator", "project_prepare", "conversation_prepare", { id: "draft_prepare", content });
  const ready = await preparation.prepare("creator", "project_prepare", "draft_prepare");
  expect(ready.state).toBe("ready");
  if (ready.state !== "ready") throw new Error("Expected direct video readiness");
  expect(ready.snapshot.inputs).toEqual([]);
  const invalid = { ...content, settings: { ...content.settings, parameters: { numFrames: 50, framesPerSecond: 16 } } };
  await drafts.save("creator", "project_prepare", "draft_prepare", { expectedRevision: 1, content: invalid });
  expect(await preparation.prepare("creator", "project_prepare", "draft_prepare")).toMatchObject({ state: "blocked", reasons: [{ code: "settings_invalid", field: "numFrames" }] });
  expect((await drafts.get("creator", "project_prepare", "draft_prepare")).settings.parameters.numFrames).toBe(50);
});

it("keeps an empty video draft blocked without starting hidden description assistance", async () => {
  await drafts.create("creator", "project_prepare", "conversation_prepare", { id: "draft_empty", content: {
    action: "make-video", instructions: "", inputs: [],
    settings: { profileId: "wan-t2v", profileRevision: "1", parameters: { numFrames: 81, framesPerSecond: 16 }, outputCount: 1 },
    context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 },
    destination: { projectId: "project_prepare", conversationId: "conversation_prepare" },
  } });
  expect(await preparation.prepare("creator", "project_prepare", "draft_empty")).toMatchObject({ state: "blocked", reasons: [{ code: "settings_invalid", field: "instructions" }] });
});

it("ACTION-04 returns every applicable blocker with missing input before settings and instructions", async () => {
  await drafts.create("creator", "project_prepare", "conversation_prepare", { id: "draft_all_blockers", content: {
    action: "make-video", instructions: "", inputs: [],
    settings: { profileId: requiredInputProfile.id, profileRevision: "1", parameters: { numFrames: 50, framesPerSecond: 16 }, outputCount: 1 },
    context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 },
    destination: { projectId: "project_prepare", conversationId: "conversation_prepare" },
  } });
  const result = await preparation.prepare("creator", "project_prepare", "draft_all_blockers");
  expect(result.state).toBe("blocked");
  if (result.state !== "blocked") throw new Error("Invalid input, settings and instructions must all block submission");
  expect(result.reasons.map(reason => ({ code: reason.code, field: reason.field }))).toEqual([
    { code: "input_missing", field: "start-frame" },
    { code: "settings_invalid", field: "numFrames" },
    { code: "settings_invalid", field: "instructions" },
  ]);
});

it("ACTION-09 freezes fresh slot seeds within the exact profile domain and retains them on review retry", async () => {
  await drafts.create("creator", "project_prepare", "conversation_prepare", { id: "draft_fresh_seeds", content: {
    action: "make-video", instructions: "A runner", inputs: [],
    settings: { profileId: freshSeedProfile.id, profileRevision: "1", parameters: { seed: -1 }, outputCount: 2 },
    context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 },
    destination: { projectId: "project_prepare", conversationId: "conversation_prepare" },
  } });
  const first = await preparation.prepare("creator", "project_prepare", "draft_fresh_seeds");
  expect(first.state).toBe("ready");
  if (first.state !== "ready") throw new Error("The qualified seed policy must resolve before review");
  expect(first.slotPlan.every(slot => slot.seed === 4 || slot.seed === 8)).toBe(true);
  expect(first.snapshot.settings.parameters.seed).toBe(-1);
  const reviewedAgain = await preparation.prepare("creator", "project_prepare", "draft_fresh_seeds");
  expect(reviewedAgain).toEqual(first);
});

it("retains unknown provider-chosen seeds without inventing reproducibility", async () => {
  await drafts.create("creator", "project_prepare", "conversation_prepare", { id: "draft_provider_seed", content: {
    action: "make-video", instructions: "A runner", inputs: [],
    settings: { profileId: providerChosenProfile.id, profileRevision: "1", parameters: { seed: -1 }, outputCount: 1 },
    context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 },
    destination: { projectId: "project_prepare", conversationId: "conversation_prepare" },
  } });
  const ready = await preparation.prepare("creator", "project_prepare", "draft_provider_seed");
  if (ready.state !== "ready") throw new Error("The provider-chosen seed must remain an honest unknown");
  expect(ready.snapshot.settings.parameters.seed).toBe(-1);
  expect(ready.slotPlan).toEqual([{ ordinal: 1 }]);
});

it("admits verified duration-constrained audio without requiring visual dimensions", async () => {
  await drafts.create("creator", "project_prepare", "conversation_prepare", { id: "draft_audio_reference", content: {
    action: "make-video", instructions: "A runner", inputs: [{ role: "audio", state: "resolved", versionId: ownedAudio.id }],
    settings: { profileId: audioProfile.id, profileRevision: "1", parameters: {}, outputCount: 1 },
    context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 },
    destination: { projectId: "project_prepare", conversationId: "conversation_prepare" },
  } });
  const ready = await preparation.prepare("creator", "project_prepare", "draft_audio_reference");
  if (ready.state !== "ready") throw new Error("A verified owned audio reference must not require invented dimensions");
  expect(ready.snapshot.settings.parameters.duration).toBe(10);
  expect(ready.snapshot.inputs).toEqual([{ role: "audio", state: "resolved", versionId: ownedAudio.id }]);
});

it("refuses a conversation whose persisted owner no longer matches the project", async () => {
  await conversations.create("creator", "project_prepare", { id: "conversation_denied", name: "Lost access" });
  await drafts.create("creator", "project_prepare", "conversation_denied", { id: "draft_conversation_denied", content: {
    action: "make-video", instructions: "A runner", inputs: [],
    settings: { profileId: profile.id, profileRevision: "1", parameters: {}, outputCount: 1 },
    context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 },
    destination: { projectId: "project_prepare", conversationId: "conversation_denied" },
  } });
  await database.collection("creation_projects").doc("project_prepare").collection("conversations").doc("conversation_denied").update({ ownerId: "another-owner" });
  await expect(preparation.prepare("creator", "project_prepare", "draft_conversation_denied")).rejects.toMatchObject({ code: "access_denied" });
});

it("blocks a draft for a model another server held, before acceptance", async () => {
  const guard = new StudioWorkflowSpendGuard(database, { dailyCapCents: 500 }, () => Date.parse("2026-10-20T00:00:00.000Z"));
  const catalog = new WorkflowCapabilityCatalog(undefined, { imageProviders: new Set(), videoAvailable: () => false, textAvailable: false, replicateAvailable: true, spendGuard: guard });
  const live = createTestLifecycle({ database, projects, conversations, drafts, contexts, profiles: catalog, media: { get: async () => undefined } });
  const gemini = catalog.get("gemini-omni-1.1-t2v")!;
  await drafts.create("creator", "project_prepare", "conversation_prepare", { id: "draft_held_model", content: {
    action: "make-video", instructions: "A runner at dusk", inputs: [],
    settings: { profileId: gemini.id, profileRevision: gemini.revision, parameters: { aspectRatio: "16:9", resolution: "720p" }, outputCount: 1 },
    context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 },
    destination: { projectId: "project_prepare", conversationId: "conversation_prepare" },
  } });
  expect((await live.prepare("creator", "project_prepare", "draft_held_model")).state).toBe("ready");
  await database.collection("workflow_spend_holds").doc(gemini.id).set({ profileId: gemini.id, maximumOutputSeconds: 11, observedSeconds: 12, requestId: "request_elsewhere", slotId: "slot_elsewhere", heldAt: "2026-10-20T00:00:00.000Z" });
  await guard.start(); guard.stop();
  expect(await live.prepare("creator", "project_prepare", "draft_held_model")).toMatchObject({ state: "blocked", reasons: [{ code: "profile_unavailable", message: expect.stringContaining("unavailable during bounded free testing") }] });
});
