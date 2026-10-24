import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowApi, WorkflowApiError } from "../api/workflowApi";
import { CreationDraftSchema, DraftContentSchema } from "@shared/schemas/workflow/draft.schemas";
import { MediaVersionSchema } from "@shared/schemas/workflow/media.schemas";
import { ImportCommandSchema, ImportRecordSchema } from "@shared/schemas/workflow/import.schemas";
import { SubmissionCommandSchema } from "@shared/schemas/workflow/request.schemas";
import { runner, veo } from "./fixtures/modelCreationFixtures";

const auth = vi.hoisted(() => ({ ownerId: "creator" }));
vi.mock("@/repositories/index", () => ({ getAuthRepository: () => ({ getCurrentUser: () => ({ uid: auth.ownerId }) }) }));
vi.mock("@/services/http/firebaseAuth", () => ({ buildFirebaseAuthHeaders: vi.fn(async () => ({})) }));

const at = "2026-10-10T20:00:00.000Z";
const project = {
  schemaVersion: "vidra-workflow/v2", id: "project_expected", ownerId: "creator", revision: 1,
  name: "Private project", status: "active", sharingEpoch: 0, instructions: { revision: 1, text: "" },
  origin: { kind: "new" }, createdAt: at, updatedAt: at,
};
const conversation = {
  schemaVersion: "vidra-workflow/v2", id: "conversation_expected", projectId: project.id, ownerId: "creator", revision: 1,
  name: "Ideas", status: "active", acceptanceSequence: 0, initialContext: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 },
  createdAt: at, updatedAt: at,
};
const content = DraftContentSchema.parse({
  action: "make-image", instructions: "A private blue lamp", inputs: [],
  settings: { profileId: "image", profileRevision: "1", parameters: {}, outputCount: 1 },
  context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 },
  destination: { projectId: project.id, conversationId: conversation.id },
});
const draft = CreationDraftSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "draft_expected", ownerId: "creator", projectId: project.id, conversationId: conversation.id, revision: 2, status: "open", ...content, createdAt: at, updatedAt: at });
const retained = { id: `conflict_${"c".repeat(64)}`, draftId: draft.id, ownerId: "creator", expectedRevision: 1, content: { ...content, instructions: "Words typed on another device" }, createdAt: at };
const snapshot = { action: "ask", instructions: "Explain this exact picture", inputs: [], settings: { profileId: "model", profileRevision: "1", parameters: {}, outputCount: 1 }, context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 }, destination: { projectId: project.id, conversationId: conversation.id } };
const accepted = { schemaVersion: "vidra-workflow/v2", id: "request_expected", ownerId: "creator", projectId: project.id, conversationId: conversation.id, submissionId: "submission_expected", executionDraftId: "draft_expected", executionDraftRevision: 1, acceptanceSequence: 1, snapshotHash: "a".repeat(64), snapshot, materializedContext: { projectInstructions: "", entries: [] }, slots: [{ id: "slot_expected", ordinal: 1, outcome: "completed", delivery: "ready", text: "A durable answer", usage: { mode: "free", reserved: 0, settled: 0 } }], acceptedAt: at };
const command = SubmissionCommandSchema.parse({ submissionId: "submission_expected", draftId: "draft_expected", draftRevision: 1, reviewedHash: "a".repeat(64) });
const picture = MediaVersionSchema.parse({ ...runner, id: "version_upload", projectId: project.id });
const importCommand = ImportCommandSchema.parse({ id: "import_upload", filename: "lamp.png", contentType: "image/png", bytes: 2048, sha256: "d".repeat(64) });
const importRecord = ImportRecordSchema.parse({ ...importCommand, ownerId: "creator", projectId: project.id, storagePath: "users/creator/imports/lamp.png", state: "uploading", versionId: "version_upload", createdAt: at });

function success(data: unknown): Response { return new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "Content-Type": "application/json" } }); }
function failure(status: number, body: unknown): Response { return new Response(typeof body === "string" ? body : JSON.stringify(body), { status }); }
function setup(data: unknown): { api: WorkflowApi; rawRequest: ReturnType<typeof vi.fn> } {
  const rawRequest = vi.fn(async (_path: string, _options?: unknown) => success(data));
  return { api: new WorkflowApi({ rawRequest }, "creator"), rawRequest };
}

beforeEach(() => { auth.ownerId = "creator"; });

describe("WorkflowApi projects and conversations", () => {
  it("lists the creator's projects with the caller's abort signal and rejects a list containing another creator's project", async () => {
    const { api, rawRequest } = setup([project]);
    const abort = new AbortController();
    expect((await api.listProjects(abort.signal)).map(item => item.id)).toEqual([project.id]);
    expect(rawRequest).toHaveBeenCalledWith("/projects?page=true", { method: "GET", signal: abort.signal });
    rawRequest.mockResolvedValueOnce(success([project, { ...project, id: "project_foreign", ownerId: "other-creator" }]));
    await expect(api.listProjects()).rejects.toThrow("does not match the requested account");
  });

  it("sends the validated project change and rejects an invalid expected revision before sending", async () => {
    const { api, rawRequest } = setup({ ...project, revision: 2, name: "Renamed" });
    expect((await api.changeProject(project.id, { expectedRevision: 1, name: "  Renamed  " })).name).toBe("Renamed");
    expect(rawRequest).toHaveBeenCalledWith("/projects/project_expected", { method: "PATCH", body: { expectedRevision: 1, name: "Renamed" } });
    await expect(api.changeProject(project.id, { expectedRevision: 0, status: "trashed" })).rejects.toThrow();
    expect(rawRequest).toHaveBeenCalledTimes(1);
  });

  it("creates a conversation with its captured id and rejects an acknowledgement for a different conversation", async () => {
    const { api, rawRequest } = setup(conversation);
    expect((await api.createConversation(project.id, conversation.id, "Ideas")).id).toBe(conversation.id);
    expect(rawRequest).toHaveBeenCalledWith("/projects/project_expected/conversations", { method: "POST", body: { id: conversation.id, name: "Ideas" } });
    rawRequest.mockResolvedValueOnce(success({ ...conversation, id: "conversation_other" }));
    await expect(api.createConversation(project.id, conversation.id, "Ideas")).rejects.toThrow();
  });
});

describe("WorkflowApi drafts", () => {
  it("creates a draft only for its own conversation destination", async () => {
    const { api, rawRequest } = setup(draft);
    expect((await api.createDraft(project.id, conversation.id, draft.id, content)).id).toBe(draft.id);
    expect(rawRequest).toHaveBeenCalledWith("/projects/project_expected/conversations/conversation_expected/drafts", { method: "POST", body: { id: draft.id, content } });
    await expect(api.createDraft(project.id, "conversation_other", draft.id, content)).rejects.toThrow("destination does not match");
    expect(rawRequest).toHaveBeenCalledTimes(1);
  });

  it("returns a saved draft, or the current draft with the retained words on a revision conflict", async () => {
    const { api, rawRequest } = setup({ state: "saved", draft });
    expect(await api.saveDraft(project.id, draft.id, 1, content)).toEqual({ state: "saved", draft });
    expect(rawRequest).toHaveBeenCalledWith("/projects/project_expected/drafts/draft_expected", { method: "PATCH", body: { expectedRevision: 1, content } });
    rawRequest.mockResolvedValueOnce(success({ state: "conflict", current: draft, retained }));
    const conflict = await api.saveDraft(project.id, draft.id, 1, content);
    expect(conflict.state === "conflict" && conflict.retained.content.instructions).toBe("Words typed on another device");
  });

  it("rejects save responses for another draft, conversation or owner, and a destination outside this project", async () => {
    const { api, rawRequest } = setup({ state: "saved", draft: { ...draft, conversationId: "conversation_other" } });
    await expect(api.saveDraft(project.id, draft.id, 1, content)).rejects.toThrow("does not match this account or destination");
    rawRequest.mockResolvedValueOnce(success({ state: "conflict", current: draft, retained: { ...retained, ownerId: "other-creator" } }));
    await expect(api.saveDraft(project.id, draft.id, 1, content)).rejects.toThrow();
    rawRequest.mockResolvedValueOnce(success({ state: "conflict", current: draft, retained: { ...retained, draftId: "draft_other" } }));
    await expect(api.saveDraft(project.id, draft.id, 1, content)).rejects.toThrow();
    const calls = rawRequest.mock.calls.length;
    await expect(api.saveDraft("project_other", draft.id, 1, content)).rejects.toThrow("destination does not match this project");
    expect(rawRequest).toHaveBeenCalledTimes(calls);
  });

  it("posts draft status and restore commands and rejects a record for another draft", async () => {
    const { api, rawRequest } = setup({ ...draft, status: "parked", revision: 3 });
    expect((await api.draftStatus(project.id, draft.id, 2, "parked")).status).toBe("parked");
    expect(rawRequest).toHaveBeenCalledWith("/projects/project_expected/drafts/draft_expected/status", { method: "POST", body: { expectedRevision: 2, status: "parked" } });
    rawRequest.mockResolvedValueOnce(success({ ...draft, revision: 3 }));
    expect((await api.restoreDraft(project.id, draft.id, 2, 1)).revision).toBe(3);
    expect(rawRequest).toHaveBeenLastCalledWith("/projects/project_expected/drafts/draft_expected/restore", { method: "POST", body: { expectedRevision: 2, sourceRevision: 1 } });
    rawRequest.mockResolvedValueOnce(success({ ...draft, id: "draft_other" }));
    await expect(api.restoreDraft(project.id, draft.id, 2, 1)).rejects.toThrow();
  });
});

describe("WorkflowApi creation requests", () => {
  it("reads capability profiles and rejects a malformed profile", async () => {
    const { api, rawRequest } = setup([veo]);
    expect((await api.profiles()).map(profile => profile.id)).toEqual([veo.id]);
    expect(rawRequest).toHaveBeenCalledWith("/workflow/profiles", { method: "GET" });
    rawRequest.mockResolvedValueOnce(success([{ ...veo, pricing: undefined }]));
    await expect(api.profiles()).rejects.toThrow();
  });

  it("prepares the exact draft and rejects a preparation for another draft", async () => {
    const blocked = { state: "blocked", draftId: draft.id, draftRevision: 2, reasons: [{ code: "input_pending", message: "The start frame is still uploading." }] };
    const { api, rawRequest } = setup(blocked);
    expect(await api.prepare(project.id, draft.id)).toEqual(blocked);
    expect(rawRequest).toHaveBeenCalledWith("/creation-requests/prepare", { method: "POST", body: { projectId: project.id, draftId: draft.id } });
    rawRequest.mockResolvedValueOnce(success({ ...blocked, draftId: "draft_other" }));
    await expect(api.prepare(project.id, draft.id)).rejects.toThrow("different destination");
  });

  it("submits the captured command and rejects a receipt that differs from the reviewed snapshot", async () => {
    const { api, rawRequest } = setup(accepted);
    expect((await api.submit(project.id, command)).id).toBe(accepted.id);
    expect(rawRequest).toHaveBeenCalledWith("/creation-requests", { method: "POST", body: { projectId: project.id, ...command } });
    rawRequest.mockResolvedValueOnce(success({ ...accepted, snapshotHash: "b".repeat(64) }));
    await expect(api.submit(project.id, command)).rejects.toThrow("differs from the captured submission");
  });
});

describe("WorkflowApi media and imports", () => {
  it("lists media and imports for one project and rejects records from another project", async () => {
    const { api, rawRequest } = setup([picture]);
    expect((await api.media(project.id)).map(version => version.id)).toEqual([picture.id]);
    expect(rawRequest).toHaveBeenCalledWith("/projects/project_expected/media?page=true", { method: "GET" });
    rawRequest.mockResolvedValueOnce(success([importRecord]));
    expect((await api.imports(project.id)).map(record => record.id)).toEqual([importRecord.id]);
    expect(rawRequest).toHaveBeenLastCalledWith("/projects/project_expected/imports", { method: "GET" });
    rawRequest.mockResolvedValueOnce(success([{ ...picture, projectId: "project_other" }]));
    await expect(api.media(project.id)).rejects.toThrow();
    rawRequest.mockResolvedValueOnce(success([{ ...importRecord, projectId: "project_other" }]));
    await expect(api.imports(project.id)).rejects.toThrow();
  });

  it("accepts an upload grant only for the exact file bytes and account", async () => {
    const session = { record: importRecord, uploadUrl: "https://storage.example.test/upload", offset: 0 };
    const { api, rawRequest } = setup(session);
    expect(await api.beginImport(project.id, importCommand)).toEqual(session);
    expect(rawRequest).toHaveBeenCalledWith("/projects/project_expected/imports", { method: "POST", body: importCommand });
    rawRequest.mockResolvedValueOnce(success({ ...session, record: { ...importRecord, sha256: "e".repeat(64) } }));
    await expect(api.beginImport(project.id, importCommand)).rejects.toThrow("upload grant does not match");
    rawRequest.mockResolvedValueOnce(success({ ...session, record: { ...importRecord, ownerId: "other-creator" } }));
    await expect(api.beginImport(project.id, importCommand)).rejects.toThrow("upload grant does not match");
  });

  it("finishes an import into its derived version and rejects any other version", async () => {
    const { api, rawRequest } = setup(picture);
    expect((await api.finishImport(project.id, importRecord.id)).id).toBe("version_upload");
    expect(rawRequest).toHaveBeenCalledWith("/projects/project_expected/imports/import_upload/finish", { method: "POST", body: {} });
    rawRequest.mockResolvedValueOnce(success({ ...picture, id: "version_other" }));
    await expect(api.finishImport(project.id, importRecord.id)).rejects.toThrow();
  });

  it("cancels an import with or without its original command", async () => {
    const { api, rawRequest } = setup({ ...importRecord, state: "cancelled" });
    expect((await api.cancelImport(project.id, importRecord.id)).state).toBe("cancelled");
    expect(rawRequest).toHaveBeenCalledWith("/projects/project_expected/imports/import_upload/cancel", { method: "POST", body: {} });
    await api.cancelImport(project.id, importRecord.id, importCommand);
    expect(rawRequest).toHaveBeenLastCalledWith("/projects/project_expected/imports/import_upload/cancel", { method: "POST", body: importCommand });
  });

  it("hides media and copies it only into the requested target project", async () => {
    const { api, rawRequest } = setup({ ...picture, hidden: true });
    expect((await api.hideMedia(project.id, picture.id, true)).hidden).toBe(true);
    expect(rawRequest).toHaveBeenCalledWith("/projects/project_expected/media/version_upload", { method: "PATCH", body: { hidden: true } });
    const copied = { ...picture, id: "version_copy", projectId: "project_target", origin: { kind: "copy", versionId: picture.id, projectId: project.id } };
    rawRequest.mockResolvedValueOnce(success(copied));
    expect((await api.copyMedia(project.id, picture.id, "project_target", "version_copy")).projectId).toBe("project_target");
    expect(rawRequest).toHaveBeenLastCalledWith("/projects/project_expected/media/version_upload/copy", { method: "POST", body: { targetProjectId: "project_target", id: "version_copy" } });
    rawRequest.mockResolvedValueOnce(success({ ...copied, projectId: project.id }));
    await expect(api.copyMedia(project.id, picture.id, "project_target", "version_copy")).rejects.toThrow();
  });

  it("reads a media access URL and rejects a response without a valid URL", async () => {
    const { api, rawRequest } = setup({ url: "https://media.example.test/lamp.png", expiresAt: at });
    expect(await api.access(project.id, picture.id)).toEqual({ url: "https://media.example.test/lamp.png", expiresAt: at });
    expect(rawRequest).toHaveBeenCalledWith("/projects/project_expected/media/version_upload/access", { method: "GET" });
    rawRequest.mockResolvedValueOnce(success({ url: "not a url" }));
    await expect(api.access(project.id, picture.id)).rejects.toThrow();
  });
});

describe("WorkflowApi error mapping", () => {
  it("maps a structured server error to its message, status and code", async () => {
    const { api, rawRequest } = setup(draft);
    rawRequest.mockResolvedValueOnce(failure(409, { success: false, error: "This draft changed on another device.", code: "revision_conflict" }));
    const error: unknown = await api.draftStatus(project.id, draft.id, 1, "open").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(WorkflowApiError);
    expect(error).toMatchObject({ message: "This draft changed on another device.", status: 409, code: "revision_conflict" });
  });

  it("maps an unreadable failure body to an unconfirmed error without a code", async () => {
    const { api, rawRequest } = setup(draft);
    rawRequest.mockResolvedValueOnce(failure(502, "<html>Bad gateway</html>"));
    await expect(api.listProjects()).rejects.toMatchObject({ name: "OwnedRequestError", message: "The request was not confirmed (502).", status: 502, code: undefined });
  });

  it("rejects a confirmed response when the signed-in account changed while it loaded", async () => {
    const { api, rawRequest } = setup([picture]);
    rawRequest.mockImplementationOnce(async () => { auth.ownerId = "other-creator"; return success([picture]); });
    await expect(api.media(project.id)).rejects.toMatchObject({ status: 401, code: "AUTH_REQUIRED" });
  });
});
