import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImportCommandSchema, type ImportCommand } from "@shared/schemas/workflow/import.schemas";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { WorkflowApi, WorkflowApiError } from "@/features/project-workspace/api";
import { ImportCheckpointStore } from "../api/ImportCheckpointStore";
import { fingerprint, importCommand, transferImport } from "../api/importTransfer";

export interface ImportJob { id: string; filename: string; state: "uploading" | "failed" | "unsupported" | "file-needed"; progress: number; command?: ImportCommand; preview?: string; reason?: string; }
export interface ProjectImportsController {
  jobs: ImportJob[]; warning: string | undefined;
  choose(file: File, resumeId?: string, onStarted?: (id: string) => void): Promise<void>;
  retry(id: string): Promise<void>;
  cancel(id: string): Promise<boolean>;
  forgetRejected(id: string): void;
}
export function useProjectImports(ownerId: string, projectId: string, onReady: (version: MediaVersion) => void): ProjectImportsController {
  const api = useMemo(() => new WorkflowApi(undefined, ownerId), [ownerId]);
  const store = useMemo(() => new ImportCheckpointStore(), []);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [warning, setWarning] = useState<string>();
  const files = useRef(new Map<string, Blob>());
  const commands = useRef(new Map<string, ImportCommand>());
  const active = useRef(new Map<string, AbortController>());
  const cancelled = useRef(new Set<string>());
  const previews = useRef(new Map<string, string>());
  const mounted = useRef(true);
  const readyRef = useRef(onReady); readyRef.current = onReady;
  const update = useCallback((job: ImportJob): void => { if (mounted.current) setJobs(rows => [...rows.filter(row => row.id !== job.id), job]); }, []);
  const remove = useCallback((id: string): void => { if (mounted.current) setJobs(rows => rows.filter(row => row.id !== id)); files.current.delete(id); commands.current.delete(id); const preview = previews.current.get(id); if (preview) URL.revokeObjectURL(preview); previews.current.delete(id); }, []);
  const cleanCheckpoint = useCallback(async (id: string): Promise<void> => { try { await store.remove(ownerId, projectId, id); } catch { /* Server identity remains authoritative on reload. */ } }, [ownerId, projectId, store]);
  const run = useCallback(async (command: ImportCommand, blob?: Blob): Promise<void> => {
    if (active.current.has(command.id) || cancelled.current.has(command.id)) return;
    const abort = new AbortController(); active.current.set(command.id, abort); commands.current.set(command.id, command);
    if (blob) files.current.set(command.id, blob);
    const preview = blob ? URL.createObjectURL(blob) : undefined;
    const previousPreview = previews.current.get(command.id); if (previousPreview) URL.revokeObjectURL(previousPreview);
    if (preview) previews.current.set(command.id, preview);
    const job: ImportJob = { id: command.id, filename: command.filename, state: "uploading", progress: 0, command, ...(preview ? { preview } : {}) };
    update(job);
    try {
      const session = await api.beginImport(projectId, command, abort.signal);
      abort.signal.throwIfAborted();
      if (session.record.state === "cancelled") { await api.cancelImport(projectId, command.id, command); cancelled.current.add(command.id); remove(command.id); await cleanCheckpoint(command.id); return; }
      if (session.record.state === "rejected") { update({ ...job, state: "unsupported", reason: session.record.reason ?? "This file isn't supported." }); return; }
      if (session.offset < command.bytes) {
        if (!blob) { update({ ...job, state: "file-needed" }); return; }
        if (blob.size !== command.bytes || await fingerprint(blob) !== command.sha256) { update({ ...job, state: "file-needed", reason: "Choose the original file. The bytes do not match." }); return; }
        if (!session.uploadUrl) throw new Error("Upload interrupted");
        await transferImport(ownerId, session.uploadUrl, blob, session.offset, abort.signal, progress => update({ ...job, progress }), { contentType: command.contentType, reconcileOffset: async () => (await api.beginImport(projectId, command, abort.signal)).offset });
      }
      const version = await api.finishImport(projectId, command.id, abort.signal);
      if (!abort.signal.aborted && !cancelled.current.has(command.id) && mounted.current) { readyRef.current(version); remove(command.id); await cleanCheckpoint(command.id); }
    } catch (error) {
      if (!abort.signal.aborted && mounted.current && !cancelled.current.has(command.id)) update({ ...job, state: error instanceof WorkflowApiError && error.status === 422 ? "unsupported" : "failed", ...(error instanceof WorkflowApiError ? { reason: error.message } : {}) });
    } finally { if (active.current.get(command.id) === abort) active.current.delete(command.id); }
  }, [api, ownerId, projectId, update, remove, cleanCheckpoint]);
  useEffect(() => {
    mounted.current = true;
    const abort = new AbortController();
    void Promise.allSettled([api.imports(projectId, abort.signal), store.list(ownerId, projectId)]).then(results => {
      if (abort.signal.aborted) return;
      const remote = results[0].status === "fulfilled" ? results[0].value : [];
      const local = results[1].status === "fulfilled" ? results[1].value : [];
      if (results[0].status === "rejected") setWarning("Pending uploads could not load. Reopen this project to retry.");
      if (results[1].status === "rejected") setWarning("Device storage is unavailable. Keep this tab open until uploads finish.");
      const pending = new Map(local.map(checkpoint => [checkpoint.command.id, { command: checkpoint.command, blob: checkpoint.blob }]));
      for (const record of remote) if (!pending.has(record.id)) pending.set(record.id, { command: ImportCommandSchema.strip().parse(record), blob: undefined });
      for (const entry of pending.values()) void run(entry.command, entry.blob);
    });
    const controllers = active.current; const urls = previews.current;
    return () => { mounted.current = false; abort.abort(); controllers.forEach(controller => controller.abort()); controllers.clear(); urls.forEach(url => URL.revokeObjectURL(url)); urls.clear(); };
  }, [api, store, ownerId, projectId, run]);
  const choose = async (file: File, resumeId?: string, onStarted?: (id: string) => void): Promise<void> => {
    const previous = resumeId ? commands.current.get(resumeId) : undefined;
    const pendingId = resumeId ?? `import_${crypto.randomUUID()}`;
    update({ id: pendingId, filename: file.name, state: "uploading", progress: 0 });
    if (!resumeId) onStarted?.(pendingId);
    let command: ImportCommand;
    try {
      command = await importCommand(file);
      command = { ...command, id: pendingId };
      if (previous) {
        if (command.sha256 !== previous.sha256 || command.bytes !== previous.bytes || command.contentType !== previous.contentType) { update({ id: previous.id, filename: previous.filename, state: "file-needed", progress: 0, command: previous, reason: "This is a different file. Choose the original file to resume it." }); return; }
        command = previous;
      }
    } catch { update({ id: pendingId, filename: file.name, state: "unsupported", progress: 0, reason: file.type.startsWith("audio/") ? "Choose MP3, WAV, OGG or M4A audio, up to 100 MB and five minutes." : "Choose PNG, JPEG or WebP (up to 10 MB), MP4 or WebM (up to 500 MB), or MP3, WAV, OGG or M4A audio (up to 100 MB and five minutes)." }); return; }
    if (resumeId && resumeId !== command.id) remove(resumeId);
    if (cancelled.current.has(command.id)) return;
    try { await store.save(ownerId, projectId, command, file); }
    catch { setWarning("This file could not be kept on this device. Keep this tab open until the upload finishes."); }
    await run(command, file);
  };
  return { jobs, warning, choose, forgetRejected: id => { if (jobs.some(job => job.id === id && job.state === "unsupported")) { remove(id); void cleanCheckpoint(id); } }, retry: async id => { const command = commands.current.get(id); if (command) await run(command, files.current.get(id)); }, cancel: async id => {
    const command = commands.current.get(id);
    active.current.get(id)?.abort();
    try {
      if (command) await api.cancelImport(projectId, id, command);
      cancelled.current.add(id); remove(id); await cleanCheckpoint(id); return true;
    } catch (error) { const current = jobs.find(job => job.id === id); if (current) update({ ...current, state: "failed", reason: error instanceof Error ? error.message : "Cancellation was not confirmed. Retry when connected." }); return false; }
  } };
}
