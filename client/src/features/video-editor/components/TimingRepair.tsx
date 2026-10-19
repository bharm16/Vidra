import type { ReactElement } from "react";
import { FreshButton } from "@/components/fresh/FreshButton";
import type { EditCommand, VideoComposition } from "@shared/schemas/workflow/video-edit.schemas";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { sourceAudioInterval } from "@shared/video-edit/composition";
import { totalFrames } from "../state/editorState";

export type TimingRepairTarget = { kind: "item"; itemId: string } | { kind: "composition" };

function shorterInterval(startFrame: number, endFrame: number, limit: number): { startFrame: number; endFrame: number } | undefined {
  const start = Math.max(0, startFrame), end = Math.min(endFrame, limit);
  return start < end ? { startFrame: start, endFrame: end } : undefined;
}

function intervalTime(frames: number): string { return (frames / 30).toFixed(frames % 3 === 0 ? 1 : 2); }

/** Repairs only the selected group of intervals the user can review here. */
export function TimingRepair({ composition, media, target, disabled, command, onDone, onManual }: { composition: VideoComposition; media?: readonly MediaVersion[]; target?: TimingRepairTarget; disabled: boolean; command(command: EditCommand): void; onDone(): void; onManual(): void }): ReactElement {
  const duration = totalFrames(composition);
  const captions = composition.text.flatMap(text => {
    const limit = text.anchor.kind === "item" ? composition.items.find(item => text.anchor.kind === "item" && item.id === text.anchor.itemId)?.displayFrames : duration;
    if (!limit || text.startFrame >= 0 && text.endFrame <= limit && text.startFrame < text.endFrame) return [];
    const timing = shorterInterval(text.startFrame, text.endFrame, limit);
    return [{ before: text, after: timing ? { ...text, ...timing } : undefined, limit }];
  });
  const audio = composition.items.flatMap(item => {
    if (item.kind !== "clip" || item.sourceAudio.removed || !item.displayFrames) return [];
    const attached = media ? media.some(version => version.id === item.versionId && version.metadata.state === "verified" && version.metadata.audio === "present") : Boolean(item.sourceAudio.timing);
    if (!attached) return [];
    const before = sourceAudioInterval(item);
    if (before.startFrame >= 0 && before.endFrame <= item.displayFrames && before.startFrame < before.endFrame) return [];
    return [{ item, before, after: shorterInterval(before.startFrame, before.endFrame, item.displayFrames) }];
  });
  const firstAnchor = captions[0]?.before.anchor;
  const inferred: TimingRepairTarget | undefined = target ?? (firstAnchor ? firstAnchor.kind === "item" ? { kind: "item", itemId: firstAnchor.itemId } : { kind: "composition" } : audio[0] ? { kind: "item", itemId: audio[0].item.id } : undefined);
  const captionRows = captions.filter(row => inferred?.kind === "item" ? row.before.anchor.kind === "item" && row.before.anchor.itemId === inferred.itemId : inferred?.kind === "composition" && row.before.anchor.kind === "composition");
  const audioRows = inferred?.kind === "item" ? audio.filter(row => row.item.id === inferred.itemId) : [];
  const index = inferred?.kind === "item" ? composition.items.findIndex(item => item.id === inferred.itemId) : -1;
  const targetLabel = index >= 0 ? `Clip ${index + 1}` : "the video";
  const limit = index >= 0 ? composition.items[index]?.displayFrames ?? duration : duration;
  const hasRows = captionRows.length + audioRows.length > 0;
  const canApply = hasRows && captionRows.every(row => row.after) && audioRows.every(row => row.after);
  return <div className="ve-timing-repair"><h2>Fit the timing to {targetLabel}</h2><p>{targetLabel} is now {(limit / 30).toFixed(1)} seconds long.</p><div className="ve-timing-rows" style={{ whiteSpace: "pre-wrap" }}>{captionRows.map(row => row.after ? <p key={row.before.id}>{`Caption     ${intervalTime(row.before.startFrame)}–${intervalTime(row.before.endFrame)}s  →  ${intervalTime(row.after.startFrame)}–${intervalTime(row.after.endFrame)}s`}</p> : <div className="ve-timing-unfittable-row" key={row.before.id} role="group" aria-label={`Timing for caption: ${row.before.text || "Untitled caption"}`}><p>{`Caption     ${intervalTime(row.before.startFrame)}–${intervalTime(row.before.endFrame)}s`}</p><p className="ve-timing-caption-label">{row.before.text || "Untitled caption"}</p><FreshButton tone="quiet" disabled={disabled} aria-label={`Remove caption: ${row.before.text || "Untitled caption"}`} onClick={() => { command({ kind: "remove_text", textId: row.before.id }); onDone(); }}>Remove caption</FreshButton></div>)}{audioRows.map(row => row.after ? <p key={row.item.id}>{`Clip audio  ${intervalTime(row.before.startFrame)}–${intervalTime(row.before.endFrame)}s  →  ${intervalTime(row.after.startFrame)}–${intervalTime(row.after.endFrame)}s`}</p> : <div className="ve-timing-unfittable-row" key={row.item.id} role="group" aria-label={`Timing for Clip ${index + 1} audio`}><p>{`Clip audio  ${intervalTime(row.before.startFrame)}–${intervalTime(row.before.endFrame)}s`}</p><FreshButton tone="quiet" disabled={disabled} onClick={() => { command({ kind: "source_audio", itemId: row.item.id, muted: row.item.sourceAudio.muted, gain: row.item.sourceAudio.gain, removed: true }); onDone(); }}>Remove clip audio</FreshButton></div>)}</div><FreshButton tone="primary" disabled={disabled || !canApply} onClick={() => {
    if (!canApply) return;
    const textUpdates = new Map(captionRows.flatMap(row => row.after ? [[row.after.id, row.after] as const] : []));
    const audioUpdates = new Map(audioRows.flatMap(row => row.after ? [[row.item.id, row.after] as const] : []));
    command({ kind: "replace_composition", composition: { ...composition, text: composition.text.map(text => textUpdates.get(text.id) ?? text), items: composition.items.map(item => { const timing = audioUpdates.get(item.id); return timing ? { ...item, sourceAudio: { ...item.sourceAudio, timing } } : item; }) } });
    onDone();
  }}>Apply shorter timing</FreshButton><FreshButton tone="quiet" onClick={onManual}>Keep editing manually</FreshButton></div>;
}
