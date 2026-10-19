import { expect, it } from "vitest";
import { DraftInputSchema } from "@shared/schemas/workflow/draft.schemas";
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
  observedDraftInputs,
  resolvePendingDraftInputs,
} from "../state/inputBinding";
import { veo, wan25 } from "./fixtures/modelCreationFixtures";

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
