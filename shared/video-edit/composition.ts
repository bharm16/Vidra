import { VideoCompositionSchema, VideoTextSchema, type EditCommand, type TimingRepairTarget, type VideoComposition, type VideoItem, type VideoPreset, type VideoText, type VideoValidationIssue } from "../schemas/workflow/video-edit.schemas";
import type { MediaVersion } from "../schemas/workflow/media.schemas";
import { captionPlacement } from "./captionPlacement";

export type { TimingRepairTarget };
export const VIDEO_EDIT_LIMITS = Object.freeze({ maxFrames: 1800, maxSourcePixels: 8_294_400, maxItems: 32, maxText: 100, maxSourceBytes: 512 * 1024 * 1024, maxDecodeSeconds: 300, maxCompositionBytes: 256 * 1024 });
export const VIDEO_PRESETS: Readonly<Record<VideoPreset, { width: number; height: number }>> = Object.freeze({ landscape: { width: 1920, height: 1080 }, portrait: { width: 1080, height: 1920 }, square: { width: 1080, height: 1080 } });
export function emptyVideoComposition(preset: VideoPreset = "landscape"): VideoComposition { return { normalizationVersion: "vidra-cfr30/v1", preset, fps: 30, items: [], text: [] }; }
export function compositionFrames(composition: VideoComposition): number { return composition.items.reduce((total, item) => total + item.displayFrames, 0); }
export function timelineItems(composition: VideoComposition): Array<{ item: VideoItem; startFrame: number; endFrame: number }> {
  let cursor = 0;
  return composition.items.map(item => { const startFrame = cursor; cursor += item.displayFrames; return { item, startFrame, endFrame: cursor }; });
}
export function timelineItemAtFrame(composition: VideoComposition, frame: number): { item: VideoItem; startFrame: number; endFrame: number } | undefined {
  const items = timelineItems(composition);
  return items.find(row => frame >= row.startFrame && frame < row.endFrame) ?? (frame === compositionFrames(composition) ? items.at(-1) : undefined);
}
export function movedPlayheadFrame(composition: VideoComposition, itemId: string, index: number, frame: number): number | undefined {
  const before = timelineItems(composition).find(row => row.item.id === itemId); if (!before) return undefined;
  const items = composition.items.filter(item => item.id !== itemId); items.splice(index, 0, before.item);
  const after = timelineItems({ ...composition, items }).find(row => row.item.id === itemId);
  return after ? after.startFrame + (frame >= before.startFrame && frame < before.endFrame ? frame - before.startFrame : 0) : undefined;
}
export function removeItemWithAttachedElements(composition: VideoComposition, itemId: string): VideoComposition {
  return VideoCompositionSchema.parse({
    ...composition,
    items: composition.items.filter(item => item.id !== itemId),
    text: composition.text.filter(text => text.anchor.kind !== "item" || text.anchor.itemId !== itemId),
  });
}
export interface TimingRepairPlan {
  target: TimingRepairTarget | undefined;
  targetLabel: string;
  limitFrames: number;
  itemIndex: number;
  captionRows: Array<{ before: VideoText; after: VideoText | undefined; limit: number }>;
  audioRows: Array<{ item: VideoItem; before: { startFrame: number; endFrame: number }; after: { startFrame: number; endFrame: number } | undefined }>;
  canApply: boolean;
  repairedComposition: VideoComposition;
}
function shorterInterval(startFrame: number, endFrame: number, limit: number): { startFrame: number; endFrame: number } | undefined {
  const start = Math.max(0, startFrame), end = Math.min(endFrame, limit);
  return start < end ? { startFrame: start, endFrame: end } : undefined;
}
export function planTimingRepair(composition: VideoComposition, media?: readonly MediaVersion[], target?: TimingRepairTarget): TimingRepairPlan {
  const duration = compositionFrames(composition);
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
  const itemIndex = inferred?.kind === "item" ? composition.items.findIndex(item => item.id === inferred.itemId) : -1;
  const targetLabel = itemIndex >= 0 ? `Clip ${itemIndex + 1}` : "the video";
  const limitFrames = itemIndex >= 0 ? composition.items[itemIndex]?.displayFrames ?? duration : duration;
  const hasRows = captionRows.length + audioRows.length > 0;
  const canApply = hasRows && captionRows.every(row => row.after) && audioRows.every(row => row.after);
  const textUpdates = new Map(captionRows.flatMap(row => row.after ? [[row.after.id, row.after] as const] : []));
  const audioUpdates = new Map(audioRows.flatMap(row => row.after ? [[row.item.id, row.after] as const] : []));
  const repairedComposition = canApply
    ? VideoCompositionSchema.parse({
        ...composition,
        text: composition.text.map(text => textUpdates.get(text.id) ?? text),
        items: composition.items.map(item => { const timing = audioUpdates.get(item.id); return timing ? { ...item, sourceAudio: { ...item.sourceAudio, timing } } : item; }),
      })
    : composition;
  return { target: inferred, targetLabel, limitFrames, itemIndex, captionRows, audioRows, canApply, repairedComposition };
}
export function absoluteText(composition: VideoComposition, text: VideoText): { startFrame: number; endFrame: number } | undefined {
  const anchor = text.anchor;
  const start = anchor.kind === "composition" ? 0 : timelineItems(composition).find(row => row.item.id === anchor.itemId)?.startFrame;
  return start === undefined ? undefined : { startFrame: start + text.startFrame, endFrame: start + text.endFrame };
}
/** Visual items, then background audio, that play this exact source version. */
export function sourceElementIds(composition: VideoComposition, versionId: string): string[] { return [...composition.items.filter(item => item.versionId === versionId).map(item => item.id), ...(composition.backgroundAudio?.versionId === versionId ? [composition.backgroundAudio.id] : [])]; }
export function sourceVersionIds(composition: VideoComposition): Array<VideoItem["versionId"]> { return [...new Set([...composition.items.map(item => item.versionId), ...(composition.backgroundAudio ? [composition.backgroundAudio.versionId] : [])])]; }
/** Old revisions use the complete displayed clip without rewriting their captured manifest. */
export function sourceAudioInterval(item: VideoItem): { startFrame: number; endFrame: number } { return item.sourceAudio.timing ?? { startFrame: 0, endFrame: item.displayFrames }; }
/** A format change is an explicit edit; equal-height previews retain equal-height captions. */
export function withVideoPreset(composition: VideoComposition, preset: VideoPreset): VideoComposition {
  if (composition.preset === preset) return composition;
  const ratio = VIDEO_PRESETS[preset].height / VIDEO_PRESETS[composition.preset].height;
  const text = composition.text.map((cue, index) => {
    const fontSize = ratio === 1 ? cue.fontSize : Math.round(cue.fontSize * ratio * 1_000_000) / 1_000_000;
    if (!VideoTextSchema.shape.fontSize.safeParse(fontSize).success) throw new Error(`Caption ${index + 1} would be outside the supported size range in this format. Change its size before changing format.`);
    return { ...cue, fontSize, ...(cue.placement ? { ...captionPlacement(preset, cue.placement), height: cue.height } : {}) };
  });
  return { ...composition, preset, text };
}
/** Changing attachment preserves the visible interval before validating its new anchor. */
export function reanchorText(composition: VideoComposition, cue: VideoText, anchor: VideoText["anchor"]): VideoText {
  const interval = absoluteText(composition, cue);
  const offset = anchor.kind === "composition" ? 0 : timelineItems(composition).find(row => row.item.id === anchor.itemId)?.startFrame;
  if (!interval || offset === undefined) throw new Error("The caption's attachment is unavailable. Restore its clip before changing the attachment.");
  return { ...cue, anchor, startFrame: interval.startFrame - offset, endFrame: interval.endFrame - offset };
}

/** Each command is one editing action; invalid timing remains present for explicit repair. */
export function applyEditCommand(value: VideoComposition, command: Exclude<EditCommand, { kind: "restore" }>): VideoComposition {
  const composition = structuredClone(value);
  const itemById = (id: string): VideoItem => { const item = composition.items.find(candidate => candidate.id === id); if (!item) throw new Error("This visual item is unavailable."); return item; };
  switch (command.kind) {
    case "replace_composition": return VideoCompositionSchema.parse(command.composition);
    case "insert": if (command.index > composition.items.length || composition.items.some(item => item.id === command.item.id)) throw new Error("Choose an existing timeline boundary and a new item identity."); composition.items.splice(command.index, 0, command.item); break;
    case "remove": itemById(command.itemId); if (command.removeAttachedElements) return removeItemWithAttachedElements(composition, command.itemId); composition.items = composition.items.filter(item => item.id !== command.itemId); break;
    case "move": { const item = itemById(command.itemId); if (command.index >= composition.items.length) throw new Error("Choose an existing timeline position."); composition.items = composition.items.filter(candidate => candidate.id !== item.id); composition.items.splice(command.index, 0, item); break; }
    case "trim": { const item = itemById(command.itemId); if (item.kind !== "clip") throw new Error("Use duration to change a picture's length."); const offsetDelta = item.inFrame - command.inFrame; const audio = sourceAudioInterval(item); item.sourceAudio.timing = { startFrame: audio.startFrame + offsetDelta, endFrame: audio.endFrame + offsetDelta }; for (const cue of composition.text) if (cue.anchor.kind === "item" && cue.anchor.itemId === item.id) { cue.startFrame += offsetDelta; cue.endFrame += offsetDelta; } item.inFrame = command.inFrame; item.outFrame = command.outFrame; item.displayFrames = Math.max(0, command.outFrame - command.inFrame); break; }
    case "duration": { const item = itemById(command.itemId); if (item.kind !== "picture") throw new Error("Trim a clip to change its duration."); item.displayFrames = command.displayFrames; break; }
    case "replace": { const item = itemById(command.itemId); if (item.kind === "clip") item.sourceAudio.timing = { ...sourceAudioInterval(item) }; item.versionId = command.versionId; item.kind = command.mediaKind; item.inFrame = command.inFrame; item.outFrame = command.outFrame; if (command.changeDuration) item.displayFrames = Math.max(0, command.outFrame - command.inFrame); break; }
    case "transform": { const item = itemById(command.itemId); item.fit = command.fit; if (command.crop) item.crop = command.crop; else delete item.crop; break; }
    case "preset": { if (composition.items.some(item => !command.fits.some(fit => fit.itemId === item.id))) throw new Error("Choose fit, fill or crop for every visual item before changing the output shape."); composition.text = withVideoPreset(composition, command.preset).text; composition.preset = command.preset; for (const fit of command.fits) { const item = itemById(fit.itemId); item.fit = fit.fit; if (fit.crop) item.crop = fit.crop; else delete item.crop; } break; }
    case "text": composition.text = [...composition.text.filter(text => text.id !== command.text.id), command.text]; break;
    case "remove_text": composition.text = composition.text.filter(text => text.id !== command.textId); break;
    case "source_audio": { const item = itemById(command.itemId); item.sourceAudio = { ...item.sourceAudio, muted: command.muted, gain: command.gain, ...(command.timing ? { timing: command.timing } : {}), ...(command.removed !== undefined ? { removed: command.removed } : {}) }; break; }
    case "background_audio": if (command.audio) composition.backgroundAudio = command.audio; else delete composition.backgroundAudio; break;
    case "copy_audio": { if (composition.backgroundAudio) throw new Error("The background audio track is occupied. Remove it before copying audio."); const row = timelineItems(composition).find(candidate => candidate.item.id === command.itemId); if (!row || row.item.kind !== "clip") throw new Error("Choose a clip with source audio."); if (row.item.sourceAudio.removed) throw new Error("This clip audio was removed. Undo its removal before copying it."); const audio = sourceAudioInterval(row.item); if (audio.startFrame < 0 || audio.endFrame <= audio.startFrame || audio.endFrame > row.item.displayFrames) throw new Error("Fit this clip's audio timing before copying it."); composition.backgroundAudio = { id: command.audioId, versionId: row.item.versionId, sourceInFrame: row.item.inFrame + audio.startFrame, startFrame: row.startFrame + audio.startFrame, endFrame: row.startFrame + audio.endFrame, gain: 0.25 }; break; }
    case "repair_timing": { const plan = planTimingRepair(composition, undefined, command.target); if (!plan.canApply) throw new Error("This timing cannot be shortened automatically."); return plan.repairedComposition; }
  }
  return VideoCompositionSchema.parse(composition);
}

/** Pure capability validation shared by editor and server. Missing IDs are never substituted. */
export function validateVideoComposition(composition: VideoComposition, sources: readonly MediaVersion[], normalizedFrames: ReadonlyMap<string, number> = new Map()): VideoValidationIssue[] {
  const issues: VideoValidationIssue[] = [];
  const issue = (elementId: string, code: string, message: string): void => { issues.push({ elementId, code, message }); };
  const duration = compositionFrames(composition);
  if (!duration) issue("composition", "empty", "Add a picture or clip before exporting.");
  if (duration > VIDEO_EDIT_LIMITS.maxFrames) issue("composition", "duration", "The video exceeds the 60-second limit. Shorten the visual track.");
  if (new TextEncoder().encode(JSON.stringify(composition)).length > VIDEO_EDIT_LIMITS.maxCompositionBytes) issue("composition", "size", "This edit exceeds the supported document size.");
  const ids = [...composition.items.map(item => item.id), ...composition.text.map(text => text.id), ...(composition.backgroundAudio ? [composition.backgroundAudio.id] : [])];
  if (new Set(ids).size !== ids.length) issue("composition", "identity", "Each visual, text and audio element needs its own identity.");
  let bytes = 0; let decodeSeconds = 0;
  for (const versionId of sourceVersionIds(composition)) {
    const source = sources.find(version => version.id === versionId);
    // Missing, unpinned or failed sources never become exportable; a pending check still can.
    if (!source || source.object.identity !== "verified" || source.metadata.state === "failed") { for (const elementId of sourceElementIds(composition, versionId)) issues.push({ elementId, versionId, code: "source_unavailable", message: "This source is unavailable. Replace it before exporting." }); continue; }
    if (source.metadata.state !== "verified") { for (const elementId of sourceElementIds(composition, versionId)) issues.push({ elementId, versionId, code: "source_pending", message: "This source has not finished checking. Export after it is ready." }); continue; }
    bytes += source.object.bytes; decodeSeconds += source.metadata.durationSeconds;
    if (source.metadata.width && source.metadata.height && source.metadata.width * source.metadata.height > VIDEO_EDIT_LIMITS.maxSourcePixels) issue(versionId, "source_geometry", "This source exceeds the supported 4K editing bound. Keep the original and use a smaller picture or clip.");
  }
  if (bytes > VIDEO_EDIT_LIMITS.maxSourceBytes) issue("composition", "source_bytes", "The selected sources exceed the 512 MiB limit.");
  if (decodeSeconds > VIDEO_EDIT_LIMITS.maxDecodeSeconds) issue("composition", "source_duration", "The selected sources exceed five minutes of source decoding.");
  for (const item of composition.items) {
    const source = sources.find(version => version.id === item.versionId);
    if (source && (source.kind !== (item.kind === "picture" ? "image" : "video") && !(item.kind === "clip" && source.kind === "export"))) issue(item.id, "source_kind", "This source type does not match the visual item.");
    if (!item.displayFrames) issue(item.id, "duration", "Set a positive duration for this visual item.");
    if (item.kind === "clip" && (item.outFrame <= item.inFrame || item.outFrame - item.inFrame < item.displayFrames)) issue(item.id, "trim", "This source interval cannot supply the displayed duration. Change duration or choose a longer source interval.");
    if (item.kind === "clip" && source?.metadata.state === "verified" && item.outFrame > (normalizedFrames.get(item.versionId) ?? Math.floor(source.metadata.durationSeconds * 30 + 1e-6))) issue(item.id, "source_bounds", "The trim extends beyond this exact clip's available duration.");
    const audio = sourceAudioInterval(item);
    if (item.kind === "clip" && !item.sourceAudio.removed && source?.metadata.state === "verified" && source.metadata.audio === "present" && (audio.startFrame < 0 || audio.endFrame <= audio.startFrame || audio.endFrame > item.displayFrames)) issue(item.id, "source_audio_timing", "This clip's audio extends outside its visual item. Change its timing explicitly before exporting.");
    if (item.fit === "crop" && !item.crop) issue(item.id, "crop", "Choose a crop rectangle for this visual item.");
    if (item.crop && (item.crop.x + item.crop.width > 1.000001 || item.crop.y + item.crop.height > 1.000001)) issue(item.id, "crop_bounds", "Keep the crop rectangle within the source.");
  }
  for (const text of composition.text) {
    const anchor = text.anchor;
    const item = anchor.kind === "item" ? composition.items.find(candidate => candidate.id === anchor.itemId) : undefined;
    const limit = anchor.kind === "item" ? item?.displayFrames : duration;
    if (limit === undefined || text.startFrame < 0 || text.startFrame >= text.endFrame || text.endFrame > limit) issue(text.id, "text_timing", "This text extends outside its visual item or the video. Change its timing or remove it explicitly.");
    if (text.x + text.width > 1.000001 || text.y + text.height > 1.000001) issue(text.id, "text_bounds", "Keep this text box inside the output.");
    if (!text.text.trim()) issue(text.id, "text_empty", "Enter text or remove this text element.");
  }
  const audio = composition.backgroundAudio;
  if (audio) {
    const source = sources.find(version => version.id === audio.versionId);
    if (source?.metadata.state === "verified" && source.metadata.audio !== "present") issue(audio.id, "audio_missing", "This source does not contain audio.");
    if (audio.endFrame <= audio.startFrame || audio.startFrame >= duration) issue(audio.id, "audio_timing", "Place the background audio within the video.");
    const usedFrames = Math.max(0, Math.min(duration, audio.endFrame) - audio.startFrame);
    if (source?.metadata.state === "verified" && audio.sourceInFrame + usedFrames > (normalizedFrames.get(audio.versionId) ?? Math.floor(source.metadata.durationSeconds * 30 + 1e-6))) issue(audio.id, "audio_bounds", "This audio interval extends beyond the selected source.");
  }
  return issues;
}
