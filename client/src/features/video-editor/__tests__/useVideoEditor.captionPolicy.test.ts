import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { CreateVideoExportSchema, VideoCaptionValidationDetailsSchema, VideoEditSchema, VideoExportSchema, type VideoCaptionValidationDetails, type VideoEdit, type VideoExport } from "@shared/schemas/workflow/video-edit.schemas";
import { VideoCaptionValidationError } from "../api/VideoCaptionValidationError";
import { WorkflowApiError } from "@/features/project-workspace/api";
import { useVideoEditor } from "../hooks/useVideoEditor";
import type { ExportEnvelope } from "../api/videoEditorApi";

const methods = vi.hoisted(() => ({ list: vi.fn(), exports: vi.fn(), get: vi.fn(), create: vi.fn(), command: vi.fn(), startExport: vi.fn(), export: vi.fn(), revisions: vi.fn(), cancel: vi.fn() }));
vi.mock("../api/videoEditorApi", () => ({ VideoEditorApi: class { list = methods.list; exports = methods.exports; get = methods.get; create = methods.create; command = methods.command; startExport = methods.startExport; export = methods.export; revisions = methods.revisions; cancel = methods.cancel; } }));
const edit = VideoEditSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "edit_caption", ownerId: "creator", projectId: "project_one", name: "Caption policy", revision: 1, composition: { normalizationVersion: "vidra-cfr30/v1", preset: "landscape", fps: 30, items: [{ id: "item_one", versionId: "version_one", kind: "picture", inFrame: 0, outFrame: 90, displayFrames: 90, fit: "fit", sourceAudio: { muted: true, gain: 1 } }], text: [{ id: "text_one", text: "Run 🚀", anchor: { kind: "item", itemId: "item_one" }, startFrame: 0, endFrame: 60, x: .08, y: .83, width: .84, height: .12, fontSize: 32, color: "#ffffff", align: "center" }] }, issues: [], createdAt: "2026-10-17T05:00:00.000Z", updatedAt: "2026-10-17T05:00:00.000Z" });
const other = VideoEditSchema.parse({ ...edit, id: "edit_other", composition: { ...edit.composition, text: edit.composition.text.map(caption => ({ ...caption, id: "text_other", text: "Other 🚀" })) } });
const corrected = VideoEditSchema.parse({ ...edit, revision: 2, composition: { ...edit.composition, text: edit.composition.text.map(caption => ({ ...caption, text: "Run!" })) } });
function details(source = edit): VideoCaptionValidationDetails { return VideoCaptionValidationDetailsSchema.parse({ kind: "video-caption-validation", ownerId: source.ownerId, projectId: source.projectId, editId: source.id, revision: source.revision, issues: [{ elementId: source.composition.text[0]?.id, code: "text_render_policy", message: "This caption contains characters unavailable in the export font.", unsupportedCodePoints: [0x1f680] }] }); }
function rejection(source = edit): VideoCaptionValidationError { return new VideoCaptionValidationError("Edit the identified caption before exporting.", details(source)); }
function accepted(source: VideoEdit, envelope: ExportEnvelope): VideoExport {
  const { preset, ...receipt } = envelope;
  return VideoExportSchema.parse({ schemaVersion: "vidra-workflow/v2", id: `export_${source.id}`, ownerId: source.ownerId, projectId: source.projectId, editId: source.id, ...receipt, composition: { ...source.composition, preset }, compositionHash: "a".repeat(64), sources: [], renderer: "native/v1", attemptId: `attempt_${source.id}`, state: "ready", progress: 1, createdAt: source.createdAt, updatedAt: source.updatedAt });
}
function pendingKey(editId = edit.id): string { return `vidra.video-editor.v1:creator:project_one:edit:${editId}:export`; }
beforeEach(() => { localStorage.clear(); vi.resetAllMocks(); methods.list.mockResolvedValue([edit, other]); methods.get.mockImplementation(async (id: string) => id === edit.id ? edit : other); methods.exports.mockResolvedValue([]); });

it("publishes cue policy issues separately, clears rejected acceptance and preserves the saved composition/history", async () => {
  methods.startExport.mockRejectedValueOnce(rejection()); methods.revisions.mockResolvedValueOnce([edit]);
  const view = renderHook(() => useVideoEditor("creator", "project_one", edit.id)); await waitFor(() => expect(view.result.current.edit).toEqual(edit));
  await act(async () => { await view.result.current.loadHistory(); await view.result.current.exportEdit(); });
  expect(view.result.current.captionValidation).toEqual(details()); expect(view.result.current.error).toBeUndefined(); expect(view.result.current.pendingExport).toBe(false); expect(localStorage.getItem(pendingKey())).toBeNull(); expect(view.result.current.exports).toEqual([]);
  expect(view.result.current.edit).toEqual(edit); expect(view.result.current.edit?.issues).toEqual([]); expect(view.result.current.history).toEqual([edit]); expect(view.result.current.canUndo).toBe(false);
  await act(async () => { await view.result.current.exportEdit(); }); expect(methods.startExport).toHaveBeenCalledTimes(1); expect(view.result.current.pendingExport).toBe(false); expect(localStorage.getItem(pendingKey())).toBeNull();
  act(() => { view.result.current.clearError(); }); expect(view.result.current.captionValidation).toEqual(details()); view.unmount();
});

it("clears policy issues after a confirmed correction and exports the new revision with fresh identities", async () => {
  methods.startExport.mockRejectedValueOnce(rejection()); methods.command.mockResolvedValueOnce(corrected); methods.revisions.mockResolvedValueOnce([edit]);
  const view = renderHook(() => useVideoEditor("creator", "project_one", edit.id)); await waitFor(() => expect(view.result.current.edit).toEqual(edit));
  await act(async () => { await view.result.current.loadHistory(); await view.result.current.exportEdit(); }); const original = CreateVideoExportSchema.parse(methods.startExport.mock.calls[0]?.[1]);
  await act(async () => { expect(await view.result.current.command({ kind: "text", text: corrected.composition.text[0]! })).toBe(true); });
  expect(view.result.current.captionValidation).toBeUndefined(); expect(view.result.current.edit).toEqual(corrected); expect(view.result.current.history).toEqual([edit]); expect(view.result.current.canUndo).toBe(true);
  methods.startExport.mockImplementationOnce(async (_id: string, envelope: ExportEnvelope) => accepted(corrected, envelope)); await act(async () => { await view.result.current.exportEdit(); });
  const fresh = CreateVideoExportSchema.parse(methods.startExport.mock.calls[1]?.[1]); expect(fresh.revision).toBe(2); expect(fresh.submissionId).not.toBe(original.submissionId); expect(fresh.executionDraftId).not.toBe(original.executionDraftId); expect(view.result.current.pendingExport).toBe(false); expect(view.result.current.exports[0]?.revision).toBe(2); expect(view.result.current.error).toBeUndefined(); view.unmount();
});

it("keeps current policy issues when a correction save fails and clears them only after its exact retry confirms", async () => {
  methods.startExport.mockRejectedValueOnce(rejection()); methods.command.mockRejectedValueOnce(new Error("Correction reply lost")).mockResolvedValueOnce(corrected);
  const view = renderHook(() => useVideoEditor("creator", "project_one", edit.id)); await waitFor(() => expect(view.result.current.edit).toEqual(edit));
  await act(async () => { await view.result.current.exportEdit(); await view.result.current.command({ kind: "text", text: corrected.composition.text[0]! }); });
  expect(view.result.current.captionValidation).toEqual(details()); expect(view.result.current.edit).toEqual(edit); expect(view.result.current.pending).toBe(true); const original = methods.command.mock.calls[0];
  await act(async () => { await view.result.current.retryChange(); }); expect(methods.command.mock.calls[1]).toEqual(original); expect(view.result.current.captionValidation).toBeUndefined(); expect(view.result.current.edit).toEqual(corrected); view.unmount();
});

it.each(["ownerId", "projectId", "editId", "revision", "cue"] as const)("never publishes a typed error with foreign %s details", async field => {
  const wrong = VideoCaptionValidationDetailsSchema.parse({ ...details(), ...(field === "cue" ? { issues: [{ ...details().issues[0], elementId: "text_unrelated" }] } : { [field]: field === "revision" ? 2 : field === "ownerId" ? "other_creator" : field === "projectId" ? "project_other" : other.id }) });
  methods.startExport.mockRejectedValueOnce(new VideoCaptionValidationError("Foreign caption contents must not display", wrong));
  const view = renderHook(() => useVideoEditor("creator", "project_one", edit.id)); await waitFor(() => expect(view.result.current.edit).toEqual(edit)); await act(async () => { await view.result.current.exportEdit(); });
  expect(view.result.current.captionValidation).toBeUndefined(); expect(view.result.current.error).toMatch(/does not match the captured/); expect(view.result.current.error).not.toContain("Foreign caption contents"); expect(view.result.current.pendingExport).toBe(false); expect(localStorage.getItem(pendingKey())).toBeNull(); expect(view.result.current.edit).toEqual(edit); view.unmount();
});

it("ignores an old revision policy rejection during acceptance recovery after a newer caption was saved", async () => {
  methods.startExport.mockRejectedValueOnce(new Error("Acceptance reply lost")).mockRejectedValueOnce(rejection()); methods.command.mockResolvedValueOnce(corrected);
  const view = renderHook(() => useVideoEditor("creator", "project_one", edit.id)); await waitFor(() => expect(view.result.current.edit).toEqual(edit)); await act(async () => { await view.result.current.exportEdit(); });
  const original = methods.startExport.mock.calls[0]; expect(view.result.current.pendingExport).toBe(true);
  await act(async () => { await view.result.current.command({ kind: "text", text: corrected.composition.text[0]! }); }); expect(view.result.current.pendingExport).toBe(true);
  await act(async () => { await view.result.current.retryExportAcceptance(); });
  expect(methods.startExport.mock.calls[1]).toEqual(original); expect(view.result.current.captionValidation).toBeUndefined(); expect(view.result.current.error).toBeUndefined(); expect(view.result.current.edit).toEqual(corrected); expect(view.result.current.pendingExport).toBe(false); expect(localStorage.getItem(pendingKey())).toBeNull();
  methods.startExport.mockImplementationOnce(async (_id: string, envelope: ExportEnvelope) => accepted(corrected, envelope)); await act(async () => { await view.result.current.exportEdit(); }); expect(methods.startExport.mock.calls[2]?.[1]).toMatchObject({ revision: 2 }); view.unmount();
});

it("does not inject A's late policy rejection into B or clear B's own current policy issue", async () => {
  let rejectA: ((failure: VideoCaptionValidationError) => void) | undefined;
  methods.startExport.mockImplementationOnce(() => new Promise<VideoExport>((_resolve, reject) => { rejectA = reject; })).mockRejectedValueOnce(rejection(other));
  const view = renderHook(({ id }: { id: string }) => useVideoEditor("creator", "project_one", id), { initialProps: { id: edit.id } }); await waitFor(() => expect(view.result.current.edit).toEqual(edit));
  let pendingA!: Promise<void>; act(() => { pendingA = view.result.current.exportEdit(); }); const retainedA = localStorage.getItem(pendingKey());
  view.rerender({ id: other.id }); await waitFor(() => expect(view.result.current.edit).toEqual(other)); await act(async () => { await view.result.current.exportEdit(); }); expect(view.result.current.captionValidation).toEqual(details(other));
  await act(async () => { rejectA?.(rejection()); await pendingA; });
  expect(view.result.current.edit).toEqual(other); expect(view.result.current.captionValidation).toEqual(details(other)); expect(view.result.current.error).toBeUndefined(); expect(view.result.current.pendingExport).toBe(false); expect(localStorage.getItem(pendingKey())).toBe(retainedA); view.unmount();
});

it("keeps generic definitive failures out of caption issues while clearing their pending export", async () => {
  methods.startExport.mockRejectedValueOnce(new WorkflowApiError("This export setting is invalid.", 422, "invalid_settings"));
  const view = renderHook(() => useVideoEditor("creator", "project_one", edit.id)); await waitFor(() => expect(view.result.current.edit).toEqual(edit)); await act(async () => { await view.result.current.exportEdit(); });
  expect(view.result.current.captionValidation).toBeUndefined(); expect(view.result.current.error).toBe("This export setting is invalid."); expect(view.result.current.pendingExport).toBe(false); expect(localStorage.getItem(pendingKey())).toBeNull(); view.unmount();
});

it("allows a captured older export retry without clearing the newer revision's known caption rejection", async () => {
  const latest = VideoEditSchema.parse({ ...edit, revision: 3 }); const older = VideoEditSchema.parse({ ...corrected, revision: 2 });
  methods.get.mockResolvedValueOnce(latest); methods.startExport.mockRejectedValueOnce(rejection(latest));
  const view = renderHook(() => useVideoEditor("creator", "project_one", edit.id)); await waitFor(() => expect(view.result.current.edit).toEqual(latest)); await act(async () => { await view.result.current.exportEdit(); }); expect(view.result.current.captionValidation).toEqual(details(latest));
  const previous = accepted(older, CreateVideoExportSchema.parse({ submissionId: "submission_previous", executionDraftId: "draft_previous", executionDraftRevision: 1, revision: 2, preset: "landscape" }));
  methods.startExport.mockImplementationOnce(async (_id: string, envelope: ExportEnvelope) => accepted(older, envelope));
  await act(async () => { await view.result.current.exportEdit({ ...previous, state: "failed" }); });
  expect(methods.startExport.mock.calls[1]?.[1]).toMatchObject({ revision: 2, retryOf: previous.id }); expect(view.result.current.captionValidation).toEqual(details(latest)); expect(view.result.current.edit).toEqual(latest); expect(view.result.current.pendingExport).toBe(false); view.unmount();
});
