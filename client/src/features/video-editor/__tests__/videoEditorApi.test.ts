import { afterEach, expect, it, vi } from "vitest";
import { VideoEditorApi } from "../api/videoEditorApi";
import { VideoCaptionValidationError } from "../api/VideoCaptionValidationError";
import { WorkflowApiError } from "@/features/project-workspace/api";
import { CreateVideoExportSchema, VideoCaptionValidationDetailsSchema } from "@shared/schemas/workflow/video-edit.schemas";
import { EMPTY_COMPOSITION } from "../state/editorState";

const auth = vi.hoisted(() => ({ uid: "creator", headers: vi.fn() }));
vi.mock("@/repositories/index", () => ({ getAuthRepository: () => ({ getCurrentUser: () => ({ uid: auth.uid }) }) }));
vi.mock("@/services/http/firebaseAuth", () => ({ buildFirebaseAuthHeaders: auth.headers }));
const edit = { schemaVersion: "vidra-workflow/v2", id: "edit_one", ownerId: "creator", projectId: "project_one", name: "Video edit", revision: 1, composition: EMPTY_COMPOSITION, issues: [], createdAt: "2026-10-17T05:00:00.000Z", updatedAt: "2026-10-17T05:00:00.000Z" };
function success(data: unknown): Response { return new Response(JSON.stringify({ success: true, data }), { status: 200 }); }
afterEach(() => { auth.uid = "creator"; vi.unstubAllGlobals(); });

it("rejects another owner's valid edit and edits returned from a different project", async () => {
  const client = { rawRequest: vi.fn(async () => success({ ...edit, ownerId: "other" })) }; const api = new VideoEditorApi("creator", "project_one", client);
  await expect(api.get("edit_one")).rejects.toThrow("different work");
  client.rawRequest.mockResolvedValueOnce(success([{ ...edit, projectId: "project_other" }]));
  await expect(api.list()).rejects.toThrow();
});
it("rejects malformed editing commands before sending user data", async () => {
  const client = { rawRequest: vi.fn(async () => success(edit)) }; const api = new VideoEditorApi("creator", "project_one", client);
  await expect(api.command("edit_one", 1, "operation_one", { kind: "trim", itemId: "item_one", inFrame: -30, outFrame: 90 })).rejects.toThrow();
  expect(client.rawRequest).not.toHaveBeenCalled();
});
it("does not resend an unconfirmed export after authentication fails", async () => {
  const client = { rawRequest: vi.fn(async () => new Response(JSON.stringify({ success: false, error: "Sign in again", code: "AUTH_REQUIRED" }), { status: 401 })) };
  await expect(new VideoEditorApi("creator", "project_one", client).list()).rejects.toMatchObject({ status: 401 });
  expect(client.rawRequest).toHaveBeenCalledTimes(1);
});
it("blocks all protected editor calls if the signed-in account has changed", async () => {
  auth.uid = "different-account"; const fetch = vi.fn(async () => success(edit)); vi.stubGlobal("fetch", fetch);
  await expect(new VideoEditorApi("creator", "project_one").get("edit_one")).rejects.toMatchObject({ status: 401 });
  expect(fetch).not.toHaveBeenCalled();
});

const exportEnvelope = CreateVideoExportSchema.parse({ submissionId: "submission_one", executionDraftId: "draft_one", executionDraftRevision: 1, revision: 1, preset: "landscape" });
const captionDetails = VideoCaptionValidationDetailsSchema.parse({ kind: "video-caption-validation", ownerId: "creator", projectId: "project_one", editId: "edit_one", revision: 1, issues: [{ elementId: "text_one", code: "text_render_policy", message: "This caption contains characters unavailable in the export font.", unsupportedCodePoints: [0x1f680] }] });
function captionFailure(details: unknown = captionDetails, status = 422, code = "invalid_settings"): Response { return new Response(JSON.stringify({ success: false, error: "Edit the identified caption before exporting.", code, details: JSON.stringify(details) }), { status }); }

it("parses a caption policy rejection only for its exact export edit and revision", async () => {
  const client = { rawRequest: vi.fn(async (_path: string) => captionFailure()) }; const api = new VideoEditorApi("creator", "project_one", client);
  const result = api.startExport("edit_one", exportEnvelope);
  await expect(result).rejects.toBeInstanceOf(VideoCaptionValidationError); await expect(result).rejects.toMatchObject({ status: 422, code: "invalid_settings", details: captionDetails });
  expect(client.rawRequest).toHaveBeenCalledTimes(1); expect(client.rawRequest.mock.calls[0]?.[0]).toBe("/projects/project_one/video-edits/edit_one/exports");
});

it.each(["ownerId", "projectId", "editId", "revision"] as const)("ignores foreign caption validation %s details", async field => {
  const details = { ...captionDetails, [field]: field === "revision" ? 2 : field === "ownerId" ? "other_creator" : field === "projectId" ? "project_other" : "edit_other" };
  const api = new VideoEditorApi("creator", "project_one", { rawRequest: vi.fn(async () => captionFailure(details)) });
  const failure: unknown = await api.startExport("edit_one", exportEnvelope).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(WorkflowApiError); expect(failure).not.toBeInstanceOf(VideoCaptionValidationError); expect(failure).toMatchObject({ status: 422, code: "invalid_settings", message: "Edit the identified caption before exporting." }); expect(failure).not.toHaveProperty("details");
});

const malformedCaptionDetails = [
  { name: "non-object", details: "This caption needs another font" },
  { name: "empty issues", details: { ...captionDetails, issues: [] } },
  { name: "wrong kind", details: { ...captionDetails, kind: "another-validation" } },
  { name: "wrong issue code", details: { ...captionDetails, issues: [{ ...captionDetails.issues[0], code: "source_unavailable" }] } },
  { name: "missing revision", details: { kind: captionDetails.kind, ownerId: captionDetails.ownerId, projectId: captionDetails.projectId, editId: captionDetails.editId, issues: captionDetails.issues } },
  { name: "out-of-range codepoint", details: { ...captionDetails, issues: [{ ...captionDetails.issues[0], unsupportedCodePoints: [0x110000] }] } },
  { name: "string codepoint", details: { ...captionDetails, issues: [{ ...captionDetails.issues[0], unsupportedCodePoints: ["U+1F680"] }] } },
];
it.each(malformedCaptionDetails)("keeps malformed $name caption details out of the typed error", async ({ details }) => {
  const api = new VideoEditorApi("creator", "project_one", { rawRequest: vi.fn(async () => captionFailure(details)) }); const failure: unknown = await api.startExport("edit_one", exportEnvelope).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(WorkflowApiError); expect(failure).not.toBeInstanceOf(VideoCaptionValidationError); expect(failure).toMatchObject({ status: 422, code: "invalid_settings" }); expect(failure).not.toHaveProperty("details");
});

it.each([400, 409, 500])("does not interpret HTTP %s as a definitive caption policy rejection", async status => {
  const api = new VideoEditorApi("creator", "project_one", { rawRequest: vi.fn(async () => captionFailure(captionDetails, status)) });
  const failure: unknown = await api.startExport("edit_one", exportEnvelope).catch((error: unknown) => error); expect(failure).toBeInstanceOf(WorkflowApiError); expect(failure).not.toBeInstanceOf(VideoCaptionValidationError); expect(failure).toMatchObject({ status });
});
it("does not accept caption details on another route or with a different error code", async () => {
  const client = { rawRequest: vi.fn(async () => captionFailure()) }; const api = new VideoEditorApi("creator", "project_one", client);
  const otherRoute: unknown = await api.get("edit_one").catch((error: unknown) => error); expect(otherRoute).toBeInstanceOf(WorkflowApiError); expect(otherRoute).not.toBeInstanceOf(VideoCaptionValidationError);
  client.rawRequest.mockResolvedValueOnce(captionFailure(captionDetails, 422, "AUTH_REQUIRED"));
  const otherCode: unknown = await api.startExport("edit_one", exportEnvelope).catch((error: unknown) => error); expect(otherCode).toBeInstanceOf(WorkflowApiError); expect(otherCode).not.toBeInstanceOf(VideoCaptionValidationError);
});
it("does not interpret malformed JSON or a noncanonical object details field as a policy response", async () => {
  const client = { rawRequest: vi.fn(async () => new Response(JSON.stringify({ error: "Caption validation is unavailable.", code: "invalid_settings", details: "{not valid JSON" }), { status: 422 })) }; const api = new VideoEditorApi("creator", "project_one", client);
  const malformed: unknown = await api.startExport("edit_one", exportEnvelope).catch((error: unknown) => error); expect(malformed).toBeInstanceOf(WorkflowApiError); expect(malformed).not.toBeInstanceOf(VideoCaptionValidationError); expect(malformed).toMatchObject({ status: 422, code: "invalid_settings" });
  client.rawRequest.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Wrong details format", code: "invalid_settings", details: captionDetails }), { status: 422 }));
  const noncanonical: unknown = await api.startExport("edit_one", exportEnvelope).catch((error: unknown) => error); expect(noncanonical).toBeInstanceOf(WorkflowApiError); expect(noncanonical).not.toBeInstanceOf(VideoCaptionValidationError); expect(noncanonical).not.toHaveProperty("details");
});

const videoExport = { schemaVersion: "vidra-workflow/v2", id: "export_one", ownerId: "creator", projectId: "project_one", editId: "edit_one", revision: 1, submissionId: "submission_one", executionDraftId: "draft_one", executionDraftRevision: 1, composition: EMPTY_COMPOSITION, compositionHash: "a".repeat(64), sources: [], renderer: "native/v1", attemptId: "attempt_one", state: "rendering", progress: 0.5, createdAt: edit.createdAt, updatedAt: edit.updatedAt };

it("creates an edit and reads its revisions under the project path, rejecting another edit's revision", async () => {
  const client = { rawRequest: vi.fn(async (_path: string, _options?: unknown) => success(edit)) }; const api = new VideoEditorApi("creator", "project_one", client);
  expect((await api.create("edit_one", EMPTY_COMPOSITION)).id).toBe("edit_one");
  expect(client.rawRequest).toHaveBeenCalledWith("/projects/project_one/video-edits", { method: "POST", body: { id: "edit_one", name: "Video edit", composition: EMPTY_COMPOSITION } });
  client.rawRequest.mockResolvedValueOnce(success([edit, { ...edit, revision: 2 }]));
  expect((await api.revisions("edit_one")).map(revision => revision.revision)).toEqual([1, 2]);
  expect(client.rawRequest).toHaveBeenLastCalledWith("/projects/project_one/video-edits/edit_one/revisions", { method: "GET" });
  client.rawRequest.mockResolvedValueOnce(success([{ ...edit, id: "edit_other" }]));
  await expect(api.revisions("edit_one")).rejects.toThrow("different work");
});
it("lists, reads, resumes and cancels exports only for this owner and the requested export", async () => {
  const client = { rawRequest: vi.fn(async (_path: string, _options?: unknown) => success([videoExport])) }; const api = new VideoEditorApi("creator", "project_one", client);
  expect((await api.exports()).map(item => item.id)).toEqual(["export_one"]);
  expect(client.rawRequest).toHaveBeenLastCalledWith("/projects/project_one/exports", { method: "GET" });
  client.rawRequest.mockResolvedValueOnce(success(videoExport));
  expect((await api.export("export_one")).state).toBe("rendering");
  expect(client.rawRequest).toHaveBeenLastCalledWith("/projects/project_one/exports/export_one", { method: "GET" });
  client.rawRequest.mockResolvedValueOnce(success({ ...videoExport, state: "queued" }));
  expect((await api.resume("export_one")).state).toBe("queued");
  expect(client.rawRequest).toHaveBeenLastCalledWith("/projects/project_one/exports/export_one/resume", { method: "POST", body: {} });
  client.rawRequest.mockResolvedValueOnce(success({ ...videoExport, state: "cancel_requested" }));
  expect((await api.cancel("export_one")).state).toBe("cancel_requested");
  expect(client.rawRequest).toHaveBeenLastCalledWith("/projects/project_one/exports/export_one/cancel", { method: "POST", body: {} });
  client.rawRequest.mockResolvedValueOnce(success({ ...videoExport, id: "export_other" }));
  await expect(api.export("export_one")).rejects.toThrow("different work");
  client.rawRequest.mockResolvedValueOnce(success([{ ...videoExport, ownerId: "other" }]));
  await expect(api.exports()).rejects.toThrow("different work");
});
it("rejects a malformed export id before sending", async () => {
  const client = { rawRequest: vi.fn(async () => success(videoExport)) }; const api = new VideoEditorApi("creator", "project_one", client);
  expect(() => api.cancel("../edit_one")).toThrow();
  expect(client.rawRequest).not.toHaveBeenCalled();
});
it("accepts export access only on an authorized URL", async () => {
  const client = { rawRequest: vi.fn(async (_path: string, _options?: unknown) => success({ url: "https://media.example.test/export.mp4", expiresAt: edit.updatedAt })) }; const api = new VideoEditorApi("creator", "project_one", client);
  expect((await api.access("export_one")).url).toBe("https://media.example.test/export.mp4");
  expect(client.rawRequest).toHaveBeenLastCalledWith("/projects/project_one/exports/export_one/access", { method: "GET" });
  client.rawRequest.mockResolvedValueOnce(success({ url: "http://media.example.test/export.mp4", expiresAt: edit.updatedAt }));
  await expect(api.access("export_one")).rejects.toThrow("authorized URL");
});
it("reads a 30 fps editor preview for a source version and rejects other frame rates", async () => {
  const preview = { url: "http://localhost:3001/api/preview/clip.mp4", expiresAt: edit.updatedAt, frames: 240, width: 1920, height: 1080, framesPerSecond: 30, audio: "present" };
  const client = { rawRequest: vi.fn(async (_path: string, _options?: unknown) => success(preview)) }; const api = new VideoEditorApi("creator", "project_one", client);
  expect(await api.preview("version_clip")).toEqual(preview);
  expect(client.rawRequest).toHaveBeenLastCalledWith("/projects/project_one/media/version_clip/editor-preview", { method: "GET" });
  client.rawRequest.mockResolvedValueOnce(success({ ...preview, framesPerSecond: 24 }));
  await expect(api.preview("version_clip")).rejects.toThrow();
});
it("maps an unreadable export failure to an unconfirmed error without a code", async () => {
  const api = new VideoEditorApi("creator", "project_one", { rawRequest: vi.fn(async () => new Response("gateway down", { status: 503 })) });
  await expect(api.resume("export_one")).rejects.toMatchObject({ name: "OwnedRequestError", message: "The request was not confirmed (503).", status: 503, code: undefined });
});
