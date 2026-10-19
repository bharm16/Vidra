import type { ReactElement } from "react";
import { FreshButton } from "@/components/fresh/FreshButton";
import type { EditCommand, VideoComposition } from "@shared/schemas/workflow/video-edit.schemas";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { planTimingRepair, type TimingRepairTarget } from "@shared/video-edit/composition";

export type { TimingRepairTarget };

function intervalTime(frames: number): string { return (frames / 30).toFixed(frames % 3 === 0 ? 1 : 2); }

/** Repairs only the selected group of intervals the user can review here. */
export function TimingRepair({ composition, media, target, disabled, command, onDone, onManual }: { composition: VideoComposition; media?: readonly MediaVersion[]; target?: TimingRepairTarget; disabled: boolean; command(command: EditCommand): void; onDone(): void; onManual(): void }): ReactElement {
  const { target: resolvedTarget, targetLabel, limitFrames, itemIndex, captionRows, audioRows, canApply } = planTimingRepair(composition, media, target);
  return <div className="ve-timing-repair"><h2>Fit the timing to {targetLabel}</h2><p>{targetLabel} is now {(limitFrames / 30).toFixed(1)} seconds long.</p><div className="ve-timing-rows" style={{ whiteSpace: "pre-wrap" }}>{captionRows.map(row => row.after ? <p key={row.before.id}>{`Caption     ${intervalTime(row.before.startFrame)}–${intervalTime(row.before.endFrame)}s  →  ${intervalTime(row.after.startFrame)}–${intervalTime(row.after.endFrame)}s`}</p> : <div className="ve-timing-unfittable-row" key={row.before.id} role="group" aria-label={`Timing for caption: ${row.before.text || "Untitled caption"}`}><p>{`Caption     ${intervalTime(row.before.startFrame)}–${intervalTime(row.before.endFrame)}s`}</p><p className="ve-timing-caption-label">{row.before.text || "Untitled caption"}</p><FreshButton tone="quiet" disabled={disabled} aria-label={`Remove caption: ${row.before.text || "Untitled caption"}`} onClick={() => { command({ kind: "remove_text", textId: row.before.id }); onDone(); }}>Remove caption</FreshButton></div>)}{audioRows.map(row => row.after ? <p key={row.item.id}>{`Clip audio  ${intervalTime(row.before.startFrame)}–${intervalTime(row.before.endFrame)}s  →  ${intervalTime(row.after.startFrame)}–${intervalTime(row.after.endFrame)}s`}</p> : <div className="ve-timing-unfittable-row" key={row.item.id} role="group" aria-label={`Timing for Clip ${itemIndex + 1} audio`}><p>{`Clip audio  ${intervalTime(row.before.startFrame)}–${intervalTime(row.before.endFrame)}s`}</p><FreshButton tone="quiet" disabled={disabled} onClick={() => { command({ kind: "source_audio", itemId: row.item.id, muted: row.item.sourceAudio.muted, gain: row.item.sourceAudio.gain, removed: true }); onDone(); }}>Remove clip audio</FreshButton></div>)}</div><FreshButton tone="primary" disabled={disabled || !canApply} onClick={() => {
    if (!canApply) return;
    command({ kind: "repair_timing", ...(resolvedTarget ? { target: resolvedTarget } : {}) });
    onDone();
  }}>Apply shorter timing</FreshButton><FreshButton tone="quiet" onClick={onManual}>Keep editing manually</FreshButton></div>;
}
