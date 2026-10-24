import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { ProjectSketchCaptureCommandSchema, type ProjectSketchCaptureCommand } from "@shared/schemas/workflow/sketch.schemas";
import type { SketchSettings } from "@/features/realtime-sketch/config/constants";
import type { LiveOutput } from "@/features/realtime-sketch/hooks/generationReducer";
import { acceptProjectSketch } from "../api/projectSketchApi";
import { SketchCheckpointStore, type SketchCheckpoint } from "../api/SketchCheckpointStore";

export function useProjectSketchCapture({ ownerId, projectId, settings, onAccepted }: { ownerId: string; projectId: string; settings: SketchSettings; onAccepted(version: MediaVersion): void }): {
  loaded: boolean; restore?: SketchCheckpoint; chooseRestore(): void; chooseBlank(): void; initialDrawing: string | undefined;
  checkpoint(dataUri: string): void; retainBeforeClose(): Promise<boolean>; recoveredSettings: SketchSettings | undefined; localError: string | undefined;
  saving: boolean; pending: ProjectSketchCaptureCommand | undefined; saved: MediaVersion | undefined; saveError: string | undefined; save(output?: LiveOutput): Promise<void>;
} {
  const store = useMemo(() => new SketchCheckpointStore(), []);
  const key = `${ownerId}:${projectId}`;
  const [loaded, setLoaded] = useState(false);
  const [restore, setRestore] = useState<SketchCheckpoint>();
  const [initialDrawing, setInitialDrawing] = useState<string>();
  const [recoveredSettings, setRecoveredSettings] = useState<SketchSettings>();
  const [localError, setLocalError] = useState<string>();
  const [pending, setPending] = useState<ProjectSketchCaptureCommand>();
  const [saved, setSaved] = useState<MediaVersion>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const row = useRef<SketchCheckpoint>({ key, inputs: settings });
  const chosen = useRef(false);
  const flight = useRef<Promise<void>>();
  const callbacks = useRef(onAccepted); callbacks.current = onAccepted;
  const alive = useRef(true);
  const scope = useRef(key); scope.current = key;
  const session = useRef(crypto.randomUUID());
  const captures = useRef(new Map<string, ProjectSketchCaptureCommand>());
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  const retainBeforeClose = useCallback(async (): Promise<boolean> => {
    if (!chosen.current) return true;
    try {
      for (;;) {
        if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = undefined; }
        const captured = row.current;
        await store.save(captured);
        if (row.current === captured) return true;
      }
    } catch { if (alive.current) setLocalError("This drawing could not be saved on this device. Keep this tab open."); return false; }
  }, [store]);

  useEffect(() => {
    alive.current = true;
    let current = true;
    void store.read(key).then(checkpoint => {
      if (!current) return;
      if (checkpoint?.saved && (checkpoint.saved.ownerId !== ownerId || checkpoint.saved.projectId !== projectId)) throw new Error("This checkpoint belongs to different work.");
      if (checkpoint) { row.current = checkpoint; setRestore(checkpoint.drawingDataUri ? checkpoint : undefined); setPending(checkpoint.pending); setSaved(checkpoint.saved); }
      if (!checkpoint?.drawingDataUri) chosen.current = true;
      setLoaded(true);
    }).catch((error: unknown) => { if (current) { chosen.current = true; setLoaded(true); setLocalError(error instanceof Error ? error.message : "Drawing recovery is unavailable. Keep this tab open."); } });
    return () => { alive.current = false; current = false; if (saveTimer.current) void retainBeforeClose(); };
  }, [store, key, ownerId, projectId, retainBeforeClose]);

  const persist = useCallback((): void => {
    if (!chosen.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void retainBeforeClose(); }, 250);
  }, [retainBeforeClose]);
  useEffect(() => { row.current = { ...row.current, inputs: settings }; if (loaded) persist(); }, [settings, loaded, persist]);
  const checkpoint = useCallback((dataUri: string): void => { if (!chosen.current) return; row.current = { ...row.current, drawingDataUri: dataUri }; persist(); }, [persist]);
  const chooseRestore = useCallback((): void => { if (!restore) return; chosen.current = true; setInitialDrawing(restore.drawingDataUri); setRecoveredSettings(restore.inputs); setRestore(undefined); }, [restore]);
  const chooseBlank = useCallback((): void => { chosen.current = true; setRestore(undefined); setInitialDrawing(undefined); row.current = { ...row.current, drawingDataUri: undefined }; persist(); }, [persist]);
  const save = useCallback((output?: LiveOutput): Promise<void> => {
    if (flight.current) return flight.current;
    const displayedFrameId = output ? `${session.current}:${output.requestId}` : undefined;
    let command = output && displayedFrameId ? captures.current.get(displayedFrameId) : undefined;
    // A failed or reopened save always repairs its captured press, even if preview advanced.
    if (row.current.pending && !row.current.saved) command = row.current.pending;
    if (!command && output && displayedFrameId) {
      command = ProjectSketchCaptureCommandSchema.parse({ captureId: `capture_${crypto.randomUUID()}`, displayedFrameId, displayedAt: new Date(output.at).toISOString(), outputDataUri: output.imageUrl, drawingDataUri: output.sketchDataUri, inputs: output.inputs });
      captures.current.set(displayedFrameId, command);
    }
    if (!command) command = row.current.pending;
    if (!command) return Promise.resolve();
    if (row.current.saved?.origin.kind === "sketch-capture" && row.current.saved.origin.captureId === command.captureId) { setSaved(row.current.saved); setPending(command); return Promise.resolve(); }
    const captured = command;
    row.current = { ...row.current, pending: captured, saved: undefined };
    setPending(captured); setSaved(undefined); setSaving(true); setSaveError(undefined);
    const promise = (async (): Promise<void> => {
      try {
        // Keep the exact press durable before transport: reload and re-press reuse its ID.
        await store.save(row.current);
        const version = await acceptProjectSketch(ownerId, projectId, captured);
        row.current = { ...row.current, pending: captured, saved: version };
        setSaved(version);
        await store.save(row.current).catch(() => setLocalError("The picture is saved in the project. Device recovery could not be updated."));
        if (alive.current && scope.current === key) callbacks.current(version);
      } catch (error) { setSaveError(error instanceof Error ? error.message : "Saving was not confirmed. Retry this captured picture."); }
      finally { setSaving(false); flight.current = undefined; }
    })();
    flight.current = promise;
    return promise;
  }, [store, ownerId, projectId, key]);
  return { loaded, ...(restore ? { restore } : {}), chooseRestore, chooseBlank, initialDrawing, checkpoint, retainBeforeClose, recoveredSettings, localError, saving, pending, saved, saveError, save };
}
