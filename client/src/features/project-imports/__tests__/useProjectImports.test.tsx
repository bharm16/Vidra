import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useProjectImports } from "../hooks/useProjectImports";
import { ImportCommandSchema, ImportRecordSchema } from "@shared/schemas/workflow/import.schemas";
import { MediaVersionSchema } from "@shared/schemas/workflow/media.schemas";
const ports = vi.hoisted(() => ({ list: vi.fn(), save: vi.fn(), remove: vi.fn(), imports: vi.fn(), begin: vi.fn(), finish: vi.fn(), cancel: vi.fn(), transfer: vi.fn(), fingerprint: vi.fn(), command: vi.fn() }));
vi.mock("../api/ImportCheckpointStore", () => ({ ImportCheckpointStore: class { list = ports.list; save = ports.save; remove = ports.remove; } }));
vi.mock("../api/importTransfer", () => ({ fingerprint: ports.fingerprint, importCommand: ports.command, transferImport: ports.transfer }));
vi.mock("@/features/project-workspace/api", () => ({ WorkflowApi: class { imports = ports.imports; beginImport = ports.begin; finishImport = ports.finish; cancelImport = ports.cancel; }, WorkflowApiError: class extends Error { constructor(message: string, readonly status: number) { super(message); } } }));
const command = ImportCommandSchema.parse({ id: "import_one", filename: "private.png", bytes: 7, contentType: "image/png", sha256: "a".repeat(64) });
const record = ImportRecordSchema.parse({ ...command, ownerId: "creator", projectId: "project_one", storagePath: "users/creator/previews/images/private.png", state: "uploading", versionId: "version_one", createdAt: "2026-10-17T01:00:00.000Z" });
const version = MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "version_one", ownerId: "creator", projectId: "project_one", kind: "image", label: command.filename, origin: { kind: "upload" }, sourceInputs: [], object: { identity: "unknown", assetId: "one", storagePath: record.storagePath }, metadata: { state: "pending" }, association: "linked", createdAt: record.createdAt });
beforeEach(() => { vi.resetAllMocks(); ports.list.mockResolvedValue([]); ports.imports.mockResolvedValue([]); ports.save.mockResolvedValue(undefined); ports.remove.mockResolvedValue(undefined); ports.command.mockResolvedValue(command); ports.fingerprint.mockResolvedValue(command.sha256); ports.begin.mockResolvedValue({ record, uploadUrl: "https://storage.googleapis.com/resume", offset: 0 }); ports.finish.mockResolvedValue(version); ports.cancel.mockResolvedValue({ ...record, state: "cancelled" }); URL.createObjectURL = vi.fn(() => "blob:test"); URL.revokeObjectURL = vi.fn(); });
it("choosing a file starts transfer, stays Uploading during server checking and publishes only after verification", async () => {
  let finish = (_value: typeof version): void => undefined;
  ports.finish.mockReturnValue(new Promise<typeof version>(resolve => { finish = resolve; }));
  const ready = vi.fn(); const started = vi.fn(); const { result } = renderHook(() => useProjectImports("creator", "project_one", ready));
  await waitFor(() => expect(ports.imports).toHaveBeenCalled());
  let operation: Promise<void> = Promise.resolve(); act(() => { operation = result.current.choose(new File(["private"], "private.png", { type: "image/png" }), undefined, started); });
  await waitFor(() => expect(ports.finish).toHaveBeenCalled()); expect(result.current.jobs[0]?.state).toBe("uploading"); expect(ports.transfer).toHaveBeenCalledTimes(1); expect(started).toHaveBeenCalledTimes(1); expect(ready).not.toHaveBeenCalled();
  await act(async () => { finish(version); await operation; }); expect(result.current.jobs).toEqual([]); expect(ready).toHaveBeenCalledWith(version);
});
it("missing local bytes preserve the import identity and mismatched reselect cannot resume it", async () => {
  ports.imports.mockResolvedValue([record]); const ready = vi.fn(); const { result } = renderHook(() => useProjectImports("creator", "project_one", ready)); await waitFor(() => expect(result.current.jobs[0]?.state).toBe("file-needed")); ports.command.mockResolvedValue({ ...command, sha256: "b".repeat(64) });
  await act(async () => { await result.current.choose(new File(["changed"], "private.png", { type: "image/png" }), command.id); }); expect(result.current.jobs[0]).toMatchObject({ id: command.id, state: "file-needed", reason: expect.stringContaining("different file") }); expect(ports.transfer).not.toHaveBeenCalled(); expect(ready).not.toHaveBeenCalled();
});
it("recovers completed remote bytes without local bytes after reload", async () => { ports.imports.mockResolvedValue([record]); ports.begin.mockResolvedValue({ record, offset: command.bytes }); const ready = vi.fn(); renderHook(() => useProjectImports("creator", "project_one", ready)); await waitFor(() => expect(ready).toHaveBeenCalledWith(version)); expect(ports.transfer).not.toHaveBeenCalled(); });
it("cancel aborts transport and a late completion cannot reattach a draft", async () => {
  let resolve = (): void => undefined; ports.transfer.mockReturnValue(new Promise<void>(done => { resolve = done; }));
  const ready = vi.fn(); const { result } = renderHook(() => useProjectImports("creator", "project_one", ready)); await waitFor(() => expect(ports.imports).toHaveBeenCalled()); let operation: Promise<void> = Promise.resolve(); act(() => { operation = result.current.choose(new File(["private"], "private.png", { type: "image/png" })); }); await waitFor(() => expect(ports.transfer).toHaveBeenCalled()); const id = result.current.jobs[0]?.id; if (!id) throw new Error("No upload"); await act(async () => { await result.current.cancel(id); resolve(); await operation; }); expect(result.current.jobs).toEqual([]); expect(ready).not.toHaveBeenCalled();
});
it("reconciles an uncertain server cancellation on reload before dropping its checkpoint", async () => { ports.imports.mockResolvedValue([{ ...record, state: "cancelled" }]); ports.begin.mockResolvedValue({ record: { ...record, state: "cancelled" }, offset: 0 }); renderHook(() => useProjectImports("creator", "project_one", vi.fn())); await waitFor(() => expect(ports.cancel).toHaveBeenCalledWith("project_one", command.id, command)); expect(ports.finish).not.toHaveBeenCalled(); expect(ports.transfer).not.toHaveBeenCalled(); });
it("resumes audio with the original identity and canonical type, then publishes only verified audio", async () => {
 const audioCommand = ImportCommandSchema.parse({ ...command, contentType: "audio/mp4", filename: "Track.m4a" });
 const audioRecord = ImportRecordSchema.parse({ ...record, ...audioCommand, storagePath: "users/creator/previews/audio/track.m4a" });
 const audioVersion = MediaVersionSchema.parse({ ...version, kind: "audio", label: audioCommand.filename, object: { identity: "verified", assetId: "audio", storagePath: audioRecord.storagePath, generation: "1", sha256: audioCommand.sha256, bytes: audioCommand.bytes }, metadata: { state: "verified", durationSeconds: 2, audio: "present", probeVersion: "controlled-audio" } });
 ports.imports.mockResolvedValue([audioRecord]); ports.begin.mockResolvedValue({ record: audioRecord, uploadUrl: "https://storage.googleapis.com/resume", offset: 0 }); ports.command.mockResolvedValue(audioCommand); ports.finish.mockResolvedValue(audioVersion);
 const ready = vi.fn(); const { result } = renderHook(() => useProjectImports("creator", "project_one", ready)); await waitFor(() => expect(result.current.jobs[0]?.state).toBe("file-needed"));
 await act(async () => { await result.current.choose(new File(["private"], "Track.m4a", { type: "audio/x-m4a" }), audioCommand.id); });
 expect(ports.transfer).toHaveBeenCalledWith("creator", expect.any(String), expect.any(Blob), 0, expect.any(AbortSignal), expect.any(Function), "audio/mp4"); expect(ready).toHaveBeenCalledWith(audioVersion); expect(result.current.jobs).toEqual([]);
});
