import { useEffect } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CreateVideoExportSchema, VideoEditSchema, VideoExportSchema, type VideoEdit, type VideoExport } from "@shared/schemas/workflow/video-edit.schemas";
import { useVideoEditor } from "../hooks/useVideoEditor";
import type { ExportEnvelope } from "../api/videoEditorApi";

const methods = vi.hoisted(() => ({ list: vi.fn(), exports: vi.fn(), get: vi.fn(), create: vi.fn(), command: vi.fn(), startExport: vi.fn(), export: vi.fn(), revisions: vi.fn(), cancel: vi.fn() }));
vi.mock("../api/videoEditorApi", () => ({ VideoEditorApi: class { list = methods.list; exports = methods.exports; get = methods.get; create = methods.create; command = methods.command; startExport = methods.startExport; export = methods.export; revisions = methods.revisions; cancel = methods.cancel; } }));
const scope = "vidra.video-editor.v1:creator:project_one";
const retainedKey = (id: string, kind: "change" | "export"): string => `${scope}:edit:${encodeURIComponent(id)}:${kind}`;
function fixture(id: string, frames: number): VideoEdit {
  return VideoEditSchema.parse({ schemaVersion: "vidra-workflow/v2", id, ownerId: "creator", projectId: "project_one", name: id, revision: 1, composition: { normalizationVersion: "vidra-cfr30/v1", preset: "landscape", fps: 30, items: [{ id: `item_${id}`, versionId: `version_${id}`, kind: "picture", inFrame: 0, outFrame: frames, displayFrames: frames, fit: "fit", sourceAudio: { muted: true, gain: 1 } }], text: [] }, issues: [], createdAt: "2026-10-17T05:00:00.000Z", updatedAt: "2026-10-17T05:00:00.000Z" });
}
const editA = fixture("edit_a", 90); const editB = fixture("edit_b", 120);
function changed(edit: VideoEdit, frames: number, revision = edit.revision + 1): VideoEdit { return VideoEditSchema.parse({ ...edit, revision, composition: { ...edit.composition, items: edit.composition.items.map(item => ({ ...item, displayFrames: frames })) } }); }
function job(edit: VideoEdit, id = `export_${edit.id}`, state: VideoExport["state"] = "ready"): VideoExport {
  return VideoExportSchema.parse({ schemaVersion: "vidra-workflow/v2", id, ownerId: edit.ownerId, projectId: edit.projectId, editId: edit.id, submissionId: `submission_${id}`, executionDraftId: `draft_${id}`, executionDraftRevision: 1, revision: edit.revision, composition: edit.composition, compositionHash: "a".repeat(64), sources: [], renderer: "native/v1", attemptId: `attempt_${id}`, state, progress: state === "ready" ? 1 : .1, createdAt: edit.createdAt, updatedAt: edit.updatedAt });
}
function accepted(edit: VideoEdit, envelope: ExportEnvelope): VideoExport { const { preset, ...receipt } = envelope; return VideoExportSchema.parse({ ...job(edit), ...receipt, composition: { ...edit.composition, preset } }); }
function deferred<T>(): { promise: Promise<T>; resolve(value: T): void; reject(reason: Error): void } {
  let resolve!: (value: T) => void; let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject };
}
function renderEditor(initialEditId: string | null = editA.id): ReturnType<typeof renderHook<ReturnType<typeof useVideoEditor>, { id: string | undefined }>> & { selected: ReturnType<typeof vi.fn> } {
  const selected = vi.fn();
  const rendered = renderHook(({ id }: { id: string | undefined }) => {
    const controller = useVideoEditor("creator", "project_one", id);
    const selectedId = controller.edit?.id; useEffect(() => { if (selectedId) selected(selectedId); }, [selectedId]);
    return controller;
  }, { initialProps: { id: initialEditId ?? undefined } });
  return { ...rendered, selected };
}
beforeEach(() => {
  localStorage.clear(); vi.resetAllMocks();
  methods.list.mockResolvedValue([editA, editB]); methods.exports.mockResolvedValue([]);
  methods.get.mockImplementation(async (id: string) => id === editA.id ? editA : editB);
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it.each(["success", "failure"] as const)("isolates an old save %s, its checkpoint and its finally block from the newly selected edit", async outcome => {
  const a = deferred<VideoEdit>(); const b = deferred<VideoEdit>(); methods.command.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
  const rendered = renderEditor(); await waitFor(() => expect(rendered.result.current.edit?.id).toBe(editA.id));
  let pendingA!: Promise<boolean>;
  act(() => { pendingA = rendered.result.current.command({ kind: "duration", itemId: editA.composition.items[0]!.id, displayFrames: 150 }); });
  const capturedA = methods.command.mock.calls[0];
  rendered.rerender({ id: editB.id }); await waitFor(() => expect(rendered.result.current.edit?.id).toBe(editB.id));
  expect(rendered.result.current.pending).toBe(false); expect(rendered.result.current.busy).toBe(false);
  let pendingB!: Promise<boolean>;
  act(() => { pendingB = rendered.result.current.command({ kind: "duration", itemId: editB.composition.items[0]!.id, displayFrames: 180 }); });
  expect(methods.command).toHaveBeenCalledTimes(2);
  const checkpointB = localStorage.getItem(retainedKey(editB.id, "change"));
  await act(async () => { if (outcome === "success") a.resolve(changed(editA, 150)); else a.reject(new Error("Edit A save failed")); expect(await pendingA).toBe(false); });
  expect(rendered.result.current.edit).toEqual(editB); expect(rendered.result.current.error).toBeUndefined(); expect(rendered.result.current.busy).toBe(true);
  expect(rendered.result.current.pending).toBe(true); expect(rendered.result.current.canUndo).toBe(false); expect(rendered.selected.mock.calls.map(row => row[0])).toEqual([editA.id, editB.id]);
  expect(localStorage.getItem(retainedKey(editB.id, "change"))).toBe(checkpointB);
  expect(JSON.parse(localStorage.getItem(retainedKey(editA.id, "change")) ?? "null")).toMatchObject({ operationId: capturedA?.[2], editId: editA.id });
  await act(async () => { b.resolve(changed(editB, 180)); expect(await pendingB).toBe(true); });
  expect(rendered.result.current.edit?.composition.items[0]?.displayFrames).toBe(180); expect(rendered.result.current.canUndo).toBe(true); expect(rendered.result.current.busy).toBe(false);
  rendered.rerender({ id: editA.id }); await waitFor(() => expect(rendered.result.current.edit?.id).toBe(editA.id));
  expect(rendered.result.current.pending).toBe(true); methods.command.mockResolvedValueOnce(changed(editA, 150));
  await act(async () => { expect(await rendered.result.current.retryChange()).toBe(true); });
  expect(methods.command.mock.calls[2]).toEqual(capturedA); expect(localStorage.getItem(retainedKey(editA.id, "change"))).toBeNull(); rendered.unmount();
});

it("preserves an in-flight save and undo/redo when the URL synchronizes to the edit already loaded", async () => {
  const save = deferred<VideoEdit>(); methods.command.mockReturnValueOnce(save.promise);
  const rendered = renderEditor(null); await waitFor(() => expect(rendered.result.current.edit?.id).toBe(editA.id));
  let operation!: Promise<boolean>; act(() => { operation = rendered.result.current.command({ kind: "duration", itemId: editA.composition.items[0]!.id, displayFrames: 150 }); });
  rendered.rerender({ id: editA.id });
  await act(async () => { save.resolve(changed(editA, 150)); expect(await operation).toBe(true); });
  expect(rendered.result.current.canUndo).toBe(true); expect(methods.get).not.toHaveBeenCalled();
  methods.command.mockResolvedValueOnce({ ...editA, revision: 3 }); await act(async () => { await rendered.result.current.undo(); });
  expect(methods.command.mock.calls[1]?.[3]).toEqual({ kind: "replace_composition", composition: editA.composition }); expect(rendered.result.current.canRedo).toBe(true);
  methods.command.mockResolvedValueOnce(changed(editA, 150, 4)); await act(async () => { await rendered.result.current.redo(); });
  expect(methods.command.mock.calls[2]?.[3]).toEqual({ kind: "replace_composition", composition: changed(editA, 150).composition }); expect(rendered.result.current.canUndo).toBe(true); expect(rendered.result.current.canRedo).toBe(false); rendered.unmount();
});

it("rejects a previous visit's reply even after returning to the same edit and starting its exact retry", async () => {
  const old = deferred<VideoEdit>(); const retry = deferred<VideoEdit>(); methods.command.mockReturnValueOnce(old.promise).mockReturnValueOnce(retry.promise);
  const rendered = renderEditor(); await waitFor(() => expect(rendered.result.current.edit?.id).toBe(editA.id));
  let original!: Promise<boolean>; act(() => { original = rendered.result.current.command({ kind: "duration", itemId: editA.composition.items[0]!.id, displayFrames: 150 }); });
  const captured = methods.command.mock.calls[0]; rendered.rerender({ id: editB.id }); await waitFor(() => expect(rendered.result.current.edit?.id).toBe(editB.id));
  rendered.rerender({ id: editA.id }); await waitFor(() => expect(rendered.result.current.edit?.id).toBe(editA.id));
  let recovery!: Promise<boolean>; act(() => { recovery = rendered.result.current.retryChange(); }); expect(methods.command.mock.calls[1]).toEqual(captured);
  await act(async () => { old.resolve(changed(editA, 150)); expect(await original).toBe(false); });
  expect(rendered.result.current.edit).toEqual(editA); expect(rendered.result.current.busy).toBe(true); expect(rendered.result.current.pending).toBe(true); expect(rendered.result.current.canUndo).toBe(false);
  await act(async () => { retry.resolve(changed(editA, 150)); expect(await recovery).toBe(true); }); expect(rendered.result.current.busy).toBe(false); expect(rendered.result.current.pending).toBe(false); expect(rendered.result.current.edit?.revision).toBe(2); rendered.unmount();
});

it.each(["success", "failure"] as const)("keeps an old export acceptance %s scoped and recoverable while edit B submits", async outcome => {
  const a = deferred<VideoExport>(); const b = deferred<VideoExport>(); methods.startExport.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
  const rendered = renderEditor(); await waitFor(() => expect(rendered.result.current.edit?.id).toBe(editA.id));
  let pendingA!: Promise<void>; act(() => { pendingA = rendered.result.current.exportEdit(); }); const envelopeA = CreateVideoExportSchema.parse(methods.startExport.mock.calls[0]?.[1]);
  rendered.rerender({ id: editB.id }); await waitFor(() => expect(rendered.result.current.edit?.id).toBe(editB.id));
  expect(rendered.result.current.pendingExport).toBe(false); let pendingB!: Promise<void>; act(() => { pendingB = rendered.result.current.exportEdit(); });
  const envelopeB = CreateVideoExportSchema.parse(methods.startExport.mock.calls[1]?.[1]); const checkpointB = localStorage.getItem(retainedKey(editB.id, "export"));
  await act(async () => { if (outcome === "success") a.resolve(accepted(editA, envelopeA)); else a.reject(new Error("Edit A export failed")); await pendingA; });
  expect(rendered.result.current.exports).toEqual([]); expect(rendered.result.current.error).toBeUndefined(); expect(rendered.result.current.busy).toBe(true); expect(rendered.result.current.pendingExport).toBe(true);
  expect(localStorage.getItem(retainedKey(editB.id, "export"))).toBe(checkpointB); expect(JSON.parse(localStorage.getItem(retainedKey(editA.id, "export")) ?? "null")).toEqual({ editId: editA.id, envelope: envelopeA });
  await act(async () => { b.resolve(accepted(editB, envelopeB)); await pendingB; }); expect(rendered.result.current.exports.map(row => row.editId)).toEqual([editB.id]);
  rendered.rerender({ id: editA.id }); await waitFor(() => expect(rendered.result.current.edit?.id).toBe(editA.id)); expect(rendered.result.current.pendingExport).toBe(true);
  methods.startExport.mockResolvedValueOnce(accepted(editA, envelopeA)); await act(async () => { await rendered.result.current.retryExportAcceptance(); });
  expect(methods.startExport.mock.calls[2]).toEqual([editA.id, envelopeA]); expect(rendered.result.current.pendingExport).toBe(false); rendered.unmount();
});

it.each(["history", "check", "cancel"] as const)("ignores old %s successes and failures after switching edits", async action => {
  for (const outcome of ["success", "failure"] as const) {
    const old = deferred<VideoEdit[] | VideoExport>(); methods.exports.mockResolvedValue([job(editA), job(editB)]);
    if (action === "history") methods.revisions.mockReturnValueOnce(old.promise); else methods[action === "check" ? "export" : "cancel"].mockReturnValueOnce(old.promise);
    const rendered = renderEditor(); await waitFor(() => expect(rendered.result.current.edit?.id).toBe(editA.id));
    let operation!: Promise<void>; act(() => { operation = action === "history" ? rendered.result.current.loadHistory() : action === "check" ? rendered.result.current.checkExport(job(editA).id) : rendered.result.current.cancelExport(job(editA).id); });
    rendered.rerender({ id: editB.id }); await waitFor(() => expect(rendered.result.current.edit?.id).toBe(editB.id));
    await act(async () => { if (outcome === "failure") old.reject(new Error(`Old ${action} failure`)); else old.resolve(action === "history" ? [changed(editA, 150)] : job(editA, undefined, "cancelled")); await operation; });
    expect(rendered.result.current.edit).toEqual(editB); expect(rendered.result.current.history).toEqual([]); expect(rendered.result.current.exports).toEqual([job(editB)]); expect(rendered.result.current.error).toBeUndefined(); expect(rendered.result.current.observationLost).toBe(false); rendered.unmount();
  }
});

it.each(["undo", "redo"] as const)("ignores an old %s continuation after switching edits", async direction => {
  for (const outcome of ["success", "failure"] as const) {
    localStorage.clear(); methods.command.mockReset();
    methods.command.mockResolvedValueOnce(changed(editA, 150));
    const rendered = renderEditor(); await waitFor(() => expect(rendered.result.current.edit?.id).toBe(editA.id));
    await act(async () => { await rendered.result.current.command({ kind: "duration", itemId: editA.composition.items[0]!.id, displayFrames: 150 }); });
    if (direction === "redo") { methods.command.mockResolvedValueOnce({ ...editA, revision: 3 }); await act(async () => { await rendered.result.current.undo(); }); }
    const old = deferred<VideoEdit>(); methods.command.mockReturnValueOnce(old.promise); let operation!: Promise<void>;
    const before = methods.command.mock.calls.length; act(() => { operation = rendered.result.current[direction](); }); expect(methods.command).toHaveBeenCalledTimes(before + 1);
    const retained = localStorage.getItem(retainedKey(editA.id, "change"));
    rendered.rerender({ id: editB.id }); await waitFor(() => expect(rendered.result.current.edit?.id).toBe(editB.id));
    await act(async () => { if (outcome === "success") old.resolve(changed(editA, 160, 4)); else old.reject(new Error("Old history save failed")); await operation; });
    expect(rendered.result.current.edit).toEqual(editB); expect(rendered.result.current.canUndo).toBe(false); expect(rendered.result.current.canRedo).toBe(false); expect(rendered.result.current.error).toBeUndefined();
    expect(localStorage.getItem(retainedKey(editA.id, "change"))).toBe(retained); expect(rendered.selected.mock.calls.map(row => row[0])).toEqual([editA.id, editB.id]); rendered.unmount();
  }
});

it.each(["success", "failure"] as const)("ignores an old poll %s after switching edits", async outcome => {
  vi.useFakeTimers(); const old = deferred<VideoExport>(); methods.exports.mockResolvedValue([job(editA, undefined, "rendering"), job(editB)]); methods.export.mockReturnValueOnce(old.promise);
  const rendered = renderEditor(); await act(async () => { await Promise.resolve(); }); expect(rendered.result.current.edit?.id).toBe(editA.id);
  await act(async () => { await vi.advanceTimersByTimeAsync(1500); }); expect(methods.export).toHaveBeenCalledWith(job(editA).id);
  rendered.rerender({ id: editB.id }); await act(async () => { await Promise.resolve(); }); expect(rendered.result.current.edit?.id).toBe(editB.id);
  await act(async () => { if (outcome === "success") old.resolve(job(editA)); else old.reject(new Error("Old poll failed")); await Promise.resolve(); });
  expect(rendered.result.current.edit).toEqual(editB); expect(rendered.result.current.exports).toEqual([job(editB)]); expect(rendered.result.current.error).toBeUndefined(); expect(rendered.result.current.observationLost).toBe(false); rendered.unmount();
});

it.each(["ownerId", "projectId", "id"] as const)("rejects a save DTO with a mismatched %s while retaining the exact operation", async field => {
  const bad = VideoEditSchema.parse({ ...changed(editA, 150), [field]: field === "ownerId" ? "other_creator" : field === "projectId" ? "project_other" : editB.id }); methods.command.mockResolvedValueOnce(bad);
  const rendered = renderEditor(); await waitFor(() => expect(rendered.result.current.edit?.id).toBe(editA.id));
  await act(async () => { expect(await rendered.result.current.command({ kind: "duration", itemId: editA.composition.items[0]!.id, displayFrames: 150 })).toBe(false); });
  expect(rendered.result.current.edit).toEqual(editA); expect(rendered.result.current.error).toMatch(/different work or another account/); expect(rendered.result.current.pending).toBe(true); expect(rendered.result.current.canUndo).toBe(false); rendered.unmount();
});

it.each(["ownerId", "projectId", "editId"] as const)("rejects export and history DTOs with a mismatched %s", async field => {
  const rendered = renderEditor(); await waitFor(() => expect(rendered.result.current.edit?.id).toBe(editA.id));
  const wrong = field === "ownerId" ? "other_creator" : field === "projectId" ? "project_other" : editB.id;
  methods.startExport.mockImplementationOnce(async (_id: string, envelope: ExportEnvelope) => VideoExportSchema.parse({ ...accepted(editA, envelope), [field]: wrong }));
  await act(async () => { await rendered.result.current.exportEdit(); }); expect(rendered.result.current.exports).toEqual([]); expect(rendered.result.current.pendingExport).toBe(true); expect(rendered.result.current.error).toMatch(/receipt does not match/);
  methods.revisions.mockResolvedValueOnce([VideoEditSchema.parse({ ...editA, [field === "editId" ? "id" : field]: wrong })]);
  await act(async () => { await rendered.result.current.loadHistory(); }); expect(rendered.result.current.history).toEqual([]); expect(rendered.result.current.error).toMatch(/history belongs to different work/); rendered.unmount();
});

it("migrates a legacy checkpoint only after preserving it and never overwrites another retained operation", async () => {
  const legacy = { editId: editA.id, revision: 1, operationId: "operation_legacy", command: { kind: "duration", itemId: editA.composition.items[0]!.id, displayFrames: 150 } };
  const newer = { ...legacy, operationId: "operation_retained", command: { ...legacy.command, displayFrames: 180 } };
  localStorage.setItem(`${scope}:change`, JSON.stringify(legacy)); localStorage.setItem(retainedKey(editA.id, "change"), JSON.stringify(newer));
  const rendered = renderEditor(); await waitFor(() => expect(rendered.result.current.edit?.id).toBe(editA.id));
  expect(rendered.result.current.pendingChange).toEqual(newer); expect(JSON.parse(localStorage.getItem(`${scope}:change`) ?? "null")).toEqual(legacy);
  methods.command.mockResolvedValueOnce(changed(editA, 180)); await act(async () => { await rendered.result.current.retryChange(); });
  expect(methods.command.mock.calls[0]?.[2]).toBe("operation_retained"); expect(rendered.result.current.pendingChange).toEqual(legacy); expect(JSON.parse(localStorage.getItem(retainedKey(editA.id, "change")) ?? "null")).toEqual(legacy); expect(localStorage.getItem(`${scope}:change`)).toBeNull();
  methods.command.mockResolvedValueOnce(changed(editA, 150)); await act(async () => { await rendered.result.current.retryChange(); }); expect(methods.command.mock.calls[1]?.[2]).toBe("operation_legacy"); expect(rendered.result.current.pending).toBe(false); rendered.unmount();
});

it("keeps a legacy checkpoint readable when device storage refuses migration", async () => {
  const legacy = { editId: editA.id, revision: 1, operationId: "operation_legacy", command: { kind: "duration", itemId: editA.composition.items[0]!.id, displayFrames: 150 } };
  localStorage.setItem(`${scope}:change`, JSON.stringify(legacy)); vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("Storage full"); });
  const rendered = renderEditor(); await waitFor(() => expect(rendered.result.current.edit?.id).toBe(editA.id));
  expect(rendered.result.current.pendingChange).toEqual(legacy); expect(JSON.parse(localStorage.getItem(`${scope}:change`) ?? "null")).toEqual(legacy); expect(localStorage.getItem(retainedKey(editA.id, "change"))).toBeNull(); rendered.unmount();
});

it("reopens a pending edit from its new per-edit checkpoint without selecting or blocking another explicit edit", async () => {
  const retained = { editId: editA.id, revision: 1, operationId: "operation_retained", command: { kind: "duration", itemId: editA.composition.items[0]!.id, displayFrames: 150 } };
  localStorage.setItem(retainedKey(editA.id, "change"), JSON.stringify(retained));
  const automatic = renderEditor(null); await waitFor(() => expect(automatic.result.current.edit?.id).toBe(editA.id)); expect(automatic.result.current.pending).toBe(true); automatic.unmount();
  const explicit = renderEditor(editB.id); await waitFor(() => expect(explicit.result.current.edit?.id).toBe(editB.id)); expect(explicit.result.current.pending).toBe(false); expect(explicit.result.current.pendingExport).toBe(false); expect(localStorage.getItem(retainedKey(editA.id, "change"))).not.toBeNull(); explicit.unmount();
});

it.each(["success", "failure"] as const)("ignores an old initial load %s after edit B has loaded", async outcome => {
  const old = deferred<VideoEdit>(); methods.get.mockImplementation((id: string) => id === editA.id ? old.promise : Promise.resolve(editB));
  const rendered = renderEditor(); await waitFor(() => expect(methods.get).toHaveBeenCalledWith(editA.id, expect.any(AbortSignal)));
  rendered.rerender({ id: editB.id }); await waitFor(() => expect(rendered.result.current.edit?.id).toBe(editB.id));
  await act(async () => { if (outcome === "success") old.resolve(editA); else old.reject(new Error("Old load failed")); await Promise.resolve(); });
  expect(rendered.result.current.edit).toEqual(editB); expect(rendered.result.current.loading).toBe(false); expect(rendered.result.current.error).toBeUndefined(); expect(rendered.selected.mock.calls.map(row => row[0])).toEqual([editB.id]); rendered.unmount();
});

it("preserves B's own history and error when A's successful observation arrives late", async () => {
  const old = deferred<VideoExport>(); methods.exports.mockResolvedValue([job(editA), job(editB)]); methods.export.mockReturnValueOnce(old.promise).mockRejectedValueOnce(new Error("B status unavailable")); methods.revisions.mockResolvedValueOnce([editB]);
  const rendered = renderEditor(); await waitFor(() => expect(rendered.result.current.edit?.id).toBe(editA.id)); let observation!: Promise<void>;
  act(() => { observation = rendered.result.current.checkExport(job(editA).id); }); rendered.rerender({ id: editB.id }); await waitFor(() => expect(rendered.result.current.edit?.id).toBe(editB.id));
  await act(async () => { await rendered.result.current.loadHistory(); await rendered.result.current.checkExport(job(editB).id); });
  await act(async () => { old.resolve(job(editA)); await observation; });
  expect(rendered.result.current.error).toBe("B status unavailable"); expect(rendered.result.current.history).toEqual([editB]); expect(rendered.result.current.exports).toEqual([job(editB)]); rendered.unmount();
});

it("does not dispatch a new change without durable recovery and can retry after storage recovers", async () => {
  const legacy = { editId: editA.id, revision: 1, operationId: "operation_legacy", command: { kind: "duration", itemId: editA.composition.items[0]!.id, displayFrames: 150 } };
  localStorage.setItem(`${scope}:change`, JSON.stringify(legacy)); const unavailable = vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("Storage unavailable"); });
  const rendered = renderEditor(editB.id); await waitFor(() => expect(rendered.result.current.edit?.id).toBe(editB.id));
  await act(async () => { expect(await rendered.result.current.command({ kind: "duration", itemId: editB.composition.items[0]!.id, displayFrames: 180 })).toBe(false); });
  expect(methods.command).not.toHaveBeenCalled(); expect(rendered.result.current.edit).toEqual(editB); expect(rendered.result.current.pending).toBe(false); expect(rendered.result.current.busy).toBe(false); expect(rendered.result.current.canUndo).toBe(false); expect(rendered.result.current.error).toMatch(/could not start.*could not be saved/);
  expect(JSON.parse(localStorage.getItem(`${scope}:change`) ?? "null")).toEqual(legacy); expect(localStorage.getItem(retainedKey(editB.id, "change"))).toBeNull();
  unavailable.mockRestore(); methods.command.mockResolvedValueOnce(changed(editB, 180));
  await act(async () => { expect(await rendered.result.current.command({ kind: "duration", itemId: editB.composition.items[0]!.id, displayFrames: 180 })).toBe(true); });
  expect(rendered.result.current.edit?.revision).toBe(2); expect(rendered.result.current.error).toBeUndefined(); expect(rendered.result.current.canUndo).toBe(true); expect(JSON.parse(localStorage.getItem(retainedKey(editA.id, "change")) ?? "null")).toEqual(legacy); expect(localStorage.getItem(`${scope}:change`)).toBeNull(); rendered.unmount();
});

it.each(["undo", "redo"] as const)("leaves %s history unchanged if its new checkpoint cannot be saved", async direction => {
  methods.command.mockResolvedValueOnce(changed(editA, 150)); const rendered = renderEditor(); await waitFor(() => expect(rendered.result.current.edit?.id).toBe(editA.id));
  await act(async () => { await rendered.result.current.command({ kind: "duration", itemId: editA.composition.items[0]!.id, displayFrames: 150 }); });
  if (direction === "redo") { methods.command.mockResolvedValueOnce({ ...editA, revision: 3 }); await act(async () => { await rendered.result.current.undo(); }); }
  const before = rendered.result.current.edit; const count = methods.command.mock.calls.length; const undo = rendered.result.current.canUndo; const redo = rendered.result.current.canRedo;
  const unavailable = vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("Storage unavailable"); });
  await act(async () => { await rendered.result.current[direction](); });
  expect(methods.command).toHaveBeenCalledTimes(count); expect(rendered.result.current.edit).toEqual(before); expect(rendered.result.current.canUndo).toBe(undo); expect(rendered.result.current.canRedo).toBe(redo); expect(rendered.result.current.pending).toBe(false); expect(rendered.result.current.busy).toBe(false); expect(rendered.result.current.error).toMatch(/could not start.*could not be saved/); expect(localStorage.getItem(retainedKey(editA.id, "change"))).toBeNull();
  unavailable.mockRestore(); methods.command.mockResolvedValueOnce(direction === "undo" ? { ...editA, revision: 3 } : changed(editA, 150, 4));
  await act(async () => { await rendered.result.current[direction](); }); expect(methods.command).toHaveBeenCalledTimes(count + 1); expect(rendered.result.current.error).toBeUndefined(); expect(direction === "undo" ? rendered.result.current.canRedo : rendered.result.current.canUndo).toBe(true); rendered.unmount();
});

it("does not submit an export without a durable envelope and leaves edit B independent after storage recovers", async () => {
  const rendered = renderEditor(); await waitFor(() => expect(rendered.result.current.edit?.id).toBe(editA.id));
  const unavailable = vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("Storage unavailable"); });
  await act(async () => { await rendered.result.current.exportEdit(); });
  expect(methods.startExport).not.toHaveBeenCalled(); expect(rendered.result.current.edit).toEqual(editA); expect(rendered.result.current.exports).toEqual([]); expect(rendered.result.current.pendingExport).toBe(false); expect(rendered.result.current.busy).toBe(false); expect(rendered.result.current.error).toMatch(/export could not start.*could not be saved/); expect(localStorage.getItem(retainedKey(editA.id, "export"))).toBeNull();
  rendered.rerender({ id: editB.id }); await waitFor(() => expect(rendered.result.current.edit?.id).toBe(editB.id)); expect(rendered.result.current.pendingExport).toBe(false); expect(rendered.result.current.error).toBeUndefined();
  unavailable.mockRestore(); methods.startExport.mockImplementationOnce(async (_id: string, envelope: ExportEnvelope) => accepted(editB, envelope));
  await act(async () => { await rendered.result.current.exportEdit(); }); expect(methods.startExport).toHaveBeenCalledTimes(1); expect(methods.startExport.mock.calls[0]?.[0]).toBe(editB.id); expect(rendered.result.current.exports.map(row => row.editId)).toEqual([editB.id]);
  rendered.rerender({ id: editA.id }); await waitFor(() => expect(rendered.result.current.edit?.id).toBe(editA.id));
  methods.startExport.mockImplementationOnce(async (_id: string, envelope: ExportEnvelope) => accepted(editA, envelope));
  await act(async () => { await rendered.result.current.exportEdit(); }); expect(methods.startExport).toHaveBeenCalledTimes(2); expect(rendered.result.current.error).toBeUndefined(); expect(rendered.result.current.exports.map(row => row.editId)).toEqual([editA.id]); rendered.unmount();
});

it("allows an exact readable legacy retry while new device writes are unavailable", async () => {
  const legacy = { editId: editA.id, revision: 1, operationId: "operation_legacy", command: { kind: "duration", itemId: editA.composition.items[0]!.id, displayFrames: 150 } };
  localStorage.setItem(`${scope}:change`, JSON.stringify(legacy)); vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("Storage unavailable"); });
  const rendered = renderEditor(); await waitFor(() => expect(rendered.result.current.edit?.id).toBe(editA.id)); methods.command.mockResolvedValueOnce(changed(editA, 150));
  await act(async () => { expect(await rendered.result.current.retryChange()).toBe(true); });
  expect(methods.command.mock.calls[0]).toEqual([editA.id, 1, legacy.operationId, legacy.command]); expect(rendered.result.current.edit?.revision).toBe(2); expect(rendered.result.current.pending).toBe(false); expect(rendered.result.current.error).toBeUndefined(); rendered.unmount();
});

const retainedActions = ["command", "exportEdit", "undo", "redo", "retryChange", "retryExportAcceptance", "checkExport", "cancelExport", "loadHistory", "reload", "clearError"] as const;
type RetainedAction = typeof retainedActions[number];
async function invokeRetained(controller: ReturnType<typeof useVideoEditor>, action: RetainedAction, activeEdit: VideoEdit): Promise<void | boolean> {
  switch (action) {
    case "command": return controller.command({ kind: "duration", itemId: activeEdit.composition.items[0]!.id, displayFrames: 210 });
    case "exportEdit": return controller.exportEdit();
    case "undo": return controller.undo();
    case "redo": return controller.redo();
    case "retryChange": return controller.retryChange();
    case "retryExportAcceptance": return controller.retryExportAcceptance();
    case "checkExport": return controller.checkExport(job(activeEdit).id);
    case "cancelExport": return controller.cancelExport(job(activeEdit).id);
    case "loadHistory": return controller.loadHistory();
    case "reload": controller.reload(); return;
    case "clearError": controller.clearError(); return;
  }
}
function visibleState(controller: ReturnType<typeof useVideoEditor>): unknown {
  return { edit: controller.edit, exports: controller.exports, history: controller.history, loading: controller.loading, busy: controller.busy, error: controller.error, pending: controller.pending, pendingChange: controller.pendingChange, pendingExport: controller.pendingExport, canUndo: controller.canUndo, canRedo: controller.canRedo, observationLost: controller.observationLost };
}
const retainedCases = retainedActions.flatMap(action => (["B", "reopened A"] as const).map(destination => ({ action, destination })));
it.each(retainedCases)("a retained controller A $action cannot act on $destination", async ({ action, destination }) => {
  methods.exports.mockResolvedValue([job(editA), job(editB)]);
  const rendered = renderEditor(); await waitFor(() => expect(rendered.result.current.edit?.id).toBe(editA.id)); const retained = rendered.result.current;
  rendered.rerender({ id: editB.id }); await waitFor(() => expect(rendered.result.current.edit?.id).toBe(editB.id));
  const active = destination === "B" ? editB : editA;
  if (destination === "reopened A") { rendered.rerender({ id: editA.id }); await waitFor(() => expect(rendered.result.current.edit?.id).toBe(editA.id)); }
  methods.command.mockResolvedValueOnce(changed(active, 150)).mockResolvedValueOnce(changed(active, 180, 3)).mockResolvedValueOnce(changed(active, 150, 4));
  await act(async () => {
    await rendered.result.current.command({ kind: "duration", itemId: active.composition.items[0]!.id, displayFrames: 150 });
  });
  await act(async () => {
    await rendered.result.current.command({ kind: "duration", itemId: active.composition.items[0]!.id, displayFrames: 180 });
  });
  await act(async () => { await rendered.result.current.undo(); });
  expect(rendered.result.current.canUndo).toBe(true); expect(rendered.result.current.canRedo).toBe(true);
  methods.revisions.mockResolvedValueOnce([active]); await act(async () => { await rendered.result.current.loadHistory(); });
  if (action === "retryChange") {
    methods.command.mockRejectedValueOnce(new Error("Active change reply lost")); await act(async () => { await rendered.result.current.command({ kind: "duration", itemId: active.composition.items[0]!.id, displayFrames: 210 }); });
  } else if (action === "retryExportAcceptance") {
    methods.startExport.mockRejectedValueOnce(new Error("Active export reply lost")); await act(async () => { await rendered.result.current.exportEdit(); });
  } else {
    methods.export.mockRejectedValueOnce(new Error("Active export status unavailable")); await act(async () => { await rendered.result.current.checkExport(job(active).id); });
  }
  const before = visibleState(rendered.result.current); const deviceBefore = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).sort().map(key => [key, key ? localStorage.getItem(key) : undefined]); const selectionBefore = [...rendered.selected.mock.calls];
  const ready = changed(active, 150, 4);
  methods.command.mockResolvedValue(changed(active, 210, 5)); methods.startExport.mockImplementation(async (_id: string, envelope: ExportEnvelope) => accepted(ready, envelope)); methods.export.mockResolvedValue(job(active)); methods.cancel.mockResolvedValue(job(active, undefined, "cancelled")); methods.revisions.mockResolvedValue([changed(active, 210, 6)]);
  for (const method of Object.values(methods)) method.mockClear();
  await act(async () => { await invokeRetained(retained, action, active); });
  for (const method of Object.values(methods)) expect(method).not.toHaveBeenCalled();
  expect(visibleState(rendered.result.current)).toEqual(before); expect(rendered.selected.mock.calls).toEqual(selectionBefore);
  expect(Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).sort().map(key => [key, key ? localStorage.getItem(key) : undefined])).toEqual(deviceBefore);
  await act(async () => { await invokeRetained(rendered.result.current, action, active); });
  if (action === "clearError") expect(rendered.result.current.error).toBeUndefined();
  else {
    const method = action === "command" || action === "undo" || action === "redo" || action === "retryChange" ? methods.command : action === "exportEdit" || action === "retryExportAcceptance" ? methods.startExport : action === "checkExport" ? methods.export : action === "cancelExport" ? methods.cancel : action === "loadHistory" ? methods.revisions : methods.list;
    expect(method).toHaveBeenCalledTimes(1);
  }
  expect(rendered.result.current.edit?.id).toBe(active.id); rendered.unmount();
});

it("keeps retained actions valid when the URL synchronizes to their already loaded edit", async () => {
  const rendered = renderEditor(null); await waitFor(() => expect(rendered.result.current.edit?.id).toBe(editA.id)); const retained = rendered.result.current;
  rendered.rerender({ id: editA.id }); methods.command.mockResolvedValueOnce(changed(editA, 150));
  await act(async () => { expect(await retained.command({ kind: "duration", itemId: editA.composition.items[0]!.id, displayFrames: 150 })).toBe(true); });
  expect(rendered.result.current.edit?.revision).toBe(2); expect(rendered.result.current.canUndo).toBe(true); expect(methods.get).not.toHaveBeenCalled();
  methods.command.mockResolvedValueOnce({ ...editA, revision: 3 }); await act(async () => { await retained.undo(); }); expect(rendered.result.current.canRedo).toBe(true);
  methods.revisions.mockResolvedValueOnce([editA]); await act(async () => { await retained.loadHistory(); }); expect(rendered.result.current.history).toEqual([editA]); rendered.unmount();
});
