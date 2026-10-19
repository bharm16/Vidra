import type { ReactElement } from "react";
import { FreshButton } from "@/components/fresh/FreshButton";
import type { VideoComposition, VideoValidationIssue } from "@shared/schemas/workflow/video-edit.schemas";
import { sourceAudioInterval } from "@shared/video-edit/composition";
import type { EditorSelection } from "./EditorTimeline";
import type { UnavailableSource } from "../state/unavailableSource";

interface Props {
  composition: VideoComposition;
  issues: readonly VideoValidationIssue[];
  onSelect(selection: EditorSelection): void;
  onRepair(selection: EditorSelection): void;
  unavailable?: readonly UnavailableSource[];
  onReplace?(source: UnavailableSource): void;
}

/** One warning reviews the attached intervals affected by the same clip change. */
export function EditorIssues({ composition, issues, onSelect, onRepair, unavailable = [], onReplace }: Props): ReactElement {
  const timingGroups = new Map<string, VideoValidationIssue[]>();
  const other: VideoValidationIssue[] = [];
  for (const issue of issues) {
    // Unavailable sources are listed from `unavailable`, which also resolves older version-keyed issues.
    if (issue.code === "source_unavailable") continue;
    const text = composition.text.find(row => row.id === issue.elementId);
    const target = issue.code === "source_audio_timing" ? issue.elementId : issue.code === "text_timing" ? text?.anchor.kind === "item" ? text.anchor.itemId : "composition" : undefined;
    if (target === undefined) { other.push(issue); continue; }
    const group = timingGroups.get(target) ?? []; group.push(issue); timingGroups.set(target, group);
  }
  return <>
    {[...timingGroups].map(([target, issuesForTarget]) => {
      const group = [...issuesForTarget].sort((a, b) => Number(a.code === "source_audio_timing") - Number(b.code === "source_audio_timing"));
      const itemIndex = composition.items.findIndex(item => item.id === target); const item = composition.items[itemIndex];
      const first = group[0]; if (!first) return null;
      const caption = composition.text.find(text => text.id === first.elementId);
      const selection: EditorSelection = caption ? { kind: "text", id: caption.id } : { kind: "source-audio", id: target };
      const title = item ? `${group.length === 1 ? "Timing extends" : group.length === 2 ? "Two timings extend" : `${group.length} timings extend`} past Clip ${itemIndex + 1}` : "Timing extends past the video";
      const details = group.map(issue => {
        const cue = composition.text.find(text => text.id === issue.elementId);
        const interval = cue ?? (item && issue.code === "source_audio_timing" ? sourceAudioInterval(item) : undefined);
        if (!interval) return issue.message;
        return `${cue ? "Caption" : "Clip audio"} ${interval.startFrame < 0 ? `starts at ${(interval.startFrame / 30).toFixed(1)}` : `ends at ${(interval.endFrame / 30).toFixed(1)}`}s.`;
      });
      if (item) details.push(`The clip is now ${(item.displayFrames / 30).toFixed(1)}s.`);
      return <div className="ve-issue-row" key={`timing:${target}`}><img src="/design-assets/fidelity-model-warning.svg" alt="" /><div><strong>{title}</strong><p>{details.join(" ")}</p></div><FreshButton onClick={() => onRepair(selection)}>Fix timing</FreshButton></div>;
    })}
    {unavailable.map(source => <div className="ve-issue-row" key={`${source.elementId}:source_unavailable`}><img src="/design-assets/fidelity-model-warning.svg" alt="" /><div><strong>{source.label} is unavailable</strong><p>Replace it to export this edit.</p></div>{onReplace ? <FreshButton onClick={() => onReplace(source)}>{source.kind === "picture" ? "Replace picture" : source.kind === "clip" ? "Replace clip" : "Replace music"}</FreshButton> : null}</div>)}
    {other.map(issue => {
      const text = composition.text.find(row => row.id === issue.elementId); const item = composition.items.find(row => row.id === issue.elementId);
      return <div className="ve-issue-row" key={`${issue.elementId}:${issue.code}`}><img src="/design-assets/fidelity-model-warning.svg" alt="" /><div><strong>{text ? `Caption ${composition.text.indexOf(text) + 1} cannot be exported` : "This edit needs attention"}</strong><p>{issue.code === "text_render_policy" && issue.unsupportedCodePoints?.length ? "Choose a font or edit the unsupported character." : issue.message}</p></div><FreshButton onClick={() => { if (text) onSelect({ kind: "text", id: text.id }); else if (item) onSelect({ kind: "item", id: item.id }); }}>{text ? "Edit caption" : "Fix timing"}</FreshButton></div>;
    })}
  </>;
}
