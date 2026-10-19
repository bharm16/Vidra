import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { VideoEditSchema, VideoExportSchema } from "@shared/schemas/workflow/video-edit.schemas";
import { useVideoEditor } from "../hooks/useVideoEditor";
import type { ExportEnvelope } from "../api/videoEditorApi";

const methods = vi.hoisted(() => ({ list: vi.fn(), exports: vi.fn(), get: vi.fn(), create: vi.fn(), command: vi.fn(), startExport: vi.fn(), export: vi.fn(), revisions: vi.fn() }));
vi.mock("../api/videoEditorApi", () => ({ VideoEditorApi: class { list = methods.list; exports = methods.exports; get = methods.get; create = methods.create; command = methods.command; startExport = methods.startExport; export = methods.export; revisions = methods.revisions; } }));
const edit = VideoEditSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "edit_one", ownerId: "creator", projectId: "project_one", name: "Video edit", revision: 1, composition: { normalizationVersion: "vidra-cfr30/v1", preset: "landscape", fps: 30, items: [{ id: "item_one", versionId: "version_one", kind: "picture", inFrame: 0, outFrame: 90, displayFrames: 90, fit: "fit", sourceAudio: { muted: true, gain: 1 } }], text: [] }, issues: [], createdAt: "2026-10-17T05:00:00.000Z", updatedAt: "2026-10-17T05:00:00.000Z" });
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); methods.list.mockResolvedValue([edit]); methods.exports.mockResolvedValue([]); methods.get.mockResolvedValue(edit); });

it("retains a lost save operation and retries with the same identity and exact command", async () => {
  methods.command.mockRejectedValueOnce(new Error("Connection lost")).mockResolvedValueOnce({ ...edit, revision: 2 });
  const { result } = renderHook(() => useVideoEditor("creator", "project_one")); await waitFor(() => expect(result.current.edit).toBeDefined());
  await act(async () => { await result.current.command({ kind: "duration", itemId: "item_one", displayFrames: 150 }); });
  expect(result.current.pending).toBe(true); expect(result.current.edit?.revision).toBe(1);
  const original = methods.command.mock.calls[0];
  await act(async () => { await result.current.retryChange(); });
  expect(methods.command.mock.calls[1]).toEqual(original); expect(result.current.pending).toBe(false); expect(result.current.edit?.revision).toBe(2);
});
it("keeps an uncertain export envelope across reopening and reuses it for acceptance recovery", async () => {
  methods.startExport.mockRejectedValueOnce(new Error("Response lost"));
  const first = renderHook(() => useVideoEditor("creator", "project_one")); await waitFor(() => expect(first.result.current.edit).toBeDefined());
  await act(async () => { await first.result.current.exportEdit(); });
  const captured = methods.startExport.mock.calls[0]?.[1]; expect(captured).toBeDefined(); expect(first.result.current.pendingExport).toBe(true); first.unmount();
  methods.startExport.mockImplementationOnce(async (_id: string, envelope: ExportEnvelope) => { const { preset: _preset, ...receipt } = envelope; return VideoExportSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "export_one", ownerId: "creator", projectId: "project_one", editId: "edit_one", ...receipt, composition: edit.composition, compositionHash: "a".repeat(64), sources: [], renderer: "native/v1", attemptId: "attempt_one", state: "rendering", progress: .1, createdAt: edit.createdAt, updatedAt: edit.updatedAt }); });
  const second = renderHook(() => useVideoEditor("creator", "project_one")); await waitFor(() => expect(second.result.current.edit).toBeDefined());
  expect(methods.startExport).toHaveBeenCalledTimes(1);
  await act(async () => { await second.result.current.retryExportAcceptance(); });
  expect(methods.startExport.mock.calls[1]?.[1]).toEqual(captured); expect(second.result.current.exports[0]?.state).toBe("rendering"); second.unmount();
});
it("does not surface another account's retained pending commands", async () => {
  localStorage.setItem("vidra.video-editor.v1:other:project_one:change", JSON.stringify({ editId: "edit_private", revision: 1, operationId: "operation_private", command: { kind: "duration", itemId: "item_private", displayFrames: 90 } }));
  const { result } = renderHook(() => useVideoEditor("creator", "project_one")); await waitFor(() => expect(result.current.edit).toBeDefined());
  expect(result.current.pending).toBe(false); expect(methods.command).not.toHaveBeenCalled();
});
