import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { VideoCompositionSchema } from "@shared/schemas/workflow/video-edit.schemas";
import { EditorTimeline } from "../components/EditorTimeline";

it("draws background music only up to the edit end that export uses", () => {
  const composition = VideoCompositionSchema.parse({ normalizationVersion: "vidra-cfr30/v1", preset: "landscape", fps: 30, items: [{ id: "item_one", versionId: "version_one", kind: "clip", inFrame: 0, outFrame: 240, displayFrames: 240, fit: "fit", sourceAudio: { muted: false, gain: 1 } }], text: [], backgroundAudio: { id: "audio_one", versionId: "version_music", sourceInFrame: 0, startFrame: 0, endFrame: 360, gain: .35 } });
  render(<EditorTimeline composition={composition} media={[]} sources={{}} frame={0} zoom={1} readonly={false} onSeek={vi.fn()} onSelect={vi.fn()} onMove={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Background audio" })).toHaveStyle({ left: "0px", width: `${8 * 68}px` });
});

it("puts a voiceover take on its own lane between clip sound and music (S11)", () => {
  const onSelect = vi.fn();
  const composition = VideoCompositionSchema.parse({ normalizationVersion: "vidra-cfr30/v1", preset: "landscape", fps: 30, items: [{ id: "item_one", versionId: "version_one", kind: "clip", inFrame: 0, outFrame: 240, displayFrames: 240, fit: "fit", sourceAudio: { muted: false, gain: 1 } }], text: [], voiceover: { id: "audio_voice", versionId: "version_voice", sourceInFrame: 0, startFrame: 30, endFrame: 120, gain: 1 }, backgroundAudio: { id: "audio_music", versionId: "version_music", sourceInFrame: 0, startFrame: 0, endFrame: 240, gain: 0.35 } });
  const { container } = render(<EditorTimeline composition={composition} media={[]} sources={{}} frame={0} zoom={1} readonly={false} onSeek={vi.fn()} onSelect={onSelect} onMove={vi.fn()} />);
  const voice = screen.getByRole("button", { name: "Voiceover" });
  expect(voice).toHaveStyle({ left: "68px", width: `${3 * 68}px` });
  const lanes = [...container.querySelectorAll(".ve-source-audio-lane, .ve-voiceover-lane, .ve-background-lane")].map(lane => lane.className);
  expect(lanes).toEqual(["ve-source-audio-lane", "ve-voiceover-lane", "ve-background-lane"]);
  voice.click();
  expect(onSelect).toHaveBeenCalledWith({ kind: "voiceover" });
});

it("stacks the compact editor's lanes in the full editor's order", () => {
  const composition = VideoCompositionSchema.parse({ normalizationVersion: "vidra-cfr30/v1", preset: "landscape", fps: 30, items: [{ id: "item_one", versionId: "version_one", kind: "clip", inFrame: 0, outFrame: 240, displayFrames: 240, fit: "fit", sourceAudio: { muted: false, gain: 1 } }], text: [{ id: "text_one", text: "Run", anchor: { kind: "item", itemId: "item_one" }, startFrame: 0, endFrame: 60, x: .08, y: .83, width: .84, height: .12, fontSize: 32, color: "#ffffff", align: "center" }], voiceover: { id: "audio_voice", versionId: "version_voice", sourceInFrame: 0, startFrame: 0, endFrame: 120, gain: 1 }, backgroundAudio: { id: "audio_music", versionId: "version_music", sourceInFrame: 0, startFrame: 0, endFrame: 240, gain: 0.35 } });
  const { container } = render(<EditorTimeline compact composition={composition} media={[]} sources={{}} frame={0} zoom={1} readonly={false} onSeek={vi.fn()} onSelect={vi.fn()} onMove={vi.fn()} />);
  const labels = [...container.querySelectorAll<HTMLElement>(".ve-track-labels span")].sort((a, b) => parseFloat(a.style.top) - parseFloat(b.style.top)).map(label => label.textContent);
  expect(labels).toEqual(["Video", "Captions", "Voiceover", "Music"]);
});
