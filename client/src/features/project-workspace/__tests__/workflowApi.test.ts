import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkflowApi } from "../api/workflowApi";

const auth = vi.hoisted(() => ({ ownerId: "creator", headers: vi.fn() }));
vi.mock("@/repositories/index", () => ({ getAuthRepository: () => ({ getCurrentUser: () => ({ uid: auth.ownerId }) }) }));
vi.mock("@/services/http/firebaseAuth", () => ({ buildFirebaseAuthHeaders: auth.headers }));

const project = {
  schemaVersion: "vidra-workflow/v2", id: "project_expected", ownerId: "creator", revision: 1,
  name: "Private project", status: "active", sharingEpoch: 0, instructions: { revision: 1, text: "" },
  origin: { kind: "new" }, createdAt: "2026-10-10T20:00:00.000Z", updatedAt: "2026-10-10T20:00:00.000Z",
};
function success(data: unknown): Response { return new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "Content-Type": "application/json" } }); }
function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve = (_value: T): void => { throw new Error("Deferred result was not initialized"); };
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const phrase = { draftId: "draft_expected", sequence: 2, contextKey: "captured-settings", sourceText: "A private blue lamp", start: 10, end: 14, text: "blue" };
const conversation = {
  schemaVersion: "vidra-workflow/v2", id: "conversation_expected", projectId: "project_expected", ownerId: "creator", revision: 1,
  name: "Ideas", status: "active", acceptanceSequence: 0, initialContext: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 },
  createdAt: "2026-10-10T20:00:00.000Z", updatedAt: "2026-10-10T20:00:00.000Z",
};

beforeEach(() => { auth.ownerId = "creator"; auth.headers.mockReset(); auth.headers.mockResolvedValue({ "X-Firebase-Token": "controlled-token" }); });
afterEach(() => { vi.unstubAllGlobals(); });

it("rejects valid project payloads returned for another creator or identity", async () => {
  const client = { rawRequest: vi.fn(async () => success({ ...project, ownerId: "other-creator" })) };
  const api = new WorkflowApi(client, "creator");
  await expect(api.getProject("project_expected")).rejects.toThrow();
  client.rawRequest.mockResolvedValueOnce(success({ ...project, id: "project_other" }));
  await expect(api.getProject("project_expected")).rejects.toThrow();
});

it("rejects conversation responses from a different project", async () => {
  const client = { rawRequest: vi.fn(async () => success([{ ...conversation, projectId: "project_other" }])) };
  await expect(new WorkflowApi(client, "creator").listConversations("project_expected")).rejects.toThrow();
});

it("reads conversation listings with or without media counts and rejects malformed counts", async () => {
  const client = { rawRequest: vi.fn(async () => success([{ ...conversation, media: { pictures: 3, clips: 4 } }])) };
  const api = new WorkflowApi(client, "creator");
  expect((await api.listConversations("project_expected"))[0]?.media).toEqual({ pictures: 3, clips: 4 });
  client.rawRequest.mockResolvedValueOnce(success([conversation]));
  expect((await api.listConversations("project_expected"))[0]?.media).toBeUndefined();
  client.rawRequest.mockResolvedValueOnce(success([{ ...conversation, media: { pictures: 1.5, clips: 0 } }]));
  await expect(api.listConversations("project_expected")).rejects.toThrow();
});

it("rejects malformed project commands before sending private work", async () => {
  const client = { rawRequest: vi.fn(async () => success(project)) };
  await expect(new WorkflowApi(client, "creator").createProject("project_expected", "   ")).rejects.toThrow();
  expect(client.rawRequest).not.toHaveBeenCalled();
});

it("does not send captured suggestions after the account changes during authentication", async () => {
  const pendingAuth = deferred<Record<string, string>>();
  auth.headers.mockReturnValueOnce(pendingAuth.promise);
  const fetch = vi.fn(async () => success({ suggestions: ["amber"] }));
  vi.stubGlobal("fetch", fetch);
  const result = new WorkflowApi(undefined, "creator").phraseSuggestions(phrase);
  await vi.waitFor(() => expect(auth.headers).toHaveBeenCalledTimes(1));
  auth.ownerId = "other-creator";
  pendingAuth.resolve({ "X-Firebase-Token": "other-controlled-token" });
  await expect(result).rejects.toMatchObject({ status: 401, code: "AUTH_REQUIRED" });
  expect(fetch).not.toHaveBeenCalled();
});

const snapshot = { action: "ask", instructions: "Explain this exact picture", inputs: [], settings: { profileId: "model", profileRevision: "1", parameters: {}, outputCount: 1 }, context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 }, destination: { projectId: project.id, conversationId: conversation.id } };
const request = { schemaVersion: "vidra-workflow/v2", id: "request_expected", ownerId: "creator", projectId: project.id, conversationId: conversation.id, submissionId: "submission_expected", executionDraftId: "draft_expected", executionDraftRevision: 1, acceptanceSequence: 1, snapshotHash: "a".repeat(64), snapshot, materializedContext: { projectInstructions: "", entries: [] }, slots: [{ id: "slot_expected", ordinal: 1, outcome: "completed", delivery: "ready", text: "A durable answer", usage: { mode: "free", reserved: 0, settled: 0 } }], acceptedAt: project.createdAt };

it("validates status, stop and reconciliation responses against exact owner, project and request identity", async () => {
  const client = { rawRequest: vi.fn(async () => success(request)) };
  const api = new WorkflowApi(client, "creator");
  expect((await api.requestStatus(project.id, request.id)).slots[0]?.text).toBe("A durable answer");
  await api.cancelRequest(project.id, request.id);
  await api.reconcileRequest(project.id, request.id);
  expect(client.rawRequest).toHaveBeenCalledWith("/creation-requests/request_expected/cancel", expect.objectContaining({ method: "POST", body: {} }));
  expect(client.rawRequest).toHaveBeenCalledWith("/creation-requests/request_expected/reconcile", expect.objectContaining({ method: "POST", body: {} }));
  for (const changed of [{ ...request, ownerId: "foreign" }, { ...request, id: "request_foreign" }, { ...request, projectId: "project_foreign", snapshot: { ...snapshot, destination: { ...snapshot.destination, projectId: "project_foreign" } } }]) {
    client.rawRequest.mockResolvedValueOnce(success(changed));
    await expect(api.requestStatus(project.id, request.id)).rejects.toThrow();
  }
});

it("rejects foreign draft/history records and a receipt for a different submission", async () => {
  const client = { rawRequest: vi.fn(async () => success([{ ...request, ownerId: "foreign" }])) };
  const api = new WorkflowApi(client, "creator");
  await expect(api.history(project.id, conversation.id)).rejects.toThrow();
  client.rawRequest.mockResolvedValueOnce(success({ ...request, submissionId: "submission_foreign" }));
  await expect(api.recover("submission_expected")).rejects.toThrow();
  client.rawRequest.mockResolvedValueOnce(success([{ schemaVersion: "vidra-workflow/v2", id: "draft_expected", ownerId: "foreign", projectId: project.id, conversationId: conversation.id, revision: 1, status: "open", ...snapshot, createdAt: project.createdAt, updatedAt: project.updatedAt }]));
  await expect(api.listDrafts(project.id, conversation.id)).rejects.toThrow();
});

it("reads exports saved before edits were named \"edit N\" under the current name, leaving other labels alone", async () => {
  const { currentExportLabel } = await import("../api/workflowApi");
  const { MediaVersionSchema } = await import("@shared/schemas/workflow/media.schemas");
  const base = { schemaVersion: "vidra-workflow/v2", id: "version_export", ownerId: "owner", projectId: "project_one", kind: "export", label: "Video · revision 6", origin: { kind: "upload" }, sourceInputs: [], object: { identity: "unknown", assetId: "export", storagePath: "users/owner/exports/export.mp4" }, metadata: { state: "pending" }, association: "linked", createdAt: "2026-10-17T00:00:00.000Z" };
  expect(currentExportLabel(MediaVersionSchema.parse(base)).label).toBe("Video · edit 6");
  expect(currentExportLabel(MediaVersionSchema.parse({ ...base, label: "Launch cut" })).label).toBe("Launch cut");
  expect(currentExportLabel(MediaVersionSchema.parse({ ...base, kind: "image", label: "Video · revision 6" })).label).toBe("Video · revision 6");
});

it("follows every library page and rejects a repeated continuation instead of silently truncating", async () => {
  const rawRequest = vi.fn().mockResolvedValueOnce(success({ items: [project], nextCursor: "next-page" })).mockResolvedValueOnce(success({ items: [{ ...project, id: "project_later" }] }));
  expect((await new WorkflowApi({ rawRequest }, "creator").listProjects()).map(row => row.id)).toEqual(["project_expected", "project_later"]);
  expect(rawRequest).toHaveBeenLastCalledWith("/projects?page=true&cursor=next-page", { method: "GET" });
  rawRequest.mockImplementation(async () => success({ items: [], nextCursor: "repeated" }));
  await expect(new WorkflowApi({ rawRequest }, "creator").listProjects()).rejects.toThrow("repeated list cursor");
});
