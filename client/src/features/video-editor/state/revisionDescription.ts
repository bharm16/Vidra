import type { EditCommand, VideoEdit } from "@shared/schemas/workflow/video-edit.schemas";
import { canonicalJson } from "@shared/workflow/canonicalJson";

/** Describes what a saved revision changed from the revision immediately before it. */
export function revisionDescription(revision: VideoEdit, earlier: readonly VideoEdit[]): string {
  const current = revision.composition; const older = earlier.filter(row => row.revision < revision.revision).sort((a, b) => b.revision - a.revision); const previous = older[0];
  const change = revision.change;
  if (change?.kind === "restore" && change.restoredFrom !== undefined) return `Restored edit ${change.restoredFrom}`;
  const recorded = change ? recordedDescription(change.kind, revision, previous) : undefined;
  if (recorded) return recorded;
  if (previous) {
    // Revisions saved before commands were stored: a restore is recognised as an exact return to an older arrangement.
    const arrangement = canonicalJson(current);
    if (!change && arrangement !== canonicalJson(previous.composition)) { const source = older.slice(1).find(row => canonicalJson(row.composition) === arrangement); if (source) return `Restored edit ${source.revision}`; }
    if (JSON.stringify(current.text) !== JSON.stringify(previous.composition.text)) return current.text.length > previous.composition.text.length ? "Added caption" : current.text.length < previous.composition.text.length ? "Removed caption" : "Changed caption";
    if (current.backgroundAudio && !previous.composition.backgroundAudio) return "Added music";
    if (!current.backgroundAudio && previous.composition.backgroundAudio) return "Removed music";
    if (current.preset !== previous.composition.preset) return "Changed framing";
    if (current.items.length !== previous.composition.items.length) return current.items.length > previous.composition.items.length ? "Added media" : "Removed media";
    if (current.items.some((item,index)=>item.id !== previous.composition.items[index]?.id)) return "Rearranged clips";
    if (current.items.some((item,index)=>item.inFrame !== previous.composition.items[index]?.inFrame || item.outFrame !== previous.composition.items[index]?.outFrame)) return "Changed timing";
  }
  const clips = current.items.filter(item=>item.kind === "clip").length; const pictures = current.items.length-clips;
  return [clips ? `${clips} ${clips === 1 ? "clip" : "clips"}` : "", pictures ? `${pictures} ${pictures === 1 ? "picture" : "pictures"}` : ""].filter(Boolean).join(" · ") || "Empty edit";
}

/** Commands that name their change. Whole-arrangement saves (undo, redo, repairs) and caption upserts still compare compositions. */
function recordedDescription(kind: EditCommand["kind"], revision: VideoEdit, previous: VideoEdit | undefined): string | undefined {
  switch (kind) {
    case "insert": return "Added media";
    case "remove": return "Removed media";
    case "move": return "Rearranged clips";
    case "trim": case "duration": return "Changed timing";
    case "replace": return "Replaced media";
    case "transform": case "preset": return "Changed framing";
    case "remove_text": return "Removed caption";
    case "source_audio": return "Changed clip sound";
    case "copy_audio": return "Copied clip sound";
    case "background_audio": return !revision.composition.backgroundAudio ? "Removed music" : previous?.composition.backgroundAudio ? "Changed music" : "Added music";
    case "text": return previous && revision.composition.text.length > previous.composition.text.length ? "Added caption" : "Changed caption";
    default: return undefined;
  }
}
