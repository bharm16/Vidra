import { useEffect, useRef, useState } from "react";
import { VideoTextSchema, type VideoComposition, type VideoText } from "@shared/schemas/workflow/video-edit.schemas";
import { compositionFrames } from "@shared/video-edit/composition";
import type { VideoEditorController } from "./useVideoEditor";
import { createCaption } from "../state/editorState";
import { parseWebVtt } from "@shared/workflow/webVtt";

/** Caption elements for a transcript's cues, with identities derived from the request so a repeat never duplicates them. */
export function captionsFromTranscript(composition: VideoComposition, requestId: string, transcript: string): VideoText[] {
  const duration = compositionFrames(composition);
  const room = Math.max(0, 100 - composition.text.length);
  return (parseWebVtt(transcript) ?? []).flatMap((cue, index): VideoText[] => {
    const startFrame = Math.round(cue.start * 30);
    const endFrame = Math.min(duration, Math.round(cue.end * 30));
    if (!cue.text || startFrame >= endFrame) return [];
    return [VideoTextSchema.parse({ ...createCaption(composition), id: `text_${requestId}_${index}`.slice(0, 160), text: cue.text.slice(0, 2000), startFrame, endFrame })];
  }).slice(0, room);
}

interface CaptionSelection { key: string; }
interface CaptionIntent {
  selection: CaptionSelection;
  operationId: string;
  expectedRevision: number;
  composition: VideoComposition;
  lastAttempt: number;
  running: boolean;
}

/** Caption admission retains one command until its exact edit/request is handled. */
export function useInitialCaptions({ captions, controller, onHandled }: { captions: { requestId: string; text: string } | undefined; controller: VideoEditorController; onHandled?: (() => void) | undefined }): { error: string | undefined; retry(): void } {
  const edit = controller.edit;
  const key = JSON.stringify([edit?.ownerId, edit?.projectId, edit?.id, captions?.requestId]);
  const current = useRef<CaptionSelection>({ key });
  if (current.current.key !== key) current.current = { key };
  const selection = current.current;
  const intent = useRef<CaptionIntent>();
  const handled = useRef<CaptionSelection>();
  const [error, setError] = useState<{ selection: CaptionSelection; message: string }>();
  const [attempt, setAttempt] = useState(0);
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const onHandledRef = useRef(onHandled); onHandledRef.current = onHandled;
  useEffect(() => {
    const active = (): boolean => live.current && current.current === selection;
    const fail = (message: string): void => { if (active()) setError(value => value?.selection === selection && value.message === message ? value : { selection, message }); };
    if (!captions || !edit || controller.loading || controller.busy) return;
    const prefix = `text_${captions.requestId}_`;
    let captured = intent.current?.selection === selection ? intent.current : undefined;
    const finish = (): void => {
      if (!active() || handled.current === selection) return;
      handled.current = selection;
      setError(undefined); onHandledRef.current?.();
    };
    if (!controller.pendingChange && edit.composition.text.some(text => text.id.startsWith(prefix))) { finish(); return; }
    if (handled.current === selection || captured?.running || captured?.lastAttempt === attempt) return;
    if (controller.pendingChange) {
      // The editor journal owns the original operation, including after remount.
      // Its existing Retry saving edit action must settle before a new change.
      return;
    }
    if (!compositionFrames(edit.composition)) { fail("Add a picture or clip before adding captions."); return; }
    if (!captured) {
      const cues = captionsFromTranscript(edit.composition, captions.requestId, captions.text);
      if (!cues.length) { fail("These captions have no lines inside the video's length."); return; }
      captured = { selection, operationId: `operation_${crypto.randomUUID()}`, expectedRevision: edit.revision, composition: { ...edit.composition, text: [...edit.composition.text, ...cues] }, lastAttempt: -1, running: false };
      intent.current = captured;
    }
    const admitted = captured;
    admitted.lastAttempt = attempt; admitted.running = true;
    void controller.command({ kind: "replace_composition", composition: admitted.composition }, { operationId: admitted.operationId, expectedRevision: admitted.expectedRevision })
      .then(saved => { if (!active()) return; if (saved) finish(); else fail("These captions are kept. Retry saving to place them."); })
      .catch((failure: unknown) => fail(failure instanceof Error ? failure.message : "These captions could not be placed."))
      .finally(() => { admitted.running = false; });
  }, [captions, controller, edit, selection, attempt]);
  return { error: error?.selection === selection ? error.message : undefined, retry: () => { if (live.current && current.current === selection) setAttempt(value => value + 1); } };
}
