import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { CreateVideoExportSchema, EditCommandSchema, type EditCommand, type VideoCaptionValidationDetails, type VideoComposition, type VideoEdit, type VideoExport } from "@shared/schemas/workflow/video-edit.schemas";
import { VideoEditorApi, type ExportEnvelope } from "../api/videoEditorApi";
import { VideoCaptionValidationError } from "../api/VideoCaptionValidationError";
import { WorkflowApiError } from "@/features/project-workspace/api/workflowApi";
import { EMPTY_COMPOSITION } from "../state/editorState";

const PendingChangeSchema = z.strictObject({ editId: z.string(), revision: z.number().int().positive(), operationId: z.string(), command: EditCommandSchema });
const PendingExportSchema = z.strictObject({ editId: z.string(), envelope: CreateVideoExportSchema });
export type PendingChange = z.infer<typeof PendingChangeSchema>;
interface PendingExport { editId: string; envelope: ExportEnvelope; }
type CheckpointKind = "change" | "export";
const SCOPE_PREFIX = "vidra.video-editor.v1:";
function editorScope(ownerId: string, projectId: string): string { return `${SCOPE_PREFIX}${encodeURIComponent(ownerId)}:${encodeURIComponent(projectId)}`; }
function readCheckpoint<T extends z.ZodType>(key: string, schema: T): z.output<T> | undefined { try { const value: unknown = JSON.parse(localStorage.getItem(key) ?? "null"); const result = schema.safeParse(value); return result.success ? result.data : undefined; } catch { return undefined; } }
function checkpointKey(scope: string, kind: CheckpointKind, editId?: string): string { return editId === undefined ? `${scope}:${kind}` : `${scope}:edit:${encodeURIComponent(editId)}:${kind}`; }
function sameCheckpoint<T extends z.ZodType>(raw: string | null, schema: T, value: z.output<T>): boolean {
  if (raw === null) return false;
  try { const result = schema.safeParse(JSON.parse(raw)); return result.success && JSON.stringify(result.data) === JSON.stringify(value); } catch { return false; }
}
/** Keep a conflicting or unwritable legacy record until it can be recovered separately. */
function migrateCheckpoint<T extends z.ZodType<{ editId: string }>>(scope: string, kind: CheckpointKind, schema: T): void {
  const legacyKey = checkpointKey(scope, kind);
  try {
    const raw = localStorage.getItem(legacyKey); if (raw === null) return;
    const value = schema.safeParse(JSON.parse(raw)); if (!value.success) return;
    const destination = checkpointKey(scope, kind, value.data.editId); const existing = localStorage.getItem(destination);
    if (existing !== null && !sameCheckpoint(existing, schema, value.data)) return;
    if (existing === null) localStorage.setItem(destination, raw);
    if (sameCheckpoint(localStorage.getItem(destination), schema, value.data) && localStorage.getItem(legacyKey) === raw) localStorage.removeItem(legacyKey);
  } catch { /* The original remains readable if storage is unavailable. */ }
}
function pendingForEdit<T extends z.ZodType<{ editId: string }>>(scope: string, kind: CheckpointKind, editId: string, schema: T): z.output<T> | undefined {
  migrateCheckpoint(scope, kind, schema);
  const value = readCheckpoint(checkpointKey(scope, kind, editId), schema);
  if (value?.editId === editId) return value;
  const legacy = readCheckpoint(checkpointKey(scope, kind), schema); return legacy?.editId === editId ? legacy : undefined;
}
function recoveryEditId(scope: string): string | undefined {
  migrateCheckpoint(scope, "change", PendingChangeSchema); migrateCheckpoint(scope, "export", PendingExportSchema);
  const legacy = readCheckpoint(checkpointKey(scope, "change"), PendingChangeSchema) ?? readCheckpoint(checkpointKey(scope, "export"), PendingExportSchema);
  if (legacy) return legacy.editId;
  try {
    const prefix = `${scope}:edit:`;
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter((key): key is string => Boolean(key?.startsWith(prefix))).sort();
    for (const key of keys) {
      const value = key.endsWith(":change") ? readCheckpoint(key, PendingChangeSchema) : key.endsWith(":export") ? readCheckpoint(key, PendingExportSchema) : undefined;
      if (value && key === checkpointKey(scope, key.endsWith(":change") ? "change" : "export", value.editId)) return value.editId;
    }
  } catch { /* Loading an edit does not require working device storage. */ }
  return undefined;
}
/** Sign-out reads every project's unconfirmed saves and export acceptances while no editor is open. Storage failures throw. */
export function hasUnconfirmedVideoEdits(ownerId: string): boolean {
  const prefix = `${SCOPE_PREFIX}${encodeURIComponent(ownerId)}:`;
  const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter((key): key is string => Boolean(key?.startsWith(prefix)));
  return keys.some(key => key.endsWith(":change") ? readCheckpoint(key, PendingChangeSchema) !== undefined : key.endsWith(":export") ? readCheckpoint(key, PendingExportSchema) !== undefined : false);
}
function writeCheckpoint<T extends z.ZodType<{ editId: string }>>(scope: string, kind: CheckpointKind, schema: T, value: z.output<T>): "saved" | "conflict" | "unavailable" {
  try {
    const key = checkpointKey(scope, kind, value.editId); const raw = localStorage.getItem(key);
    if (raw !== null && !sameCheckpoint(raw, schema, value)) return "conflict";
    localStorage.setItem(key, JSON.stringify(value)); return sameCheckpoint(localStorage.getItem(key), schema, value) ? "saved" : "unavailable";
  } catch { return "unavailable"; }
}
function clearCheckpoint<T extends z.ZodType<{ editId: string }>>(scope: string, kind: CheckpointKind, schema: T, value: z.output<T>): z.output<T> | undefined {
  try {
    for (const key of [checkpointKey(scope, kind, value.editId), checkpointKey(scope, kind)]) {
      const raw = localStorage.getItem(key);
      if (sameCheckpoint(raw, schema, value) && localStorage.getItem(key) === raw) localStorage.removeItem(key);
    }
  } catch { /* Keep any unconfirmed device record for its exact retry. */ }
  return pendingForEdit(scope, kind, value.editId, schema);
}
function errorMessage(failure: unknown): string { return failure instanceof Error ? failure.message : "The server could not confirm this change. Your edit is retained."; }
function captionValidationForEdit(validation: VideoCaptionValidationDetails | undefined, edit: VideoEdit | undefined): VideoCaptionValidationDetails | undefined { return validation && edit?.id === validation.editId && edit.ownerId === validation.ownerId && edit.projectId === validation.projectId && edit.revision === validation.revision ? validation : undefined; }
const RUNNING = new Set<VideoExport["state"]>(["queued", "rendering", "cancel_requested", "storing", "linking"]);
interface EditorSelection { scope: string; requestedId: string | undefined; reloadKey: number; generation: number; editId?: string; busyOperation?: symbol; }
interface EditorState {
  selection: EditorSelection; edit?: VideoEdit; exports: VideoExport[]; history: VideoEdit[];
  loading: boolean; busy: boolean; error?: string | undefined; observationLost: boolean;
  captionValidation?: VideoCaptionValidationDetails | undefined;
  pending?: PendingChange | undefined; pendingExport?: PendingExport | undefined; past: VideoComposition[]; future: VideoComposition[];
}
function emptyState(selection: EditorSelection): EditorState { return { selection, exports: [], history: [], loading: true, busy: false, observationLost: false, past: [], future: [] }; }

export function useVideoEditor(ownerId: string, projectId: string, initialEditId?: string): {
  api: VideoEditorApi; edit: VideoEdit | undefined; exports: VideoExport[]; history: VideoEdit[]; loading: boolean; busy: boolean; error: string | undefined;
  pending: boolean; pendingExport: boolean; canUndo: boolean; canRedo: boolean;
  observationLost: boolean;
  pendingChange: PendingChange | undefined;
  captionValidation?: VideoCaptionValidationDetails | undefined;
  command(command: EditCommand, identity?: { operationId: string; expectedRevision: number }): Promise<boolean>; retryChange(): Promise<boolean>; reload(): void; loadHistory(): Promise<void>;
  undo(): Promise<void>; redo(): Promise<void>; exportEdit(retryOf?: VideoExport): Promise<void>; retryExportAcceptance(): Promise<void>;
  cancelExport(id: string): Promise<void>; checkExport(id: string): Promise<void>; clearError(): void;
} {
  const api = useMemo(() => new VideoEditorApi(ownerId, projectId), [ownerId, projectId]);
  const scope = editorScope(ownerId, projectId);
  const [reloadKey, setReloadKey] = useState(0);
  const selectionRef = useRef<EditorSelection>({ scope, requestedId: initialEditId, reloadKey, generation: 0 });
  const previous = selectionRef.current;
  if (previous.scope !== scope || previous.requestedId !== initialEditId || previous.reloadKey !== reloadKey) {
    // The host writes the edit just loaded into the URL; that is the same selection.
    if (previous.scope === scope && previous.reloadKey === reloadKey && initialEditId !== undefined && previous.editId === initialEditId) previous.requestedId = initialEditId;
    else selectionRef.current = { scope, requestedId: initialEditId, reloadKey, generation: previous.generation + 1 };
  }
  const selection = selectionRef.current;
  const [storedState, setState] = useState<EditorState>(() => emptyState(selection));
  const state = storedState.selection === selection ? storedState : emptyState(selection);
  const stateRef = useRef(state); stateRef.current = state;
  const createId = useRef(`edit_${crypto.randomUUID()}`); const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const isActive = useCallback((target: EditorSelection): boolean => mounted.current && selectionRef.current === target, []);
  const update = useCallback((target: EditorSelection, change: (current: EditorState) => EditorState): void => {
    if (!isActive(target)) return;
    setState(current => isActive(target) ? change(current.selection === target ? current : emptyState(target)) : current);
  }, [isActive]);
  const matchingEdit = useCallback((target: EditorSelection, result: VideoEdit): boolean => result.ownerId === ownerId && result.projectId === projectId && (target.editId === undefined ? target.requestedId === undefined || result.id === target.requestedId : result.id === target.editId), [ownerId, projectId]);
  const matchingExport = useCallback((target: EditorSelection, result: VideoExport): boolean => result.ownerId === ownerId && result.projectId === projectId && result.editId === target.editId, [ownerId, projectId]);
  const updateExport = useCallback((target: EditorSelection, result: VideoExport): void => {
    if (!matchingExport(target, result)) throw new Error("The export belongs to different work or another account.");
    update(target, current => ({ ...current, exports: [...current.exports.filter(row => row.id !== result.id), result].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }));
  }, [matchingExport, update]);
  const begin = useCallback((target: EditorSelection): symbol | undefined => {
    if (!isActive(target) || target.busyOperation) return undefined;
    const operation = Symbol("editor-operation"); target.busyOperation = operation;
    update(target, current => ({ ...current, busy: true, error: undefined })); return operation;
  }, [isActive, update]);
  const finish = useCallback((target: EditorSelection, operation: symbol): void => {
    if (target.busyOperation !== operation) return; delete target.busyOperation;
    update(target, current => ({ ...current, busy: false }));
  }, [update]);
  useEffect(() => {
    const abort = new AbortController(); const requestedId = selection.requestedId ?? recoveryEditId(scope);
    update(selection, () => emptyState(selection));
    void (async (): Promise<void> => {
      try {
        const [edits, jobs] = await Promise.all([api.list(abort.signal), api.exports(abort.signal)]);
        if (abort.signal.aborted || !isActive(selection)) return;
        if (edits.some(row => row.ownerId !== ownerId || row.projectId !== projectId) || jobs.some(row => row.ownerId !== ownerId || row.projectId !== projectId)) throw new Error("The editor response belongs to different work or another account.");
        const chosen = requestedId ? await api.get(requestedId, abort.signal) : [...edits].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? await api.create(createId.current, EMPTY_COMPOSITION);
        if (abort.signal.aborted || !isActive(selection)) return;
        if (!matchingEdit(selection, chosen) || (requestedId !== undefined && chosen.id !== requestedId)) throw new Error("The edit belongs to different work or another account.");
        selection.editId = chosen.id;
        const pending = pendingForEdit(scope, "change", chosen.id, PendingChangeSchema); const pendingExport = pendingForEdit(scope, "export", chosen.id, PendingExportSchema);
        update(selection, current => ({ ...current, edit: chosen, exports: jobs.filter(row => row.editId === chosen.id), pending, pendingExport }));
      } catch (failure) { if (!abort.signal.aborted) update(selection, current => ({ ...current, error: errorMessage(failure) })); }
      finally { if (!abort.signal.aborted) update(selection, current => ({ ...current, loading: false })); }
    })();
    return () => { abort.abort(); };
  }, [api, selection, scope, ownerId, projectId, isActive, matchingEdit, update]);
  const runningIds = state.exports.filter(job => RUNNING.has(job.state)).map(job => job.id).join("|");
  useEffect(() => {
    if (!runningIds) return; let active = true;
    const poll = async (): Promise<void> => {
      const ids = runningIds.split("|"); const results = await Promise.allSettled(ids.map(id => api.export(id)));
      if (!active || !isActive(selection)) return;
      const lost = results.some((result, index) => result.status === "rejected" || result.value.id !== ids[index] || !matchingExport(selection, result.value));
      update(selection, current => ({ ...current, observationLost: lost, ...(lost ? { error: "Export status could not refresh. Check status to reconnect to the same export." } : {}) }));
      for (const [index, result] of results.entries()) if (result.status === "fulfilled" && result.value.id === ids[index] && matchingExport(selection, result.value)) updateExport(selection, result.value);
    };
    const timer = window.setInterval(() => { void poll(); }, 1500);
    return () => { active = false; window.clearInterval(timer); };
  }, [api, selection, runningIds, isActive, matchingExport, update, updateExport]);
  const runChange = useCallback(async (target: EditorSelection, change: PendingChange, remember: boolean): Promise<boolean> => {
    if (target.scope !== scope || target.editId !== change.editId) return false;
    const token = begin(target); if (!token) return false; const before = stateRef.current.edit;
    try {
      const next = await api.command(change.editId, change.revision, change.operationId, change.command);
      if (!isActive(target)) return false;
      if (!matchingEdit(target, next)) throw new Error("The saved edit belongs to different work or another account.");
      const pending = clearCheckpoint(scope, "change", PendingChangeSchema, change);
      update(target, current => ({ ...current, edit: next, pending, captionValidation: undefined, ...(remember && before ? { past: [...current.past, before.composition], future: [] } : {}) })); return true;
    } catch (failure) { update(target, current => ({ ...current, error: errorMessage(failure) })); return false; }
    finally { finish(target, token); }
  }, [api, scope, begin, finish, isActive, matchingEdit, update]);
  const command = useCallback(async (next: EditCommand, identity?: { operationId: string; expectedRevision: number }): Promise<boolean> => {
    const target = selection; const snapshot = stateRef.current; const current = snapshot.edit;
    if (!isActive(target) || target.scope !== scope || snapshot.selection !== target || !current || snapshot.loading || target.busyOperation || snapshot.pending) return false;
    const change = PendingChangeSchema.parse({ editId: current.id, revision: identity?.expectedRevision ?? current.revision, operationId: identity?.operationId ?? `operation_${crypto.randomUUID()}`, command: next });
    const captured = writeCheckpoint(scope, "change", PendingChangeSchema, change);
    if (captured === "conflict") { update(target, value => ({ ...value, pending: pendingForEdit(scope, "change", current.id, PendingChangeSchema), error: "Another saved operation is waiting for this edit. Retry saving it first." })); return false; }
    if (captured === "unavailable") { update(target, value => ({ ...value, error: "This change could not start because its recovery copy could not be saved on this device. Try again when device storage is available." })); return false; }
    update(target, value => ({ ...value, pending: change })); return runChange(target, change, true);
  }, [selection, scope, isActive, runChange, update]);
  const moveHistory = async (direction: "undo" | "redo"): Promise<void> => {
    const target = selection; const snapshot = stateRef.current; const current = snapshot.edit; const composition = (direction === "undo" ? snapshot.past : snapshot.future).at(-1);
    if (!isActive(target) || target.scope !== scope || snapshot.selection !== target || !current || !composition || target.busyOperation || snapshot.pending) return;
    const change: PendingChange = { editId: current.id, revision: current.revision, operationId: `operation_${crypto.randomUUID()}`, command: { kind: "replace_composition", composition } };
    const captured = writeCheckpoint(scope, "change", PendingChangeSchema, change);
    if (captured === "conflict") { update(target, value => ({ ...value, pending: pendingForEdit(scope, "change", current.id, PendingChangeSchema), error: "Another saved operation is waiting for this edit. Retry saving it first." })); return; }
    if (captured === "unavailable") { update(target, value => ({ ...value, error: "This change could not start because its recovery copy could not be saved on this device. Try again when device storage is available." })); return; }
    update(target, value => ({ ...value, pending: change })); const saved = await runChange(target, change, false);
    if (saved) update(target, value => direction === "undo" ? { ...value, past: value.past.slice(0, -1), future: [...value.future, current.composition] } : { ...value, future: value.future.slice(0, -1), past: [...value.past, current.composition] });
  };
  const submitExport = async (target: EditorSelection, submission: PendingExport): Promise<void> => {
    if (target.scope !== scope || target.editId !== submission.editId) return;
    const token = begin(target); if (!token) return;
    try {
      const job = await api.startExport(submission.editId, submission.envelope);
      if (!isActive(target)) return;
      if (!matchingExport(target, job) || job.submissionId !== submission.envelope.submissionId || job.executionDraftId !== submission.envelope.executionDraftId || job.executionDraftRevision !== submission.envelope.executionDraftRevision || job.revision !== submission.envelope.revision || job.composition.preset !== submission.envelope.preset) throw new Error("The export receipt does not match its captured edit.");
      updateExport(target, job); const pendingExport = clearCheckpoint(scope, "export", PendingExportSchema, submission);
      update(target, current => ({ ...current, pendingExport, ...(current.edit?.revision === submission.envelope.revision ? { captionValidation: undefined } : {}) }));
    } catch (failure) {
      if (!isActive(target)) return;
      const rejected = failure instanceof WorkflowApiError && [400, 403, 404, 422].includes(failure.status);
      const pendingExport = rejected ? clearCheckpoint(scope, "export", PendingExportSchema, submission) : undefined;
      if (failure instanceof VideoCaptionValidationError) {
        const details = failure.details;
        if (details.ownerId !== ownerId || details.projectId !== projectId || details.editId !== submission.editId || details.revision !== submission.envelope.revision) { update(target, current => ({ ...current, pendingExport, error: "The caption validation response does not match the captured edit." })); return; }
        update(target, current => {
          const activeEdit = current.edit;
          if (!activeEdit || activeEdit.id !== details.editId || activeEdit.ownerId !== details.ownerId || activeEdit.projectId !== details.projectId || activeEdit.revision !== details.revision) return { ...current, pendingExport };
          if (details.issues.some(issue => !activeEdit.composition.text.some(caption => caption.id === issue.elementId))) return { ...current, pendingExport, error: "The caption validation response does not match the captured captions." };
          return { ...current, pendingExport, captionValidation: details, error: undefined };
        }); return;
      }
      update(target, current => ({ ...current, error: errorMessage(failure), ...(rejected ? { pendingExport } : {}) }));
    } finally { finish(target, token); }
  };
  const exportEdit = async (retryOf?: VideoExport): Promise<void> => {
    const target = selection; const snapshot = stateRef.current; const current = snapshot.edit;
    if (!isActive(target) || target.scope !== scope || snapshot.selection !== target || !current || snapshot.loading || target.busyOperation || snapshot.pending || snapshot.pendingExport || (retryOf && !matchingExport(target, retryOf)) || (!retryOf && (current.issues.length || !current.composition.items.length || captionValidationForEdit(snapshot.captionValidation, current)))) return;
    const submission = { editId: retryOf?.editId ?? current.id, envelope: CreateVideoExportSchema.parse({ submissionId: `submission_${crypto.randomUUID()}`, executionDraftId: `draft_${crypto.randomUUID()}`, executionDraftRevision: 1, revision: retryOf?.revision ?? current.revision, preset: retryOf?.composition.preset ?? current.composition.preset, ...(retryOf ? { retryOf: retryOf.id } : {}) }) };
    const captured = writeCheckpoint(scope, "export", PendingExportSchema, submission);
    if (captured === "conflict") { update(target, value => ({ ...value, pendingExport: pendingForEdit(scope, "export", current.id, PendingExportSchema), error: "Another export is waiting for acceptance for this edit. Check its acceptance first." })); return; }
    if (captured === "unavailable") { update(target, value => ({ ...value, error: "This export could not start because its recovery copy could not be saved on this device. Try again when device storage is available." })); return; }
    update(target, value => ({ ...value, pendingExport: submission })); await submitExport(target, submission);
  };
  const observeExport = async (id: string, cancel: boolean): Promise<void> => {
    const target = selection; if (!isActive(target) || stateRef.current.selection !== target || target.scope !== scope || !target.editId) return;
    try {
      const job = await (cancel ? api.cancel(id) : api.export(id));
      if (!isActive(target)) return;
      if (job.id !== id) throw new Error("The export response does not match the requested export.");
      updateExport(target, job);
      if (!cancel) update(target, current => ({ ...current, observationLost: false, error: undefined }));
    } catch (failure) { update(target, current => ({ ...current, error: errorMessage(failure) })); }
  };
  const captionValidation = captionValidationForEdit(state.captionValidation, state.edit);
  return { api, edit: state.edit, exports: state.exports, history: state.history, loading: state.loading, busy: state.busy, error: state.error, observationLost: state.observationLost, captionValidation, pending: Boolean(state.pending), pendingChange: state.pending, pendingExport: Boolean(state.pendingExport), canUndo: state.past.length > 0 && !state.busy && !state.pending, canRedo: state.future.length > 0 && !state.busy && !state.pending,
    command, retryChange: async () => { const current = stateRef.current; return isActive(selection) && current.selection === selection && current.pending ? runChange(selection, current.pending, true) : false; }, reload: () => { if (isActive(selection) && stateRef.current.selection === selection) setReloadKey(value => value + 1); },
    loadHistory: async () => {
      const target = selection; const current = stateRef.current;
      if (!isActive(target) || target.scope !== scope || current.selection !== target || !current.edit) return;
      try { const history = await api.revisions(current.edit.id); if (!isActive(target)) return; if (history.some(row => !matchingEdit(target, row))) throw new Error("The history belongs to different work or another account."); update(target, value => ({ ...value, history })); }
      catch (failure) { update(target, value => ({ ...value, error: errorMessage(failure) })); }
    },
    undo: () => moveHistory("undo"), redo: () => moveHistory("redo"), exportEdit,
    retryExportAcceptance: async () => { const current = stateRef.current; if (isActive(selection) && current.selection === selection && current.pendingExport) await submitExport(selection, current.pendingExport); },
    cancelExport: id => observeExport(id, true), checkExport: id => observeExport(id, false), clearError: () => { if (isActive(selection) && stateRef.current.selection === selection) update(selection, current => ({ ...current, error: undefined })); } };
}
export type VideoEditorController = ReturnType<typeof useVideoEditor>;
