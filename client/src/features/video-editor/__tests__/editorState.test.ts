import { expect, it } from "vitest";
import { VideoCompositionSchema } from "@shared/schemas/workflow/video-edit.schemas";
import { withVideoPreset } from "@shared/video-edit/composition";
import { BOTTOM_CENTER_CAPTION_PLACEMENT, DEFAULT_CAPTION_FONT_SIZE, captionInterval, createCaption, frameTime, itemAtFrame, itemPositions } from "../state/editorState";

const composition = VideoCompositionSchema.parse({ normalizationVersion: "vidra-cfr30/v1", preset: "landscape", fps: 30, items: [
  { id: "clip_a", versionId: "version_a", kind: "clip", inFrame: 30, outFrame: 150, displayFrames: 120, fit: "fit", sourceAudio: { muted: false, gain: 1 } },
  { id: "picture_b", versionId: "version_b", kind: "picture", inFrame: 0, outFrame: 90, displayFrames: 90, fit: "fill", sourceAudio: { muted: true, gain: 1 } },
], text: [{ id: "text_one", text: "Caption", anchor: { kind: "item", itemId: "picture_b" }, startFrame: 15, endFrame: 60, x: .1, y: .8, width: .8, height: .1, color: "#ffffff", fontSize: 32, align: "center" }] });
it("selects exact boundaries without switching to a preferred version", () => {
  expect(itemPositions(composition).map(row => [row.start, row.end])).toEqual([[0, 120], [120, 210]]);
  expect(itemAtFrame(composition, 119)?.item.versionId).toBe("version_a");
  expect(itemAtFrame(composition, 120)?.item.versionId).toBe("version_b");
  expect(itemAtFrame(composition, 210)?.item.versionId).toBe("version_b");
});
it("resolves attached caption times from the current item's position", () => {
  const caption = composition.text[0]; if (!caption) throw new Error("Missing fixture caption");
  expect(captionInterval(composition, caption)).toEqual({ start: 135, end: 180 });
  expect(captionInterval({ ...composition, items: [...composition.items].reverse() }, caption)).toEqual({ start: 15, end: 60 });
});
it("formats tenths from exact frames across fractional seconds and minute boundaries", () => {
  expect([153, 156, 159, 1833, 1857].map(frame => frameTime(frame, true))).toEqual(["0:05.1", "0:05.2", "0:05.3", "1:01.1", "1:01.9"]);
  expect(frameTime(153)).toBe("0:05");
});
it("creates new source-sized Inter captions with explicit leading without reinterpreting saved legacy captions", () => {
  const saved = structuredClone(composition);
  const cue = createCaption(composition, composition.items[0]);
  expect(cue).toMatchObject({ ...BOTTOM_CENTER_CAPTION_PLACEMENT, fontSize: DEFAULT_CAPTION_FONT_SIZE, fontFamily: "Inter", fontWeight: 500, letterSpacingEm: 0, lineHeightEm: 1.3, anchor: { kind: "item", itemId: "clip_a" }, endFrame: 120 });
  expect(composition).toEqual(saved);
  expect(composition.text[0]).not.toHaveProperty("fontFamily");
  expect(composition.text[0]?.fontSize).toBe(32);
});
it.each(["portrait", "square"] as const)("uses the same visible default caption height when it is added after choosing %s", preset => {
  const landscape = createCaption(composition, composition.items[0]);
  const converted = withVideoPreset({ ...composition, text: [landscape] }, preset);
  const createdAfterFormat = createCaption({ ...composition, preset }, composition.items[0]);
  expect(createdAfterFormat.fontSize).toBe(converted.text[0]?.fontSize);
  expect(createdAfterFormat).toMatchObject({ fontFamily: "Inter", fontWeight: 500, letterSpacingEm: 0, lineHeightEm: 1.3 });
  expect(composition.text[0]?.fontSize).toBe(32);
});

it("creates an explicit portrait Bottom centre anchor without moving existing custom captions", () => {
  const portrait = { ...composition, preset: "portrait" as const };
  const before = structuredClone(portrait);
  const created = createCaption(portrait, portrait.items[0]);
  expect(created.placement).toBe("bottom-center");
  expect(created.y * 520).toBeCloseTo(452.65, 6);
  expect(created.height).toBe(.12);
  expect(created.fontSize).toBe(77.575111);
  expect(portrait).toEqual(before);
  expect(portrait.text[0]).not.toHaveProperty("placement");
});
