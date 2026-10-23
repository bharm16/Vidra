import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { VersionIdSchema } from "@shared/schemas/workflow/identity.schemas";
import { ProjectSchema, ConversationSchema } from "@shared/schemas/workflow/project.schemas";
import { CreationDraftSchema, type CreationDraft, type DraftContent } from "@shared/schemas/workflow/draft.schemas";
import { CapabilityProfileSchema } from "@shared/schemas/workflow/capability.schemas";
import { AcceptedRequestSchema, type AcceptedRequest, type SubmissionCommand } from "@shared/schemas/workflow/request.schemas";
import { MediaVersionSchema } from "@shared/schemas/workflow/media.schemas";
import { PreparedActionSchema } from "@shared/schemas/workflow/preparation.schemas";
import type { ApiErrorCode } from "@shared/types/api";
import { WorkflowApiError } from "../api/workflowApi";
import { draftContent } from "../state/draftBuffer";
import { useProjectWorkspace } from "../hooks/useProjectWorkspace";

const ports = vi.hoisted(() => ({
  api: {
    getProject: vi.fn(), listConversations: vi.fn(), listDrafts: vi.fn(), history: vi.fn(), profiles: vi.fn(), media: vi.fn(),
    requestStatus: vi.fn(), cancelRequest: vi.fn(), reconcileRequest: vi.fn(), createConversation: vi.fn(), saveDraft: vi.fn(), createDraft: vi.fn(), draftStatus: vi.fn(), prepare: vi.fn(), submit: vi.fn(), recover: vi.fn(), access: vi.fn(),
  },
  device: { save: vi.fn(), get: vi.fn(), list: vi.fn(), submissions: vi.fn(), saveSubmission: vi.fn() },
}));
vi.mock("../api/workflowApi", () => ({
  WorkflowApi: class {
    getProject = ports.api.getProject; listConversations = ports.api.listConversations; listDrafts = ports.api.listDrafts;
    history = ports.api.history; profiles = ports.api.profiles; media = ports.api.media;
    requestStatus = ports.api.requestStatus; cancelRequest = ports.api.cancelRequest; reconcileRequest = ports.api.reconcileRequest; createConversation = ports.api.createConversation;
    saveDraft = ports.api.saveDraft; createDraft = ports.api.createDraft; draftStatus = ports.api.draftStatus;
    prepare = ports.api.prepare; submit = ports.api.submit; recover = ports.api.recover; access = ports.api.access;
  },
  WorkflowApiError: class extends Error {
    constructor(message: string, readonly status: number, readonly code?: string) { super(message); }
  },
}));
vi.mock("@/repositories/workflow/DraftCheckpointStore", () => ({
  DraftCheckpointStore: class {
    save = ports.device.save; get = ports.device.get; list = ports.device.list;
    submissions = ports.device.submissions; saveSubmission = ports.device.saveSubmission;
  },
}));

const context = { origin: "empty", requestIds: [], projectInstructionsRevision: 1 };
const destination = { projectId: "project_hook", conversationId: "conversation_hook" };
const timestamp = "2026-10-10T20:00:00.000Z";
const project = ProjectSchema.parse({ schemaVersion: "vidra-workflow/v2", id: destination.projectId, ownerId: "creator", revision: 1, name: "Campaign", status: "active", instructions: { revision: 1, text: "" }, origin: { kind: "new" }, createdAt: timestamp, updatedAt: timestamp });
const conversation = ConversationSchema.parse({ schemaVersion: "vidra-workflow/v2", id: destination.conversationId, projectId: project.id, ownerId: "creator", revision: 1, name: "Ideas", status: "active", acceptanceSequence: 0, initialContext: context, createdAt: timestamp, updatedAt: timestamp });
const profile = CapabilityProfileSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "controlled-video", revision: "1", label: "Controlled", action: "make-video", provider: "controlled", endpoint: "controlled/video", mode: "text-to-video", availability: "qualified", inputs: [], output: { kind: "video", maxCount: 1 }, maxContextCharacters: 32000, parameters: {}, recovery: { start: "supported", status: "supported", cancel: "supported", result: "supported", deadlineSeconds: 600 }, generatedAudio: "unsupported", pricing: { mode: "free", maximumCreditsPerSlot: 0 } });
const original = CreationDraftSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "draft_original", ownerId: "creator", projectId: project.id, conversationId: conversation.id, revision: 1, status: "open", action: "make-video", instructions: "Original direction", inputs: [], settings: { profileId: profile.id, profileRevision: "1", parameters: {}, outputCount: 1 }, context, destination, createdAt: timestamp, updatedAt: timestamp });

function accepted(command: { submissionId: string; draftId: string; draftRevision: number; reviewedHash: string }, content: DraftContent = draftContent(original)) {
  return AcceptedRequestSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "request_accepted", ownerId: "creator", projectId: project.id, conversationId: conversation.id, submissionId: command.submissionId, executionDraftId: command.draftId, executionDraftRevision: command.draftRevision, acceptanceSequence: 1, snapshotHash: command.reviewedHash, snapshot: content, materializedContext: { projectInstructions: "", entries: [] }, slots: Array.from({ length: content.settings.outputCount }, (_, index) => ({ id: `slot_${index + 1}`, ordinal: index + 1, outcome: "queued", delivery: "none", usage: { mode: "free", reserved: 0, settled: 0 } })), acceptedAt: timestamp });
}

beforeEach(() => {
  vi.resetAllMocks();
  ports.api.getProject.mockResolvedValue(project); ports.api.listConversations.mockResolvedValue([conversation]);
  ports.api.listDrafts.mockResolvedValue([original]); ports.api.history.mockResolvedValue([]);
  ports.api.profiles.mockResolvedValue([profile]); ports.api.media.mockResolvedValue([]);
  ports.device.get.mockResolvedValue(undefined); ports.device.list.mockResolvedValue([]); ports.device.submissions.mockResolvedValue([]);
  ports.device.save.mockResolvedValue(undefined); ports.device.saveSubmission.mockResolvedValue(undefined);
  ports.api.requestStatus.mockRejectedValue(new Error("Status not configured in this test"));
  ports.api.saveDraft.mockImplementation(async (_project: string, id: string, revision: number, content: DraftContent) => ({ state: "saved", draft: CreationDraftSchema.parse({ ...original, ...content, id, revision: revision + 1 }) }));
  ports.api.prepare.mockResolvedValue(PreparedActionSchema.parse({ state: "ready", draftId: original.id, draftRevision: 1, snapshot: draftContent(original), materializedContext: { projectInstructions: "", entries: [] }, reviewedHash: "a".repeat(64), profile, slotPlan: [{ ordinal: 1 }] }));
  ports.api.createDraft.mockImplementation(async (_project: string, _conversation: string, id: string, content: DraftContent) => CreationDraftSchema.parse({ ...original, ...content, id, revision: 1 }));
  ports.api.draftStatus.mockImplementation(async (_project: string, id: string, revision: number, status: string) => CreationDraftSchema.parse({ ...original, id, revision: revision + 1, status }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function loaded() {
  const hook = renderHook(() => useProjectWorkspace("creator", project.id));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

it("PE-W03 recovered acceptance opens an empty video follow-up and preserves the viewed media", async () => {
  const { result } = await loaded();
  act(() => result.current.viewMedia("version_viewed"));
  await act(async () => { await result.current.prepare(); });
  ports.api.submit.mockRejectedValueOnce(new Error("Acceptance response was lost"));
  await act(async () => { await result.current.submit(); });
  const pending = result.current.submissions[0];
  if (!pending) throw new Error("The lost response must retain its captured submission");
  ports.api.recover.mockResolvedValue(accepted(pending.command));
  await act(async () => { await result.current.recover(pending); });
  expect(result.current.active?.record.id).not.toBe(original.id);
  expect(result.current.active?.content.instructions).toBe("");
  expect(result.current.active?.content.inputs).toEqual([]);
  expect(result.current.view.viewedVersionId).toBe("version_viewed");
  expect(result.current.view.requests).toHaveLength(1);
});

it("D04 a single image acceptance declares its exact pending edit base only when an edit profile is qualified", async () => {
  const imageProfile = CapabilityProfileSchema.parse({ ...profile, id: "controlled-image", action: "make-image", output: { kind: "image", maxCount: 1 } });
  const editProfile = CapabilityProfileSchema.parse({ ...imageProfile, id: "controlled-image-edit", action: "edit-image", inputs: [{ role: "primary", kinds: ["image"], minCount: 1, maxCount: 1 }] });
  const imageDraft = CreationDraftSchema.parse({ ...original, action: "make-image", settings: { ...original.settings, profileId: imageProfile.id } });
  ports.api.listDrafts.mockResolvedValue([imageDraft]); ports.api.profiles.mockResolvedValue([imageProfile, editProfile]);
  ports.api.prepare.mockResolvedValue(PreparedActionSchema.parse({ state: "ready", draftId: imageDraft.id, draftRevision: 1, snapshot: draftContent(imageDraft), materializedContext: { projectInstructions: "", entries: [] }, reviewedHash: "a".repeat(64), profile: imageProfile, slotPlan: [{ ordinal: 1 }] }));
  ports.api.submit.mockImplementation(async (_project: string, command: SubmissionCommand) => accepted(command, draftContent(imageDraft)));
  const { result } = await loaded();
  act(() => result.current.viewMedia("version_viewed"));
  await act(async () => { await result.current.prepare(); });
  await act(async () => { await result.current.submit(); });
  expect(result.current.active?.content.action).toBe("edit-image");
  expect(result.current.active?.content.inputs).toEqual([{ role: "primary", state: "pending", requestId: "request_accepted", slotId: "slot_1" }]);
  expect(result.current.active?.content.context.requestIds).toEqual(["request_accepted"]);
  expect(result.current.active?.content.settings.profileId).toBe(editProfile.id);
  expect(result.current.view.viewedVersionId).toBe("version_viewed");
});

it("J02 a missing receipt offers an explicit resend of the same captured identity without an automatic dispatch", async () => {
  const { result } = await loaded();
  await act(async () => { await result.current.prepare(); });
  ports.api.submit.mockRejectedValueOnce(new Error("Connection lost"));
  await act(async () => { await result.current.submit(); });
  const pending = result.current.submissions[0];
  if (!pending) throw new Error("The uncertain submission must keep its original envelope");
  ports.api.recover.mockResolvedValue(undefined);
  await act(async () => { await result.current.recover(pending); });
  expect(result.current.resendableSubmissions).toEqual([pending.submissionId]);
  expect(ports.api.submit).toHaveBeenCalledTimes(1);
  expect(result.current.active?.record.status).toBe("submitted");
  ports.api.submit.mockResolvedValueOnce(accepted(pending.command));
  await act(async () => { await result.current.resend(pending); });
  expect(result.current.view.requests[0]?.submissionId).toBe(pending.submissionId);
  expect(ports.api.submit.mock.calls[1]?.[1]).toEqual(pending.command);
  expect(result.current.submissions).toEqual([]);
});

const refusals: Array<{ status: number; code: ApiErrorCode | undefined; editable: boolean }> = [
  { status: 409, code: "revision_conflict", editable: true },
  { status: 409, code: undefined, editable: false },
  { status: 503, code: "capability_unavailable", editable: true },
  { status: 503, code: undefined, editable: false },
];
it.each(refusals)("J03 preserves editable work only for a proven pre-admission refusal ($status/$code)", async ({ status, code, editable }) => {
  const { result } = await loaded();
  await act(async () => { await result.current.prepare(); });
  ports.api.submit.mockRejectedValueOnce(new WorkflowApiError("Submission refused", status, code));
  await act(async () => { await result.current.submit(); });
  expect(result.current.active?.record.status).toBe(editable ? "open" : "submitted");
  expect(result.current.submissions).toHaveLength(editable ? 0 : 1);
  expect(result.current.active?.content.instructions).toBe("Original direction");
});

it("binds an import to its captured draft without clearing words and never restores a removed role on media completion", async () => {
  const { result } = await loaded();
  act(() => result.current.bindImport("draft_original", "import_file", "image"));
  expect(result.current.active?.content.instructions).toBe("Original direction");
  expect(result.current.active?.content.inputs).toEqual([{ role: "reference", state: "importing", importId: "import_file" }]);
  const active = result.current.active;
  if (!active) throw new Error("No active draft");
  act(() => result.current.edit({ ...active.content, inputs: [] }));
  const version = (await import("@shared/schemas/workflow/media.schemas")).MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "version_file", ownerId: "creator", projectId: "project_hook", kind: "image", label: "Imported picture", origin: { kind: "upload" }, sourceInputs: [], object: { identity: "unknown", assetId: "file", storagePath: "users/creator/previews/images/file.png" }, metadata: { state: "pending" }, association: "linked", createdAt: timestamp });
  act(() => result.current.updateMedia(version));
  expect(result.current.media).toEqual([version]);
  expect(result.current.active?.content.inputs).toEqual([]);
  expect(result.current.active?.content.instructions).toBe("Original direction");
});

it("a result's verb binds the result into the working request and keeps its words, without a new draft", async () => {
  const animate = CapabilityProfileSchema.parse({ ...profile, id: "controlled-animate", action: "animate-image", mode: "image-to-video", inputs: [{ role: "start-frame", kinds: ["image"], minCount: 1, maxCount: 1 }] });
  const picture = MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "version_picture", ownerId: "creator", projectId: project.id, kind: "image", label: "Desk", origin: { kind: "upload" }, sourceInputs: [], object: { identity: "unknown", assetId: "file", storagePath: "users/creator/previews/images/file.png" }, metadata: { state: "pending" }, association: "linked", createdAt: timestamp });
  ports.api.profiles.mockResolvedValue([profile, animate]); ports.api.media.mockResolvedValue([picture]);
  const { result } = await loaded();
  await waitFor(() => expect(result.current.media).toHaveLength(1));
  await act(() => result.current.bindResult("animate-image", picture));
  expect(ports.api.createDraft).not.toHaveBeenCalled();
  expect(result.current.active?.record.id).toBe(original.id);
  expect(result.current.active?.content).toMatchObject({ action: "animate-image", instructions: "Original direction", inputs: [{ state: "resolved", role: "start-frame", versionId: picture.id }] });
});

it("does not replace the only in-memory words with a new draft when both retention paths fail", async () => {
  ports.device.save.mockRejectedValue(new Error("Device storage unavailable"));
  ports.api.saveDraft.mockRejectedValue(new Error("Server save unavailable"));
  const { result } = await loaded();
  const current = result.current.active;
  if (!current) throw new Error("Expected the loaded draft");
  act(() => result.current.edit({ ...current.content, instructions: "Only retained in this tab" }));
  await waitFor(() => expect(result.current.localErrors[current.record.id]).toBeTruthy());
  await act(async () => { await result.current.newDraft("make-image"); });
  expect(result.current.active?.record.id).toBe(current.record.id);
  expect(result.current.active?.content.instructions).toBe("Only retained in this tab");
  expect(result.current.canLeave()).toBe(false);
  expect(ports.api.createDraft).not.toHaveBeenCalled();
  expect(result.current.error).toContain("Keep a copy");
});

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve = (_value: T): void => { throw new Error("Deferred result was not initialized"); };
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

it("Make uses its fresh prepared snapshot once even when an older review exists and the control is clicked twice", async () => {
  const { result } = await loaded();
  await act(async () => { await result.current.prepare(); });
  const fresh = PreparedActionSchema.parse({ state: "ready", draftId: original.id, draftRevision: 1, snapshot: draftContent(original), materializedContext: { projectInstructions: "", entries: [] }, reviewedHash: "b".repeat(64), profile, slotPlan: [{ ordinal: 1 }] });
  ports.api.prepare.mockResolvedValue(fresh);
  ports.api.submit.mockImplementation(async (_project: string, command: SubmissionCommand) => accepted(command));
  await act(async () => { await Promise.all([result.current.make(), result.current.make()]); });
  expect(ports.api.submit).toHaveBeenCalledTimes(1);
  expect(ports.api.submit).toHaveBeenCalledWith(project.id, expect.objectContaining({ reviewedHash: "b".repeat(64), draftId: original.id }));
});

it("Make never submits after current words change while preparation is pending", async () => {
  const { result } = await loaded();
  const preparing = deferred<unknown>();
  const prepared = PreparedActionSchema.parse({ state: "ready", draftId: original.id, draftRevision: 1, snapshot: draftContent(original), materializedContext: { projectInstructions: "", entries: [] }, reviewedHash: "a".repeat(64), profile, slotPlan: [{ ordinal: 1 }] });
  ports.api.prepare.mockReturnValueOnce(preparing.promise);
  let making: Promise<void> | undefined;
  await act(async () => { making = result.current.make(); });
  act(() => result.current.edit({ ...draftContent(original), instructions: "Newer unfinished words" }));
  await act(async () => { preparing.resolve(prepared); await making; });
  expect(ports.api.submit).not.toHaveBeenCalled();
  expect(result.current.active?.content.instructions).toBe("Newer unfinished words");
});

it("an account change while checkpointing cannot send the previous owner's creative request", async () => {
  const pending = deferred<void>();
  const hook = renderHook(({ owner }) => useProjectWorkspace(owner, project.id), { initialProps: { owner: "creator" } });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  ports.device.saveSubmission.mockReturnValueOnce(pending.promise);
  let making: Promise<void> | undefined;
  await act(async () => { making = hook.result.current.make(); });
  ports.api.getProject.mockResolvedValue({ ...project, ownerId: "other" });
  ports.api.listConversations.mockResolvedValue([{ ...conversation, ownerId: "other" }]);
  ports.api.listDrafts.mockResolvedValue([{ ...original, ownerId: "other" }]);
  hook.rerender({ owner: "other" });
  await waitFor(() => expect(hook.result.current.project?.ownerId).toBe("other"));
  await act(async () => { pending.resolve(); await making; });
  expect(ports.api.submit).not.toHaveBeenCalled();
  expect(hook.result.current.active?.record.ownerId).toBe("other");
});

it("loads only the validated owned initial conversation instead of falling back to another", async () => {
  const other = { ...conversation, id: "conversation_second" };
  const otherDraft = CreationDraftSchema.parse({ ...original, id: "draft_second", conversationId: other.id, destination: { ...destination, conversationId: other.id } });
  ports.api.listConversations.mockResolvedValue([conversation, other]);
  ports.api.listDrafts.mockResolvedValue([otherDraft]);
  const { result } = renderHook(() => useProjectWorkspace("creator", project.id, other.id));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.conversation?.id).toBe(other.id);
  expect(ports.api.listDrafts).toHaveBeenCalledWith(project.id, other.id, expect.any(AbortSignal));
  expect(result.current.active?.record.id).toBe(otherDraft.id);
});

it("rejects an unavailable initial conversation without revealing the default conversation's work", async () => {
  const { result } = renderHook(() => useProjectWorkspace("creator", project.id, "conversation_missing"));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toMatch(/unavailable/);
  expect(result.current.active).toBeUndefined();
  expect(ports.api.listDrafts).not.toHaveBeenCalled();
});

it("hydrates an exact retained parked request without first activating the default open request", async () => {
  const target = CreationDraftSchema.parse({ ...original, id: "draft_retained", status: "parked", instructions: "Retained working words" });
  ports.api.listDrafts.mockResolvedValue([original, target]);
  const selected: Array<string | undefined> = [];
  const { result } = renderHook(() => {
    const controller = useProjectWorkspace("creator", project.id, conversation.id, target.id);
    selected.push(controller.active?.record.id);
    return controller;
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.active?.record.id).toBe(target.id);
  expect(selected).not.toContain(original.id);
  expect(ports.api.createDraft).not.toHaveBeenCalled();
  expect(ports.api.saveDraft).not.toHaveBeenCalled();
});

it.each(["missing", "discarded", "foreign-owner", "foreign-project", "foreign-conversation"])("fails closed for an explicit %s return target instead of activating or creating a fallback", async state => {
  const target = CreationDraftSchema.parse({ ...original, id: "draft_retained", status: state === "discarded" ? "discarded" : "parked", ...(state === "foreign-owner" ? { ownerId: "another" } : {}), ...(state === "foreign-project" ? { projectId: "project_another", destination: { ...destination, projectId: "project_another" } } : {}), ...(state === "foreign-conversation" ? { conversationId: "conversation_another", destination: { ...destination, conversationId: "conversation_another" } } : {}) });
  ports.api.listDrafts.mockResolvedValue(state === "missing" ? [] : [original, target]);
  const { result } = renderHook(() => useProjectWorkspace("creator", project.id, conversation.id, target.id));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.active).toBeUndefined();
  expect(result.current.error).toMatch(/retained request is unavailable/);
  expect(ports.api.createDraft).not.toHaveBeenCalled();
  expect(ports.api.saveDraft).not.toHaveBeenCalled();
});

it("opens an accepted unknown-receipt target as submitted and lets an explicit New request retire the one-time return", async () => {
  const target = CreationDraftSchema.parse({ ...original, id: "draft_accepted", status: "submitted" });
  ports.api.listDrafts.mockResolvedValue([original, target]);
  const { result } = renderHook(() => useProjectWorkspace("creator", project.id, conversation.id, target.id));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.active?.record.id).toBe(target.id);
  act(() => result.current.edit({ ...draftContent(target), instructions: "Cannot rewrite accepted words" }));
  expect(result.current.active?.content.instructions).toBe(target.instructions);
  expect(ports.api.saveDraft).not.toHaveBeenCalled();
  await act(async () => { await result.current.newDraft("make-image"); });
  const createdId = result.current.active?.record.id;
  expect(createdId).toBeTruthy(); expect(createdId).not.toBe(target.id);
  expect(result.current.active?.record.status).toBe("open");
  expect(ports.api.draftStatus).not.toHaveBeenCalled();
  act(() => result.current.reload());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.active?.record.id).toBe(createdId);
  expect(ports.api.createDraft).toHaveBeenCalledTimes(1);
});

it.each(["read-first", "create-first"])("a New request intent retires delayed initial return selection before either reply (%s)", async order => {
  const target = CreationDraftSchema.parse({ ...original, id: "draft_retained", status: "parked" });
  const read = deferred<CreationDraft[]>();
  const create = deferred<CreationDraft>();
  ports.api.listDrafts.mockReturnValueOnce(read.promise);
  ports.api.createDraft.mockReturnValueOnce(create.promise);
  const selected: Array<string | undefined> = [];
  const { result } = renderHook(() => {
    const controller = useProjectWorkspace("creator", project.id, conversation.id, target.id);
    selected.push(controller.active?.record.id);
    return controller;
  });
  await waitFor(() => expect(result.current.conversation?.id).toBe(conversation.id));
  expect(result.current.loading).toBe(true);
  let creating: Promise<void> | undefined;
  await act(async () => { creating = result.current.newDraft("make-image"); });
  expect(ports.api.createDraft).toHaveBeenCalledTimes(1);
  const command = ports.api.createDraft.mock.calls[0];
  const created = CreationDraftSchema.parse({ ...original, ...command?.[3], id: command?.[2] });
  if (order === "read-first") {
    await act(async () => { read.resolve([original, target]); });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.active).toBeUndefined();
    await act(async () => { create.resolve(created); await creating; });
  } else {
    await act(async () => { create.resolve(created); await creating; });
    expect(result.current.active?.record.id).toBe(created.id);
    await act(async () => { read.resolve([original, target]); });
    await waitFor(() => expect(result.current.loading).toBe(false));
  }
  expect(result.current.active?.record.id).toBe(created.id);
  expect(selected).not.toContain(target.id); expect(selected).not.toContain(original.id);
  expect(result.current.error).toBeUndefined();
  expect(ports.api.createDraft).toHaveBeenCalledTimes(1);
  expect(ports.api.prepare).not.toHaveBeenCalled(); expect(ports.api.submit).not.toHaveBeenCalled();
});

it("does not publish a delayed return-read failure over the New request that superseded it", async () => {
  const read = deferred<CreationDraft[]>();
  ports.api.listDrafts.mockReturnValueOnce(read.promise.then(() => { throw new Error("Return read failed"); }));
  const { result } = renderHook(() => useProjectWorkspace("creator", project.id, conversation.id, "draft_retained"));
  await waitFor(() => expect(result.current.conversation?.id).toBe(conversation.id));
  await act(async () => { await result.current.newDraft("make-image"); read.resolve([]); });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.active?.record.status).toBe("open");
  expect(result.current.error).toBeUndefined();
  expect(result.current.loadFailureStatus).toBeUndefined();
});

it("repairs durable delivery through reconciliation while a creative retry captures a separate request", async () => {
  const { result } = await loaded();
  const failed = AcceptedRequestSchema.parse({ ...accepted({ submissionId: "submission_failed", draftId: original.id, draftRevision: 1, reviewedHash: "a".repeat(64) }), slots: [{ id: "slot_1", ordinal: 1, outcome: "completed", delivery: "attachment-failed", versionId: "version_saved", usage: { mode: "free", reserved: 0, settled: 0 } }] });
  ports.api.reconcileRequest.mockResolvedValue(failed);
  await act(async () => { await result.current.retryRequest(failed, "slot_1"); });
  expect(ports.api.reconcileRequest).toHaveBeenCalledWith(project.id, failed.id);
  expect(ports.api.createDraft).not.toHaveBeenCalled();
  expect(ports.api.submit).not.toHaveBeenCalled();
  const creative = AcceptedRequestSchema.parse({ ...failed, id: "request_new_try", slots: [{ ...failed.slots[0], outcome: "failed", delivery: "none", versionId: undefined }] });
  ports.api.prepare.mockImplementation(async (_project: string, draftId: string) => PreparedActionSchema.parse({ state: "ready", draftId, draftRevision: 1, snapshot: draftContent(original), materializedContext: { projectInstructions: "", entries: [] }, reviewedHash: "c".repeat(64), profile, slotPlan: [{ ordinal: 1 }] }));
  ports.api.submit.mockImplementation(async (_project: string, command: SubmissionCommand) => accepted(command));
  const before = result.current.active?.record.id;
  await act(async () => { await Promise.all([result.current.retryRequest(creative, "slot_1"), result.current.retryRequest(creative, "slot_1")]); });
  expect(ports.api.createDraft).toHaveBeenCalledTimes(1);
  expect(ports.api.submit).toHaveBeenCalledTimes(1);
  expect(result.current.active?.record.id).toBe(before);
  expect(result.current.active?.content.instructions).toBe(original.instructions);
});

it("a text answer can only overwrite its captured writable draft revision", async () => {
  const { result } = await loaded();
  const answer = AcceptedRequestSchema.parse({ ...accepted({ submissionId: "submission_answer", draftId: "draft_answer", draftRevision: 1, reviewedHash: "a".repeat(64) }), snapshot: { ...draftContent(original), action: "improve-words", contextualTarget: { kind: "draft", draftId: original.id, revision: 1 } }, slots: [{ id: "slot_answer", ordinal: 1, outcome: "completed", delivery: "ready", text: "Improved words", usage: { mode: "free", reserved: 0, settled: 0 } }] });
  act(() => result.current.edit({ ...draftContent(original), instructions: "Keep my newer work" }));
  await act(async () => { await result.current.applyText(answer, "Improved words"); });
  expect(result.current.active?.content.instructions).toBe("Keep my newer work");
  expect(result.current.error).toMatch(/target words have changed/);
});

it("polling resolves only the waiting exact result while preserving new words and the viewed version", async () => {
  const imageProfile = CapabilityProfileSchema.parse({ ...profile, id: "picture", action: "make-image", output: { kind: "image", maxCount: 1 } });
  const editProfile = CapabilityProfileSchema.parse({ ...imageProfile, id: "picture-edit", action: "edit-image", inputs: [{ role: "primary", kinds: ["image"], minCount: 1, maxCount: 1 }] });
  const imageDraft = CreationDraftSchema.parse({ ...original, action: "make-image", settings: { ...original.settings, profileId: imageProfile.id } });
  const version = MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "version_completed", ownerId: "creator", projectId: project.id, kind: "image", label: "Completed picture", origin: { kind: "upload" }, sourceInputs: [], object: { identity: "unknown", assetId: "owned", storagePath: "uploads/creator/owned" }, metadata: { state: "pending" }, association: "linked", createdAt: timestamp });
  ports.api.listDrafts.mockResolvedValue([imageDraft]); ports.api.profiles.mockResolvedValue([imageProfile, editProfile]);
  ports.api.prepare.mockResolvedValue(PreparedActionSchema.parse({ state: "ready", draftId: imageDraft.id, draftRevision: 1, snapshot: draftContent(imageDraft), materializedContext: { projectInstructions: "", entries: [] }, reviewedHash: "a".repeat(64), profile: imageProfile, slotPlan: [{ ordinal: 1 }] }));
  let captured: AcceptedRequest | undefined;
  ports.api.submit.mockImplementation(async (_project: string, command: SubmissionCommand) => { captured = accepted(command, draftContent(imageDraft)); return captured; });
  const status = deferred<AcceptedRequest>();
  ports.api.requestStatus.mockReturnValue(status.promise);
  const { result } = await loaded();
  act(() => result.current.viewMedia("version_inspecting"));
  ports.api.media.mockResolvedValue([version]);
  await act(async () => { await result.current.make(); });
  await waitFor(() => expect(ports.api.requestStatus).toHaveBeenCalled());
  const active = result.current.active;
  if (!active || !captured) throw new Error("Expected a separate image follow-up and captured request");
  act(() => result.current.edit({ ...active.content, instructions: "New words written while the picture is running" }));
  const complete = AcceptedRequestSchema.parse({ ...captured, slots: [{ ...captured.slots[0], outcome: "completed", delivery: "ready", versionId: version.id }] });
  await act(async () => { status.resolve(complete); });
  await waitFor(() => expect(result.current.active?.content.inputs).toEqual([{ role: "primary", state: "resolved", versionId: version.id }]));
  expect(result.current.active?.content.instructions).toBe("New words written while the picture is running");
  expect(result.current.view.viewedVersionId).toBe("version_inspecting");
  expect(result.current.view.requests[0]?.slots[0]?.outcome).toBe("completed");
});

it("cancellation reports the server's pending or unsupported outcome without inventing cancellation", async () => {
  const { result } = await loaded();
  const request = AcceptedRequestSchema.parse({ ...accepted({ submissionId: "submission_running", draftId: original.id, draftRevision: 1, reviewedHash: "a".repeat(64) }), slots: [{ id: "slot_running", ordinal: 1, outcome: "running", delivery: "none", cancellation: "unsupported", usage: { mode: "free", reserved: 0, settled: 0 } }] });
  ports.api.cancelRequest.mockResolvedValue(request);
  await act(async () => { await result.current.requestCancel(request); });
  expect(result.current.view.requests[0]?.slots[0]).toMatchObject({ outcome: "running", cancellation: "unsupported" });
  expect(ports.api.submit).not.toHaveBeenCalled();
});

it("metadata observations reject foreign scope and retain newer owned revisions without changing drafts", async () => {
  const { result } = await loaded();
  const active = result.current.active;
  act(() => {
    result.current.observeProject({ ...project, ownerId: "another", revision: 99, name: "Foreign" });
    result.current.observeProject({ ...project, revision: 3, name: "Renamed" });
    result.current.observeProject({ ...project, revision: 2, name: "Older name" });
    result.current.observeConversation({ ...conversation, revision: 3, status: "archived" });
    result.current.observeConversation({ ...conversation, revision: 2, status: "active" });
  });
  expect(result.current.project?.name).toBe("Renamed");
  expect(result.current.conversation?.status).toBe("archived");
  expect(result.current.active).toBe(active);
});

it("syncing the URL after an explicit conversation switch preserves the newly opened draft", async () => {
  const second = ConversationSchema.parse({ ...conversation, id: "conversation_second" });
  const secondDraft = CreationDraftSchema.parse({ ...original, id: "draft_second", conversationId: second.id, destination: { ...destination, conversationId: second.id } });
  ports.api.listConversations.mockResolvedValue([conversation, second]);
  ports.api.listDrafts.mockImplementation(async (_project: string, conversationId: string) => conversationId === second.id ? [secondDraft] : [original]);
  const { result, rerender } = renderHook(({ selected }) => useProjectWorkspace("creator", project.id, selected), { initialProps: { selected: conversation.id } });
  await waitFor(() => expect(result.current.active?.record.id).toBe(original.id));
  await act(async () => { await result.current.openConversation(second.id); });
  await waitFor(() => expect(result.current.active?.record.id).toBe(secondDraft.id));
  act(() => result.current.edit({ ...draftContent(secondDraft), instructions: "Unfinished in the second conversation" }));
  const calls = ports.api.listDrafts.mock.calls.length;
  rerender({ selected: second.id });
  await act(async () => undefined);
  expect(ports.api.listDrafts).toHaveBeenCalledTimes(calls);
  expect(result.current.active?.content.instructions).toBe("Unfinished in the second conversation");
});

it("opens the exact parked request from a past conversation rather than its first open draft", async () => {
  const second = ConversationSchema.parse({ ...conversation, id: "conversation_past", name: "Past ideas" });
  const first = CreationDraftSchema.parse({ ...original, id: "draft_first_past", conversationId: second.id, destination: { ...destination, conversationId: second.id } });
  const selected = CreationDraftSchema.parse({ ...first, id: "draft_selected_past", status: "parked", instructions: "The exact parked request" });
  ports.api.listConversations.mockResolvedValue([conversation, second]);
  ports.api.listDrafts.mockImplementation(async (_project: string, id: string) => id === second.id ? [first, selected] : [original]);
  const { result } = await loaded();
  act(() => result.current.viewMedia("version_inspecting"));
  await act(async () => { await result.current.openConversationDraft(selected); });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.conversation?.id).toBe(second.id);
  expect(result.current.active?.record.id).toBe(selected.id);
  expect(result.current.active?.content.instructions).toBe(selected.instructions);
  expect(result.current.view.drafts[original.id]?.content.instructions).toBe(original.instructions);
  expect(result.current.view.viewedVersionId).toBe("version_inspecting");
});

it("refuses a past-conversation draft when current words have no safe retained copy", async () => {
  const second = ConversationSchema.parse({ ...conversation, id: "conversation_past" });
  const selected = CreationDraftSchema.parse({ ...original, id: "draft_past", conversationId: second.id, destination: { ...destination, conversationId: second.id } });
  ports.api.listConversations.mockResolvedValue([conversation, second]);
  const { result } = await loaded();
  ports.device.save.mockRejectedValue(new Error("Local storage unavailable"));
  ports.api.saveDraft.mockRejectedValue(new Error("Offline"));
  await act(async () => { result.current.edit({ ...draftContent(original), instructions: "Unretained current words" }); });
  const calls = ports.api.listDrafts.mock.calls.length;
  await act(async () => { await expect(result.current.openConversationDraft(selected)).rejects.toThrow(/Keep a copy/); });
  expect(ports.api.listDrafts).toHaveBeenCalledTimes(calls);
  expect(result.current.active?.content.instructions).toBe("Unretained current words");
});

it("a late past-conversation load cannot replace work edited while it was opening", async () => {
  const second = ConversationSchema.parse({ ...conversation, id: "conversation_past" });
  const selected = CreationDraftSchema.parse({ ...original, id: "draft_past", conversationId: second.id, destination: { ...destination, conversationId: second.id } });
  ports.api.listConversations.mockResolvedValue([conversation, second]);
  const { result } = await loaded();
  const pending = deferred<typeof selected[]>();
  ports.api.listDrafts.mockReturnValueOnce(pending.promise);
  let opening: Promise<void> | undefined;
  await act(async () => { opening = result.current.openConversationDraft(selected); });
  act(() => result.current.edit({ ...draftContent(original), instructions: "New words while waiting" }));
  await act(async () => { pending.resolve([selected]); await expect(opening).rejects.toThrow(/current work changed/); });
  expect(result.current.active?.record.id).toBe(original.id);
  expect(result.current.active?.content.instructions).toBe("New words while waiting");
  expect(result.current.conversation?.id).toBe(conversation.id);
});

it("rejects a foreign past-conversation draft without requesting its private history", async () => {
  const { result } = await loaded();
  const foreign = CreationDraftSchema.parse({ ...original, ownerId: "foreign" });
  const calls = ports.api.listDrafts.mock.calls.length;
  await act(async () => { await expect(result.current.openConversationDraft(foreign)).rejects.toThrow(/unavailable/); });
  expect(ports.api.listDrafts).toHaveBeenCalledTimes(calls);
  expect(result.current.active?.record.ownerId).toBe("creator");
});

it.each([403, 503])("reports initial project load status %s for the host's route state", async status => {
  ports.api.getProject.mockRejectedValue(new WorkflowApiError("Project unavailable", status, undefined));
  const { result } = await loaded();
  expect(result.current.project).toBeUndefined();
  expect(result.current.loadFailureStatus).toBe(status);
});

it("keeps partial history failures inline after the owned project loads", async () => {
  ports.api.history.mockRejectedValue(new WorkflowApiError("Temporarily unavailable", 503, undefined));
  const { result } = await loaded();
  expect(result.current.project?.id).toBe(project.id);
  expect(result.current.loadFailureStatus).toBeUndefined();
  expect(result.current.resourceErrors).toEqual(expect.arrayContaining([expect.stringMatching(/History could not load/)]));
});

it("C01 opens a persisted editable empty request on Video with Auto, without preparing or dispatching media", async () => {
  vi.stubGlobal("crypto", webcrypto);
  ports.api.listDrafts.mockResolvedValue([]);
  const { result } = await loaded();
  expect(ports.api.createDraft.mock.calls[0]?.[3]).toMatchObject({ action: "make-video", settings: { profileId: "unselected" } });
  await waitFor(() => expect(result.current.active?.content).toMatchObject({ action: "make-video", instructions: "", inputs: [], settings: { profileId: "unselected", profileRevision: "unresolved", outputCount: 1 } }));
  expect(result.current.active?.record.id).toMatch(/^draft_initial_[a-f0-9]{64}$/);
  expect(ports.api.createDraft).toHaveBeenCalledTimes(1);
  expect(ports.api.prepare).not.toHaveBeenCalled(); expect(ports.api.submit).not.toHaveBeenCalled();
  const active = result.current.active;
  if (!active) throw new Error("Expected the initialized empty request");
  await act(async () => { result.current.edit({ ...active.content, instructions: "My first picture" }); });
  expect(result.current.active?.content.instructions).toBe("My first picture");
});

it("C01 reuses the same initial draft identity after a lost create response and a reload", async () => {
  vi.stubGlobal("crypto", webcrypto);
  ports.api.listDrafts.mockResolvedValue([]);
  ports.api.createDraft.mockRejectedValueOnce(new Error("Create response was lost"));
  const first = await loaded();
  expect(first.result.current.active).toBeUndefined();
  const firstId = ports.api.createDraft.mock.calls[0]?.[2];
  expect(firstId).toMatch(/^draft_initial_[a-f0-9]{64}$/);
  first.unmount();
  const next = await loaded();
  expect(ports.api.createDraft.mock.calls[1]?.[2]).toBe(firstId);
  expect(next.result.current.active?.record.id).toBe(firstId);
  expect(ports.api.submit).not.toHaveBeenCalled();
});

it.each(["trashed-project", "archived-conversation"])("C01 does not initialize %s", async state => {
  vi.stubGlobal("crypto", webcrypto);
  ports.api.listDrafts.mockResolvedValue([]);
  if (state === "trashed-project") ports.api.getProject.mockResolvedValue({ ...project, status: "trashed" });
  else ports.api.listConversations.mockResolvedValue([{ ...conversation, status: "archived" }]);
  const { result } = await loaded();
  expect(result.current.active).toBeUndefined();
  expect(ports.api.createDraft).not.toHaveBeenCalled();
});

it("C01 does not initialize after a failed history read or over existing accepted history", async () => {
  vi.stubGlobal("crypto", webcrypto);
  ports.api.listDrafts.mockResolvedValue([]);
  ports.api.history.mockRejectedValueOnce(new Error("History unavailable"));
  const first = await loaded();
  expect(ports.api.createDraft).not.toHaveBeenCalled();
  first.unmount();
  const request = accepted({ submissionId: "submission_existing", draftId: original.id, draftRevision: 1, reviewedHash: "a".repeat(64) });
  ports.api.history.mockResolvedValue([{ ...request, slots: request.slots.map(slot => ({ ...slot, outcome: "cancelled" })) }]);
  const next = await loaded();
  expect(next.result.current.active).toBeUndefined();
  expect(ports.api.createDraft).not.toHaveBeenCalled();
});

it("C01 ignores an old conversation's initialization response after another conversation opens", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const second = ConversationSchema.parse({ ...conversation, id: "conversation_second" });
  const secondDraft = CreationDraftSchema.parse({ ...original, id: "draft_second", conversationId: second.id, destination: { ...destination, conversationId: second.id } });
  ports.api.listConversations.mockResolvedValue([conversation, second]);
  ports.api.listDrafts.mockImplementation(async (_project: string, selected: string) => selected === second.id ? [secondDraft] : []);
  const create = deferred<CreationDraft>();
  ports.api.createDraft.mockReturnValueOnce(create.promise);
  const { result, rerender } = renderHook(({ selected }) => useProjectWorkspace("creator", project.id, selected), { initialProps: { selected: conversation.id } });
  await waitFor(() => expect(ports.api.createDraft).toHaveBeenCalledTimes(1));
  const createdId = ports.api.createDraft.mock.calls[0]?.[2];
  rerender({ selected: second.id });
  await waitFor(() => expect(result.current.active?.record.id).toBe(secondDraft.id));
  await act(async () => { create.resolve(CreationDraftSchema.parse({ ...original, id: createdId, instructions: "", action: "make-image" })); });
  expect(result.current.active?.record.id).toBe(secondDraft.id);
  expect(result.current.conversation?.id).toBe(second.id);
});

it("C01 never opens the former owner's empty draft after an account switch", async () => {
  vi.stubGlobal("crypto", webcrypto);
  ports.api.listDrafts.mockResolvedValue([]);
  const create = deferred<CreationDraft>(); ports.api.createDraft.mockReturnValueOnce(create.promise);
  const { result, rerender } = renderHook(({ owner }) => useProjectWorkspace(owner, project.id), { initialProps: { owner: "creator" } });
  await waitFor(() => expect(ports.api.createDraft).toHaveBeenCalledTimes(1));
  const createdId = ports.api.createDraft.mock.calls[0]?.[2];
  ports.api.getProject.mockResolvedValue({ ...project, ownerId: "other" });
  ports.api.listConversations.mockResolvedValue([{ ...conversation, ownerId: "other" }]);
  ports.api.listDrafts.mockResolvedValue([{ ...original, ownerId: "other" }]);
  rerender({ owner: "other" });
  await waitFor(() => expect(result.current.active?.record.ownerId).toBe("other"));
  await act(async () => { create.resolve(CreationDraftSchema.parse({ ...original, id: createdId, instructions: "" })); });
  expect(result.current.active?.record.ownerId).toBe("other");
  expect(result.current.active?.record.id).toBe(original.id);
});

it.each(["trashed-project", "archived-conversation", "submitted-draft"])("read-only %s cannot change local words or inputs through viewer actions", async state => {
  if (state === "trashed-project") ports.api.getProject.mockResolvedValue({ ...project, status: "trashed" });
  if (state === "archived-conversation") ports.api.listConversations.mockResolvedValue([{ ...conversation, status: "archived" }]);
  if (state === "submitted-draft") ports.api.listDrafts.mockResolvedValue([{ ...original, status: "submitted" }]);
  const { result } = await loaded();
  if (state === "submitted-draft") act(() => result.current.openDraft(CreationDraftSchema.parse({ ...original, status: "submitted" })));
  const before = result.current.active?.content;
  ports.device.save.mockClear();
  act(() => result.current.edit({ ...draftContent(original), instructions: "Should stay unchanged", inputs: [{ state: "resolved", role: "clip", versionId: VersionIdSchema.parse("version_unrelated") }] }));
  expect(result.current.active?.content).toEqual(before);
  expect(ports.device.save).not.toHaveBeenCalled();
  expect(ports.api.saveDraft).not.toHaveBeenCalled();
});

it("a library home reuses its newest unused conversation instead of reopening finished work", async () => {
  const finished = ConversationSchema.parse({ ...conversation, id: "conversation_finished", acceptanceSequence: 3, updatedAt: "2026-10-12T20:00:00.000Z" });
  const older = ConversationSchema.parse({ ...conversation, id: "conversation_older_unused", updatedAt: "2026-10-09T20:00:00.000Z" });
  ports.api.listConversations.mockResolvedValue([finished, older, conversation]);
  const { result } = renderHook(() => useProjectWorkspace("creator", project.id, undefined, undefined, { library: true }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.conversation?.id).toBe(conversation.id);
  expect(ports.api.createConversation).not.toHaveBeenCalled();
});

it("a library home starts a new conversation when every existing one has work", async () => {
  const finished = ConversationSchema.parse({ ...conversation, id: "conversation_finished", acceptanceSequence: 1 });
  const fresh = ConversationSchema.parse({ ...conversation, id: "conversation_fresh" });
  ports.api.listConversations.mockResolvedValue([finished]);
  ports.api.createConversation.mockResolvedValue(fresh);
  ports.api.listDrafts.mockResolvedValue([]);
  const { result } = renderHook(() => useProjectWorkspace("creator", project.id, undefined, undefined, { library: true }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(ports.api.createConversation).toHaveBeenCalledWith(project.id, expect.stringMatching(/^conversation_/), "New conversation", undefined);
  expect(result.current.conversation?.id).toBe(fresh.id);
  expect(result.current.conversations.map(row => row.id)).toEqual([finished.id, fresh.id]);
});

it("a library home rejects a created conversation that belongs to another account", async () => {
  ports.api.listConversations.mockResolvedValue([]);
  ports.api.createConversation.mockResolvedValue(ConversationSchema.parse({ ...conversation, id: "conversation_foreign", ownerId: "intruder" }));
  const { result } = renderHook(() => useProjectWorkspace("creator", project.id, undefined, undefined, { library: true }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.conversation).toBeUndefined();
  expect(result.current.error).toMatch(/does not belong/);
});

it("a project home in the library reuses or starts a conversation filed in that project only", async () => {
  const loose = ConversationSchema.parse({ ...conversation, id: "conversation_loose" });
  const filed = ConversationSchema.parse({ ...conversation, id: "conversation_filed", folderId: "folder_spring" });
  ports.api.listConversations.mockResolvedValue([loose, filed]);
  const reused = renderHook(() => useProjectWorkspace("creator", project.id, undefined, undefined, { library: true, folderId: "folder_spring" }));
  await waitFor(() => expect(reused.result.current.loading).toBe(false));
  expect(reused.result.current.conversation?.id).toBe(filed.id);
  reused.unmount();
  ports.api.listConversations.mockResolvedValue([loose]);
  ports.api.createConversation.mockResolvedValue(ConversationSchema.parse({ ...conversation, id: "conversation_new_filed", folderId: "folder_spring" }));
  const started = renderHook(() => useProjectWorkspace("creator", project.id, undefined, undefined, { library: true, folderId: "folder_spring" }));
  await waitFor(() => expect(started.result.current.loading).toBe(false));
  expect(ports.api.createConversation).toHaveBeenCalledWith(project.id, expect.stringMatching(/^conversation_/), "New conversation", "folder_spring");
  expect(started.result.current.conversation?.id).toBe("conversation_new_filed");
});

it("switching outputs and back restores the request it left: the start frame keeps its role and the model stays", async () => {
  const video = CapabilityProfileSchema.parse({ ...profile, inputs: [{ role: "reference", kinds: ["image"], minCount: 0, maxCount: 4 }] });
  const animate = CapabilityProfileSchema.parse({ ...profile, id: "controlled-animate", label: "Animate", action: "animate-image", mode: "image-to-video", inputs: [{ role: "start-frame", kinds: ["image"], minCount: 1, maxCount: 1 }] });
  const music = CapabilityProfileSchema.parse({ ...profile, id: "controlled-music", label: "Music", action: "make-music", mode: "text-to-audio", output: { kind: "audio", maxCount: 1 }, inputs: [{ role: "reference", kinds: ["image"], minCount: 0, maxCount: 1 }] });
  const picture = MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "version_frame", ownerId: "creator", projectId: project.id, kind: "image", label: "Lantern", origin: { kind: "upload" }, sourceInputs: [], object: { identity: "unknown", assetId: "file", storagePath: "users/creator/previews/images/file.png" }, metadata: { state: "pending" }, association: "linked", createdAt: timestamp });
  ports.api.profiles.mockResolvedValue([video, animate, music]); ports.api.media.mockResolvedValue([picture]);
  const { result } = await loaded();
  await waitFor(() => expect(result.current.media).toHaveLength(1));
  const start = result.current.active;
  if (!start) throw new Error("No active draft");
  const setup = { ...start.content, action: "animate-image" as const, inputs: [{ state: "resolved" as const, role: "start-frame" as const, versionId: VersionIdSchema.parse(picture.id) }], settings: { profileId: animate.id, profileRevision: "1", parameters: {}, outputCount: 1 } };
  act(() => result.current.edit(setup));
  act(() => result.current.changeAction("make-music"));
  expect(result.current.active?.content.inputs).toEqual([{ state: "resolved", role: "reference", versionId: picture.id }]);
  act(() => result.current.changeAction("make-video"));
  expect(result.current.active?.content).toMatchObject({ action: "animate-image", inputs: [{ state: "resolved", role: "start-frame", versionId: picture.id }], settings: { profileId: animate.id } });
  expect(result.current.active?.content.instructions).toBe("Original direction");
});

it("a library home whose conversation is archived elsewhere moves to a working conversation instead of turning read only", async () => {
  const fresh = ConversationSchema.parse({ ...conversation, id: "conversation_fresh" });
  ports.api.listDrafts.mockResolvedValue([]);
  const { result } = renderHook(() => useProjectWorkspace("creator", project.id, undefined, undefined, { library: true }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.conversation?.id).toBe(conversation.id);
  const archived = ConversationSchema.parse({ ...conversation, revision: 2, status: "archived" });
  ports.api.listConversations.mockResolvedValue([archived]); ports.api.createConversation.mockResolvedValue(fresh);
  act(() => result.current.observeConversation(archived));
  await waitFor(() => expect(result.current.conversation?.id).toBe(fresh.id));
  expect(result.current.conversation?.status).toBe("active");
});

it("a running request's status reads do not re-read the whole media list until a result lands", async () => {
  const running = AcceptedRequestSchema.parse({ ...accepted({ submissionId: "submission_running", draftId: original.id, draftRevision: 1, reviewedHash: "a".repeat(64) }), slots: [{ id: "slot_running", ordinal: 1, outcome: "running", delivery: "none", usage: { mode: "free", reserved: 0, settled: 0 } }] });
  ports.api.history.mockResolvedValue([running]); ports.api.requestStatus.mockResolvedValue(running);
  const { result } = await loaded();
  await waitFor(() => expect(ports.api.requestStatus).toHaveBeenCalled());
  await waitFor(() => expect(result.current.view.requests[0]?.slots[0]?.outcome).toBe("running"));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
  expect(ports.api.media).toHaveBeenCalledTimes(1);
});
