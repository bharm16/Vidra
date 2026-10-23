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

/** Make captions' Add to video (S10): the cues land on the Captions lane in one explicit change. */
export function useInitialCaptions({ captions, controller, onHandled }: { captions: { requestId: string; text: string } | undefined; controller: VideoEditorController; onHandled?: (() => void) | undefined }): string | undefined {
  const [error, setError] = useState<string>();
  const attempted = useRef<string>();
  const onHandledRef = useRef(onHandled); onHandledRef.current = onHandled;
  useEffect(() => {
    const edit = controller.edit;
    if (!captions || !edit || controller.loading || controller.busy || controller.pendingChange) return;
    const key = `${edit.id}:${captions.requestId}`;
    if (attempted.current === key) return;
    if (edit.composition.text.some(text => text.id.startsWith(`text_${captions.requestId}_`))) { attempted.current = key; onHandledRef.current?.(); return; }
    const cues = captionsFromTranscript(edit.composition, captions.requestId, captions.text);
    attempted.current = key;
    if (!compositionFrames(edit.composition)) { setError("Add a picture or clip before adding captions."); return; }
    if (!cues.length) { setError("These captions have no lines inside the video's length."); return; }
    void controller.command({ kind: "replace_composition", composition: { ...edit.composition, text: [...edit.composition.text, ...cues] } }).then(saved => { if (saved) { setError(undefined); onHandledRef.current?.(); } else setError("These captions are kept. Retry saving to place them."); }).catch((failure: unknown) => setError(failure instanceof Error ? failure.message : "These captions could not be placed."));
  }, [captions, controller]);
  return error;
}
