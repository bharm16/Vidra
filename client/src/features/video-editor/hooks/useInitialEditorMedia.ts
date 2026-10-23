import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { OwnerIdSchema, ProjectIdSchema, EditIdSchema, VersionIdSchema } from "@shared/schemas/workflow/identity.schemas";
import { VideoBackgroundAudioSchema, VideoItemSchema } from "@shared/schemas/workflow/video-edit.schemas";
import { compositionFrames } from "@shared/video-edit/composition";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import type { VideoEditorController } from "./useVideoEditor";
import type { VideoSource } from "./useVideoSources";
import { createItem } from "../state/editorState";

const IntentSchema = z.strictObject({ ownerId: OwnerIdSchema, projectId: ProjectIdSchema, editId: EditIdSchema, versionId: VersionIdSchema, item: VideoItemSchema.optional(), audio: VideoBackgroundAudioSchema.optional(), lane: z.enum(["voiceover", "music"]).optional(), index: z.number().int().min(0).max(32), operationId: z.string().min(1), expectedRevision: z.number().int().positive(), state: z.enum(["pending", "handled"]) });
type Intent = z.infer<typeof IntentSchema>;
function readIntent(key: string): Intent | undefined { try { const parsed = IntentSchema.safeParse(JSON.parse(localStorage.getItem(key) ?? "null")); return parsed.success ? parsed.data : undefined; } catch { return undefined; } }
interface AdditionSelection { key: string; ownerId: string; projectId: string; editId: string | undefined; versionId: string | undefined; }

/** One explicit Add to video action retains its item and operation across lost replies. */
export function useInitialEditorMedia({ ownerId, projectId, versionId, lane = "music", media, sources, controller, onHandled }: { ownerId: string; projectId: string; versionId?: string | undefined; lane?: "voiceover" | "music"; media: MediaVersion[]; sources: Record<string, VideoSource>; controller: VideoEditorController; onHandled?: (() => void) | undefined }): { error: string | undefined; retry(): void } {
  const [error, setError] = useState<{ selection: AdditionSelection; message: string }>(); const [retry, setRetry] = useState(0);
  const attempted = useRef(new Set<string>()); const handled = useRef<AdditionSelection>(); const blocked = useRef<AdditionSelection>();
  const onHandledRef = useRef(onHandled); onHandledRef.current = onHandled;
  const live = useRef(true); useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const key = `vidra.video-add.v1:${encodeURIComponent(ownerId)}:${encodeURIComponent(projectId)}`;
  const selectionRef = useRef<AdditionSelection>({ key, ownerId, projectId, editId: controller.edit?.id, versionId });
  const previous = selectionRef.current;
  if (previous.ownerId !== ownerId || previous.projectId !== projectId || previous.editId !== controller.edit?.id || previous.versionId !== versionId) selectionRef.current = { key, ownerId, projectId, editId: controller.edit?.id, versionId };
  const selection = selectionRef.current;
  useEffect(() => {
    const active = (): boolean => live.current && selectionRef.current === selection;
    const showError = (message: string): void => { if (active()) setError({ selection, message }); };
    if (!versionId) { const prior = readIntent(key); if (prior?.state === "handled" && prior.ownerId === ownerId && prior.projectId === projectId && prior.editId === selection.editId) try { localStorage.removeItem(key); } catch { /* The retained receipt still prevents replay. */ } return; }
    if (controller.loading || !controller.edit || controller.busy || handled.current === selection || blocked.current === selection) return;
    const edit = controller.edit; let intent = readIntent(key);
    if (intent && (intent.ownerId !== ownerId || intent.projectId !== projectId || intent.editId !== edit.id || intent.versionId !== versionId)) {
      if (intent.state === "pending") { blocked.current = selection; showError("Finish saving the previous media addition before adding another version."); return; }
      intent = undefined;
    }
    const finish = (value: Intent): void => {
      if (!active() || handled.current === selection || value.ownerId !== selection.ownerId || value.projectId !== selection.projectId || value.editId !== selection.editId || value.versionId !== selection.versionId) return;
      const retained = readIntent(key); if (retained && retained.operationId !== value.operationId) return;
      try { localStorage.setItem(key, JSON.stringify({ ...value, state: "handled" })); } catch { /* The pending item ID also proves an accepted insertion on reopen. */ }
      handled.current = selection; setError(undefined); onHandledRef.current?.();
    };
    if (intent?.state === "handled") { finish(intent); return; }
    if (!intent) {
      const version = media.find(candidate => candidate.id === versionId);
      if (!version || version.metadata.state !== "verified") { blocked.current = selection; showError("This exact media is unavailable. Retry after it is ready."); return; }
      if (version.kind === "audio") {
        // A take goes to its own lane (S11): a voiceover to Voiceover, anything else to Music. An occupied lane is never replaced silently.
        const occupied = lane === "voiceover" ? edit.composition.voiceover : edit.composition.backgroundAudio;
        if (occupied && occupied.versionId !== version.id) { blocked.current = selection; showError(lane === "voiceover" ? "The voiceover lane holds another take. Remove it before adding this one." : "The music lane holds another track. Remove it before adding this one."); return; }
        if (controller.pendingChange) { blocked.current = selection; showError("Finish saving the current edit before adding this take."); return; }
        const frames = compositionFrames(edit.composition);
        if (!frames) { blocked.current = selection; showError("Add a picture or clip before adding a take."); return; }
        const audio = VideoBackgroundAudioSchema.parse({ id: occupied?.id ?? `audio_${crypto.randomUUID()}`, versionId: version.id, sourceInFrame: 0, startFrame: 0, endFrame: Math.max(1, Math.min(frames, Math.floor(version.metadata.durationSeconds * 30))), gain: lane === "voiceover" ? 1 : 0.35 });
        intent = IntentSchema.parse({ ownerId, projectId, editId: edit.id, versionId, audio, lane, index: 0, operationId: `operation_${crypto.randomUUID()}`, expectedRevision: edit.revision, state: "pending" });
        try { localStorage.setItem(key, JSON.stringify(intent)); } catch { blocked.current = selection; showError("This addition could not be kept on this device. Keep the editor open and retry."); return; }
      }
    }
    if (!intent) {
      const version = media.find(candidate => candidate.id === versionId); const source = sources[versionId];
      if (!version) return;
      if (!source?.url && !source?.error) return;
      if (source?.error) { blocked.current = selection; showError("This exact source could not open. Retry adding it after its access is restored."); return; }
      if (controller.pendingChange) { blocked.current = selection; showError("Finish saving the current edit before adding this version."); return; }
      intent = IntentSchema.parse({ ownerId, projectId, editId: edit.id, versionId, item: createItem(version, source?.frames), index: edit.composition.items.length, operationId: `operation_${crypto.randomUUID()}`, expectedRevision: edit.revision, state: "pending" });
      try { localStorage.setItem(key, JSON.stringify(intent)); } catch { blocked.current = selection; showError("This addition could not be kept on this device. Keep the editor open and retry."); return; }
    }
    const captured = intent;
    const placed = captured.audio ? (captured.lane === "voiceover" ? edit.composition.voiceover : edit.composition.backgroundAudio)?.id === captured.audio.id && (captured.lane === "voiceover" ? edit.composition.voiceover : edit.composition.backgroundAudio)?.versionId === captured.versionId : edit.composition.items.some(item => item.id === captured.item?.id && item.versionId === captured.versionId);
    if (!controller.pendingChange && placed) { finish(captured); return; }
    if (attempted.current.has(captured.operationId)) return;
    attempted.current.add(captured.operationId);
    if (controller.pendingChange && controller.pendingChange.operationId !== captured.operationId) { blocked.current = selection; showError("Finish saving the current edit before adding this version."); return; }
    const change = captured.audio ? { kind: captured.lane === "voiceover" ? "voiceover_audio" as const : "background_audio" as const, audio: captured.audio } : captured.item ? { kind: "insert" as const, item: captured.item, index: captured.index } : undefined;
    if (!change) return;
    const operation = controller.pendingChange ? controller.retryChange() : controller.command(change, { operationId: captured.operationId, expectedRevision: captured.expectedRevision });
    void operation.then(saved => { if (!active()) return; if (saved) finish(captured); else showError("This addition is kept. Retry saving to confirm the same media item."); }).catch((failure: unknown) => { showError(failure instanceof Error ? failure.message : "This media addition was not confirmed."); });
  }, [controller, key, lane, media, ownerId, projectId, retry, selection, sources, versionId]);
  return { error: error?.selection === selection ? error.message : undefined, retry: () => { if (!live.current || selectionRef.current !== selection) return; if (blocked.current === selection) blocked.current = undefined; const retained = readIntent(key); if (retained?.ownerId === ownerId && retained.projectId === projectId && retained.editId === selection.editId && retained.versionId === versionId) attempted.current.delete(retained.operationId); setError(undefined); setRetry(value => value + 1); } };
}
