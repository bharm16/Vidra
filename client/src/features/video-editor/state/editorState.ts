import { VideoItemSchema, VideoTextSchema, type VideoComposition, type VideoItem, type VideoText } from "@shared/schemas/workflow/video-edit.schemas";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { VIDEO_PRESETS } from "@shared/video-edit/composition";
import { captionPlacement, LANDSCAPE_BOTTOM_CENTER_CAPTION } from "@shared/video-edit/captionPlacement";

// Bottom-centre placement from retained E30 preview (932:109881), in output coordinates.
export const BOTTOM_CENTER_CAPTION_PLACEMENT = LANDSCAPE_BOTTOM_CENTER_CAPTION;
// E30's rendered 21.010px text at 924.444px output width, expressed in the
// 1920px landscape export's pixels. Three decimals retain subpixel precision.
export const DEFAULT_CAPTION_FONT_SIZE = 43.636;

export const EMPTY_COMPOSITION: VideoComposition = { normalizationVersion: "vidra-cfr30/v1", preset: "landscape", fps: 30, items: [], text: [] };
export interface PositionedItem { item: VideoItem; start: number; end: number; }
export function itemPositions(composition: VideoComposition): PositionedItem[] { let cursor = 0; return composition.items.map(item => { const start = cursor; cursor += item.displayFrames; return { item, start, end: cursor }; }); }
export function totalFrames(composition: VideoComposition): number { return composition.items.reduce((sum, item) => sum + item.displayFrames, 0); }
export function itemAtFrame(composition: VideoComposition, frame: number): PositionedItem | undefined { const items = itemPositions(composition); return items.find(row => frame >= row.start && frame < row.end) ?? (frame === totalFrames(composition) ? items.at(-1) : undefined); }
export function captionInterval(composition: VideoComposition, caption: VideoText): { start: number; end: number } | undefined { const offset = caption.anchor.kind === "item" ? itemPositions(composition).find(row => row.item.id === (caption.anchor.kind === "item" ? caption.anchor.itemId : ""))?.start : 0; return offset === undefined ? undefined : { start: offset + caption.startFrame, end: offset + caption.endFrame }; }
export function createItem(version: MediaVersion, normalizedFrames?: number): VideoItem { const clip = version.kind === "video" || version.kind === "export"; const duration = version.metadata.state === "verified" ? version.metadata.durationSeconds : 0; const frames = clip ? normalizedFrames ?? Math.max(1, Math.floor(duration * 30 + 1e-6)) : 90; return VideoItemSchema.parse({ id: `item_${crypto.randomUUID()}`, versionId: version.id, kind: clip ? "clip" : "picture", inFrame: 0, outFrame: frames, displayFrames: frames, fit: "fit", sourceAudio: { muted: version.metadata.state !== "verified" || version.metadata.audio !== "present", gain: 1 } }); }
export function createCaption(composition: VideoComposition, item?: VideoItem): VideoText { const heightRatio = VIDEO_PRESETS[composition.preset].height / VIDEO_PRESETS.landscape.height; return VideoTextSchema.parse({ id: `text_${crypto.randomUUID()}`, text: "Your caption", anchor: item ? { kind: "item", itemId: item.id } : { kind: "composition" }, startFrame: 0, endFrame: Math.min(item?.displayFrames ?? totalFrames(composition), 120), ...captionPlacement(composition.preset, "bottom-center"), placement: "bottom-center", fontSize: Number((DEFAULT_CAPTION_FONT_SIZE * heightRatio).toFixed(6)), fontWeight: 500, fontFamily: "Inter", letterSpacingEm: 0, lineHeightEm: 1.3, color: "#F7F7F7", align: "center" }); }
export function frameTime(frame: number, precise = false): string { const safeFrame = Math.max(0, frame); const seconds = Math.floor(safeFrame / 30); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}${precise ? `.${Math.floor((safeFrame % 30) / 3)}` : ""}`; }
