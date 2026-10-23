import { expect, it } from "vitest";
import { CapabilityProfileSchema, type CapabilityProfile } from "@shared/schemas/workflow/capability.schemas";
import { DraftInputSchema, type DraftContent, type DraftInput } from "@shared/schemas/workflow/draft.schemas";
import { settingsForProfile } from "@shared/workflow/capabilityEvaluation";
import { ConversationIdSchema, ProjectIdSchema, VersionIdSchema } from "@shared/schemas/workflow/identity.schemas";
import { importedVersionId } from "@shared/schemas/workflow/import.schemas";
import { MediaVersionSchema } from "@shared/schemas/workflow/media.schemas";
import { AcceptedRequestSchema } from "@shared/schemas/workflow/request.schemas";
import {
  applyDraftInputSource,
  bindDraftInput,
  emptyDraftContent,
  followupDraftForRequest,
  initialDraftId,
  modelChoices,
  observedDraftInputs,
  offeredInputRoles,
  resolvePendingDraftInputs,
  withoutDraftInput,
} from "../state/inputBinding";
import { veo, wan22, wan25 } from "./fixtures/modelCreationFixtures";

const first = DraftInputSchema.parse({ state: "resolved", role: "reference", versionId: "version_first" });
const second = DraftInputSchema.parse({ state: "resolved", role: "reference", versionId: "version_second" });
const third = DraftInputSchema.parse({ state: "resolved", role: "reference", versionId: "version_third" });

it("replaces only the chosen reference, preserving the other reference and its order", () => {
  expect(bindDraftInput([first, second], third, 3, first)).toEqual([third, second]);
  expect(bindDraftInput([first, second], third, 3, { ...second })).toEqual([first, third]);
});

it("appends references only while the declared capacity has room", () => {
  const inputs = [first, second];
  expect(bindDraftInput(inputs, third, 3)).toEqual([first, second, third]);
  expect(bindDraftInput(inputs, third, 2)).toBe(inputs);
  expect(bindDraftInput(inputs, { ...first }, 3)).toBe(inputs);
});

it("does not revive a removed input when a delayed file choice completes", () => {
  const inputs = [second];
  const uploading = DraftInputSchema.parse({ state: "importing", role: "reference", importId: "import_replacement" });
  expect(bindDraftInput(inputs, uploading, 3, first)).toBe(inputs);
});

it("changes an exact pending end frame while retaining the start frame", () => {
  const start = DraftInputSchema.parse({ state: "resolved", role: "start-frame", versionId: "version_start" });
  const end = DraftInputSchema.parse({ state: "pending", role: "end-frame", requestId: "request_end", slotId: "slot_end" });
  const uploaded = DraftInputSchema.parse({ state: "importing", role: "end-frame", importId: "import_end" });
  expect(bindDraftInput([start, end], uploaded, 1, end)).toEqual([start, uploaded]);
});

it("derives deterministic imported version IDs and resolves importing/pending draft inputs through inputBinding", async () => {
  const projectId = ProjectIdSchema.parse("project_test");
  const conversationId = ConversationIdSchema.parse("conversation_test");
  expect(importedVersionId("import_sample_1")).toBe("version_sample_1");

  const draftId = await initialDraftId("creator", projectId, conversationId, []);
  expect(draftId.startsWith("draft_initial_")).toBe(true);

  const base = emptyDraftContent("animate-image", projectId, conversationId, 1);
  const withSelectedProfile = { ...base, settings: { ...base.settings, profileId: wan25.id, profileRevision: wan25.revision } };
  const boundImport = applyDraftInputSource(withSelectedProfile, [veo, wan25], {
    state: "importing",
    importId: "import_sample_1",
    kind: "image",
  });
  expect(boundImport.inputs).toEqual([{ state: "importing", role: "start-frame", importId: "import_sample_1" }]);

  // Reject incompatible requestedRole against selected profile
  expect(
    applyDraftInputSource(withSelectedProfile, [veo, wan25], {
      state: "resolved",
      versionId: VersionIdSchema.parse("version_sample_1"),
      kind: "video",
    }, "clip"),
  ).toBe(withSelectedProfile);

  const verifiedMedia = MediaVersionSchema.parse({
    schemaVersion: "vidra-workflow/v2",
    id: "version_sample_1",
    ownerId: "creator",
    projectId,
    kind: "image",
    label: "Sample",
    origin: { kind: "upload" },
    sourceInputs: [],
    object: { identity: "verified", assetId: "asset_1", storagePath: "path/1", generation: "1", sha256: "a".repeat(64), bytes: 100 },
    metadata: { state: "verified", width: 100, height: 100, durationSeconds: 0, audio: "absent", probeVersion: "v1" },
    association: "linked",
    createdAt: "2026-10-17T00:00:00.000Z",
  });
  expect(observedDraftInputs(boundImport.inputs, [verifiedMedia])).toEqual([
    { state: "resolved", role: "start-frame", versionId: "version_sample_1" },
  ]);

  const pendingDraft = {
    ...base,
    inputs: [DraftInputSchema.parse({ state: "pending", role: "primary", requestId: "request_1", slotId: "slot_1" })],
  };
  const request = AcceptedRequestSchema.parse({
    schemaVersion: "vidra-workflow/v2",
    id: "request_1",
    ownerId: "creator",
    projectId,
    conversationId,
    submissionId: "submission_1",
    executionDraftId: "draft_1",
    executionDraftRevision: 1,
    acceptanceSequence: 1,
    snapshotHash: "b".repeat(64),
    acceptedAt: "2026-10-17T00:00:00.000Z",
    snapshot: { ...base, action: "make-image", instructions: "A picture" },
    materializedContext: { projectInstructions: "", entries: [] },
    slots: [{ id: "slot_1", ordinal: 1, outcome: "completed", delivery: "ready", versionId: "version_sample_1", usage: { mode: "free", reserved: 0, settled: 0 } }],
  });
  expect(resolvePendingDraftInputs(pendingDraft, [request], [verifiedMedia], "creator", projectId).inputs).toEqual([
    { state: "resolved", role: "primary", versionId: "version_sample_1" },
  ]);

  const followup = followupDraftForRequest(request, [veo, wan25], projectId, conversationId, 2);
  expect(followup).toMatchObject({
    noticeKind: "edit-unavailable",
    content: { action: "make-image", destination: { projectId, conversationId } },
  });
});

// One model offered as a words version and a start-frame version, plus a picture model that takes no pictures.
const wordsClip = CapabilityProfileSchema.parse({ ...wan22, id: "family-words", label: "Family" });
const framesClip = CapabilityProfileSchema.parse({ ...wan25, id: "family-frames", label: "Family", action: "animate-image", inputs: [{ role: "start-frame", kinds: ["image"], minCount: 1, maxCount: 1 }, { role: "end-frame", kinds: ["image"], minCount: 0, maxCount: 1 }] });
const referencesClip = CapabilityProfileSchema.parse({ ...wordsClip, inputs: [{ role: "reference", kinds: ["image"], minCount: 0, maxCount: 3 }] });
const wordsPicture = CapabilityProfileSchema.parse({ ...wan22, id: "words-picture", label: "Words picture", action: "make-image", mode: "text-to-image", output: { kind: "image", maxCount: 4 } });
const otherFrames = CapabilityProfileSchema.parse({ ...framesClip, id: "other-frames", label: "Other" });
const referencesOther = CapabilityProfileSchema.parse({ ...referencesClip, id: "refs-words", label: "Refs" });
const referencesPicture = CapabilityProfileSchema.parse({ ...wordsPicture, id: "refs-picture", label: "Refs picture", inputs: [{ role: "reference", kinds: ["image"], minCount: 0, maxCount: 14 }] });
const picture = { state: "resolved", versionId: VersionIdSchema.parse("version_picture"), kind: "image" } as const;
const start = DraftInputSchema.parse({ state: "resolved", role: "start-frame", versionId: "version_picture" });
const end = DraftInputSchema.parse({ state: "resolved", role: "end-frame", versionId: "version_end" });
const reference = DraftInputSchema.parse({ state: "resolved", role: "reference", versionId: "version_reference" });
function drafted(profile: CapabilityProfile, inputs: DraftInput[] = []): DraftContent {
  const content = emptyDraftContent(profile.action, ProjectIdSchema.parse("project_test"), ConversationIdSchema.parse("conversation_test"), 1);
  return { ...content, inputs, settings: settingsForProfile(profile, content) };
}

it("offers the picture inputs any model for the output can take beside the current inputs", () => {
  expect(offeredInputRoles(drafted(wordsPicture), [wordsPicture])).toEqual([]);
  expect(offeredInputRoles(drafted(wordsPicture), [wordsPicture, referencesPicture])).toEqual(["reference"]);
  expect(offeredInputRoles(drafted(wordsClip), [wordsClip, otherFrames])).toEqual(["start-frame"]);
  expect(offeredInputRoles(drafted(wordsClip), [wordsClip])).toEqual([]);
  expect(offeredInputRoles(drafted(wordsClip), [wordsClip, framesClip])).toEqual(["start-frame"]);
  expect(offeredInputRoles(drafted(referencesClip), [referencesClip, framesClip])).toEqual(["start-frame", "reference"]);
  expect(offeredInputRoles(drafted(framesClip, [start]), [referencesClip, framesClip])).toEqual(["end-frame"]);
  expect(offeredInputRoles(drafted(referencesClip, [reference]), [referencesClip, framesClip])).toEqual(["reference"]);
});

it("turns a words clip into its model's start-frame version when a start frame is added, and back when it is removed", () => {
  const profiles = [wordsClip, framesClip];
  const animated = applyDraftInputSource(drafted(wordsClip), profiles, picture, "start-frame");
  expect(animated).toMatchObject({ action: "animate-image", settings: { profileId: framesClip.id }, inputs: [start] });
  // A sketch or result used without naming a role takes the start frame the same way.
  expect(applyDraftInputSource(drafted(wordsClip), profiles, picture)).toEqual(animated);
  expect(withoutDraftInput(animated, profiles, animated.inputs[0] as DraftInput)).toMatchObject({ action: "make-video", settings: { profileId: wordsClip.id }, inputs: [] });
  // An end frame left behind keeps the start-frame version, which asks for its start frame again.
  const framed = { ...animated, inputs: [start, end] };
  expect(withoutDraftInput(framed, profiles, start)).toMatchObject({ action: "animate-image", settings: { profileId: framesClip.id }, inputs: [end] });
});

it("keeps a picture as a reference on a model that takes references", () => {
  expect(applyDraftInputSource(drafted(referencesClip), [referencesClip, framesClip], picture)).toMatchObject({
    action: "make-video",
    settings: { profileId: referencesClip.id },
    inputs: [{ state: "resolved", role: "reference", versionId: "version_picture" }],
  });
});

it("moves to another model that takes an attached input, preferring the selected model's own version", () => {
  expect(applyDraftInputSource(drafted(wordsPicture), [wordsPicture, referencesPicture], picture, "reference")).toMatchObject({
    action: "make-image",
    settings: { profileId: referencesPicture.id },
    inputs: [{ state: "resolved", role: "reference", versionId: "version_picture" }],
  });
  expect(applyDraftInputSource(drafted(wordsClip), [wordsClip, otherFrames, framesClip], picture, "start-frame")).toMatchObject({ action: "animate-image", settings: { profileId: framesClip.id } });
  const elsewhere = applyDraftInputSource(drafted(wordsClip), [wordsClip, otherFrames], picture, "start-frame");
  expect(elsewhere).toMatchObject({ action: "animate-image", settings: { profileId: otherFrames.id }, inputs: [start] });
  expect(withoutDraftInput(elsewhere, [wordsClip, otherFrames], elsewhere.inputs[0] as DraftInput)).toMatchObject({ action: "make-video", settings: { profileId: wordsClip.id }, inputs: [] });
});

it("lists one model menu entry per name and greys out models that cannot take the attached inputs", () => {
  const profiles = [wordsClip, framesClip, otherFrames, referencesOther];
  const summary = (content: DraftContent): [string, boolean, boolean][] => modelChoices(content, profiles).map(choice => [choice.profile.id, choice.takesInputs, choice.selected]);
  expect(summary(drafted(wordsClip))).toEqual([[wordsClip.id, true, true], [otherFrames.id, false, false], [referencesOther.id, true, false]]);
  expect(summary(drafted(framesClip, [start]))).toEqual([[framesClip.id, true, true], [otherFrames.id, true, false], [referencesOther.id, false, false]]);
});

it("does not attach a named input when no model for the output takes it", () => {
  const content = drafted(wordsPicture);
  expect(applyDraftInputSource(content, [wordsPicture], picture, "reference")).toBe(content);
});

it("binds a painted area beside its picture, moving to the model that takes it, and drops it when the picture changes", () => {
  const editor = CapabilityProfileSchema.parse({ ...wordsPicture, id: "picture-editor", label: "Editor", action: "edit-image", mode: "image-edit", inputs: [{ role: "primary", kinds: ["image"], minCount: 1, maxCount: 1 }], output: { kind: "image", maxCount: 1 } });
  const areaEditor = CapabilityProfileSchema.parse({ ...editor, id: "area-editor", label: "Area editor", inputs: [...editor.inputs, { role: "mask", kinds: ["image"], minCount: 0, maxCount: 1 }] });
  const profiles = [editor, areaEditor];
  const source = DraftInputSchema.parse({ state: "resolved", role: "primary", versionId: "version_picture" });
  const masked = applyDraftInputSource(drafted(editor, [source]), profiles, { state: "resolved", versionId: VersionIdSchema.parse("version_mask_one"), kind: "image" }, "mask");
  expect(masked).toMatchObject({ settings: { profileId: areaEditor.id }, inputs: [source, { role: "mask", versionId: "version_mask_one" }] });
  // The area belongs to the exact picture it was painted on: another picture makes a whole-picture request.
  const replaced = applyDraftInputSource(masked, profiles, { state: "resolved", versionId: VersionIdSchema.parse("version_other"), kind: "image" }, "primary", source);
  expect(replaced.inputs).toEqual([{ state: "resolved", role: "primary", versionId: "version_other" }]);
});
