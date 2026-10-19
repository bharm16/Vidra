import { useState, type ReactElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MediaVersionSchema } from "@shared/schemas/workflow/media.schemas";
import { VideoCompositionSchema, type EditCommand, type VideoComposition } from "@shared/schemas/workflow/video-edit.schemas";
import { applyEditCommand, sourceAudioInterval, validateVideoComposition } from "@shared/video-edit/composition";
import { AudioControls } from "../components/EditorPanels";
import { EditorTimeline } from "../components/EditorTimeline";
import { TimingRepair } from "../components/TimingRepair";

const media = ["one", "three"].map(id => MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", id: `version_${id}`, ownerId: "creator", projectId: "project_one", kind: "video", label: `Stadium ${id}`, origin: { kind: "upload" }, sourceInputs: [], object: { identity: "verified", assetId: `asset_${id}`, storagePath: `users/creator/${id}.mp4`, generation: "1", sha256: "a".repeat(64), bytes: 100 }, metadata: { state: "verified", width: 1920, height: 1080, durationSeconds: 8, audio: "present", probeVersion: "controlled-source-audio/v1" }, association: "linked", createdAt: "2026-10-17T05:00:00.000Z" }));
media.push(MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "version_desk", ownerId: "creator", projectId: "project_one", kind: "image", label: "Desk", origin: { kind: "upload" }, sourceInputs: [], object: { identity: "verified", assetId: "asset_desk", storagePath: "users/creator/desk.png", generation: "1", sha256: "b".repeat(64), bytes: 100 }, metadata: { state: "verified", width: 1920, height: 1080, durationSeconds: 0, audio: "absent", probeVersion: "controlled-source-audio/v1" }, association: "linked", createdAt: "2026-10-17T05:00:00.000Z" }));
const composition = VideoCompositionSchema.parse({ normalizationVersion: "vidra-cfr30/v1", preset: "landscape", fps: 30, items: [
  { id: "one", versionId: "version_one", kind: "clip", inFrame: 0, outFrame: 120, displayFrames: 120, fit: "fill", sourceAudio: { muted: false, gain: .5 } },
  { id: "two", versionId: "version_desk", kind: "picture", inFrame: 0, outFrame: 120, displayFrames: 120, fit: "fit", sourceAudio: { muted: true, gain: 1 } },
  { id: "three", versionId: "version_three", kind: "clip", inFrame: 0, outFrame: 120, displayFrames: 120, fit: "fill", sourceAudio: { muted: false, gain: .8 } },
], text: [{ id: "caption_one", text: "Make room for evening.", anchor: { kind: "item", itemId: "one" }, startFrame: 30, endFrame: 105, x: .08, y: .83, width: .84, height: .12, fontSize: 32, fontWeight: 500, color: "#F7F7F7", align: "center" }] });
const trimmed = (): VideoComposition => applyEditCommand(composition, { kind: "trim", itemId: "one", inFrame: 0, outFrame: 60 });

it("shows the retained audio overrun after a trim instead of silently shrinking the waveform", () => {
  const value = trimmed();
  expect(sourceAudioInterval(value.items[0]!)).toEqual({ startFrame: 0, endFrame: 120 });
  expect(composition.items[0]?.sourceAudio.timing).toBeUndefined();
  expect(validateVideoComposition(value, media)).toContainEqual(expect.objectContaining({ elementId: "one", code: "source_audio_timing" }));
  const select = vi.fn();
  render(<EditorTimeline composition={value} media={media} sources={{}} frame={30} zoom={1} readonly={false} onSeek={vi.fn()} onSelect={select} onMove={vi.fn()} />);
  const sound = screen.getByRole("button", { name: "Clip sound for Stadium one, timing outside clip" });
  expect(sound).toHaveStyle({ left: "0px", width: "272px" });
  expect(screen.getByRole("button", { name: /^Edit Stadium one/ })).toHaveStyle({ width: "136px" });
  expect(sound).toHaveAttribute("data-timing-invalid", "true");
  expect(screen.getByRole("button", { name: "Make room for evening." })).toHaveAttribute("data-timing-invalid", "true");
  fireEvent.click(sound);
  expect(select).toHaveBeenCalledWith({ kind: "source-audio", id: "one" });
});

it("keeps the shifted interval visible when the beginning of a clip is trimmed", () => {
  const value = applyEditCommand(composition, { kind: "trim", itemId: "one", inFrame: 30, outFrame: 90 });
  render(<EditorTimeline composition={value} media={media} sources={{}} frame={0} zoom={1} readonly={false} onSeek={vi.fn()} onSelect={vi.fn()} onMove={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Clip sound for Stadium one, timing outside clip" })).toHaveStyle({ left: "-68px", width: "272px" });
  expect(sourceAudioInterval(value.items[0]!)).toEqual({ startFrame: -30, endFrame: 90 });
});

it("applies only the selected clip's reviewed caption and audio repair in one reversible composition change", () => {
  const value = trimmed();
  value.items[2]!.sourceAudio.timing = { startFrame: 0, endFrame: 180 };
  value.text.push({ ...value.text[0]!, id: "caption_three", anchor: { kind: "item", itemId: "three" }, endFrame: 150 });
  const before = structuredClone(value), command = vi.fn(), done = vi.fn();
  render(<TimingRepair composition={value} media={media} target={{ kind: "item", itemId: "one" }} disabled={false} command={command} onDone={done} onManual={vi.fn()} />);
  expect(screen.getByText("Fit the timing to Clip 1")).toBeVisible();
  expect(screen.getByText("Caption 1.0–3.5s → 1.0–2.0s")).toBeVisible();
  expect(screen.getByText("Clip audio 0.0–4.0s → 0.0–2.0s")).toBeVisible();
  expect(screen.queryByRole("button", { name: /^Remove/ })).toBeNull();
  expect(command).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Apply shorter timing" }));
  const expected = { ...before, items: before.items.map(item => item.id === "one" ? { ...item, sourceAudio: { ...item.sourceAudio, timing: { startFrame: 0, endFrame: 60 } } } : item), text: before.text.map(text => text.id === "caption_one" ? { ...text, endFrame: 60 } : text) };
  expect(command).toHaveBeenCalledExactlyOnceWith({ kind: "replace_composition", composition: expected });
  expect(done).toHaveBeenCalledOnce();
  expect(value).toEqual(before);
  expect(validateVideoComposition(expected, media)).not.toContainEqual(expect.objectContaining({ elementId: "one", code: "source_audio_timing" }));
  expect(validateVideoComposition(expected, media)).toContainEqual(expect.objectContaining({ elementId: "three", code: "source_audio_timing" }));
});

it("composition-anchored repair does not change a clip's caption or retained source audio", () => {
  const value = trimmed();
  value.text.push({ ...value.text[0]!, id: "video_caption", anchor: { kind: "composition" }, startFrame: 0, endFrame: 330 });
  const command = vi.fn();
  render(<TimingRepair composition={value} media={media} target={{ kind: "composition" }} disabled={false} command={command} onDone={vi.fn()} onManual={vi.fn()} />);
  expect(screen.queryByText(/Clip audio/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Apply shorter timing" }));
  expect(command).toHaveBeenCalledExactlyOnceWith({ kind: "replace_composition", composition: { ...value, text: value.text.map(text => text.id === "video_caption" ? { ...text, endFrame: 300 } : text) } });
});

it("does not repair an absent audio stream and uses explicit attached timing only when media was not supplied", () => {
  const value = { ...trimmed(), text: [] }, command = vi.fn();
  const silent = media.map(version => MediaVersionSchema.parse({ ...version, metadata: { ...version.metadata, audio: "absent" } }));
  const view = render(<TimingRepair composition={value} media={silent} target={{ kind: "item", itemId: "one" }} disabled={false} command={command} onDone={vi.fn()} onManual={vi.fn()} />);
  expect(screen.queryByText(/Clip audio/)).toBeNull();
  expect(screen.getByRole("button", { name: "Apply shorter timing" })).toBeDisabled();
  view.rerender(<TimingRepair composition={value} target={{ kind: "item", itemId: "one" }} disabled={false} command={command} onDone={vi.fn()} onManual={vi.fn()} />);
  expect(screen.getByText("Clip audio 0.0–4.0s → 0.0–2.0s")).toBeVisible();
  expect(screen.getByRole("button", { name: "Apply shorter timing" })).toBeEnabled();
});

it("manual editing and a missing target never silently repair another group", () => {
  const value = trimmed(), before = structuredClone(value), command = vi.fn(), manual = vi.fn();
  const view = render(<TimingRepair composition={value} media={media} target={{ kind: "item", itemId: "one" }} disabled={false} command={command} onDone={vi.fn()} onManual={manual} />);
  fireEvent.click(screen.getByRole("button", { name: "Keep editing manually" }));
  expect(manual).toHaveBeenCalledOnce(); expect(command).not.toHaveBeenCalled(); expect(value).toEqual(before);
  view.rerender(<TimingRepair composition={value} media={media} target={{ kind: "item", itemId: "removed_item" }} disabled={false} command={command} onDone={vi.fn()} onManual={manual} />);
  expect(screen.getByRole("button", { name: "Apply shorter timing" })).toBeDisabled();
  expect(command).not.toHaveBeenCalled();
});

it("does not manufacture a new interval when retained caption and audio timing no longer overlap the clip", () => {
  const value = trimmed(), before = structuredClone(value), command = vi.fn(), manual = vi.fn();
  value.items[0]!.sourceAudio.timing = { startFrame: 90, endFrame: 120 };
  value.text[0] = { ...value.text[0]!, startFrame: 90, endFrame: 120 };
  const retained = structuredClone(value);
  render(<TimingRepair composition={value} media={media} target={{ kind: "item", itemId: "one" }} disabled={false} command={command} onDone={vi.fn()} onManual={manual} />);
  expect(screen.getByText("Caption 3.0–4.0s")).toBeVisible();
  expect(screen.getByText("Clip audio 3.0–4.0s")).toBeVisible();
  expect(screen.queryByText(/2\.0–2\.0s/)).toBeNull();
  expect(screen.getByRole("button", { name: "Apply shorter timing" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Apply shorter timing" }));
  fireEvent.click(screen.getByRole("button", { name: "Keep editing manually" }));
  expect(command).not.toHaveBeenCalled(); expect(manual).toHaveBeenCalledOnce(); expect(value).toEqual(retained);
  expect(before.items[0]?.sourceAudio.timing).toEqual({ startFrame: 0, endFrame: 120 });
});

it("keeps legitimate single-frame intersections precise in the reviewed timing", () => {
  const value = { ...trimmed(), text: [] }, command = vi.fn();
  value.items[0]!.sourceAudio.timing = { startFrame: 59, endFrame: 120 };
  render(<TimingRepair composition={value} media={media} target={{ kind: "item", itemId: "one" }} disabled={false} command={command} onDone={vi.fn()} onManual={vi.fn()} />);
  expect(screen.getByText("Clip audio 1.97–4.0s → 1.97–2.0s")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Apply shorter timing" }));
  expect(command).toHaveBeenCalledExactlyOnceWith({ kind: "replace_composition", composition: { ...value, items: value.items.map(item => item.id === "one" ? { ...item, sourceAudio: { ...item.sourceAudio, timing: { startFrame: 59, endFrame: 60 } } } : item) } });
});

it("removes only an explicitly chosen fully excluded caption, then removes its clip audio without changing the retained interval", () => {
  const value = trimmed(), command = vi.fn(), done = vi.fn();
  value.items[0]!.sourceAudio.timing = { startFrame: 90, endFrame: 120 };
  value.text[0] = { ...value.text[0]!, startFrame: 90, endFrame: 120 };
  value.text.push({ ...value.text[0]!, id: "caption_three", text: "Keep the other clip.", anchor: { kind: "item", itemId: "three" }, startFrame: 0, endFrame: 30 });
  const before = structuredClone(value);
  const view = render(<TimingRepair composition={value} media={media} target={{ kind: "item", itemId: "one" }} disabled={false} command={command} onDone={done} onManual={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Remove caption: Make room for evening." }));
  expect(command).toHaveBeenLastCalledWith({ kind: "remove_text", textId: "caption_one" });
  const withoutCaption = applyEditCommand(value, command.mock.calls[0]![0]);
  expect(withoutCaption.text).toEqual([before.text[1]]);
  expect(withoutCaption.items).toEqual(before.items);
  expect(validateVideoComposition(withoutCaption, media)).toContainEqual(expect.objectContaining({ elementId: "one", code: "source_audio_timing" }));
  view.rerender(<TimingRepair composition={withoutCaption} media={media} target={{ kind: "item", itemId: "one" }} disabled={false} command={command} onDone={done} onManual={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Remove clip audio" }));
  expect(command).toHaveBeenLastCalledWith({ kind: "source_audio", itemId: "one", muted: false, gain: .5, removed: true });
  const removed = applyEditCommand(withoutCaption, command.mock.calls[1]![0]);
  expect(removed.items[0]?.sourceAudio).toEqual({ ...before.items[0]!.sourceAudio, removed: true });
  expect(removed.items.slice(1)).toEqual(before.items.slice(1));
  expect(validateVideoComposition(removed, media)).toEqual([]);
  expect(done).toHaveBeenCalledTimes(2);
  expect(value).toEqual(before);
  const undoAudio = applyEditCommand(removed, { kind: "replace_composition", composition: withoutCaption });
  const undoBoth = applyEditCommand(undoAudio, { kind: "replace_composition", composition: before });
  expect(undoBoth).toEqual(before);
  expect(validateVideoComposition(undoBoth, media)).toEqual(expect.arrayContaining([expect.objectContaining({ code: "source_audio_timing" }), expect.objectContaining({ code: "text_timing" })]));
});

it("omits removed sound from the timeline and repair rows while later gain changes preserve its removal", () => {
  const value = { ...trimmed(), text: [] };
  value.items = value.items.slice(0, 1);
  value.items[0]!.sourceAudio.removed = true;
  const before = structuredClone(value);
  const view = render(<EditorTimeline composition={value} media={media} sources={{}} frame={0} zoom={1} compact readonly={false} onSeek={vi.fn()} onSelect={vi.fn()} onMove={vi.fn()} />);
  expect(screen.queryByRole("button", { name: /Clip sound/ })).toBeNull();
  expect(screen.queryByText("Clip sound")).toBeNull();
  expect(screen.getByRole("button", { name: /^Edit Stadium one/ })).toBeVisible();
  view.rerender(<TimingRepair composition={value} media={media} target={{ kind: "item", itemId: "one" }} disabled={false} command={vi.fn()} onDone={vi.fn()} onManual={vi.fn()} />);
  expect(screen.queryByText(/Clip audio/)).toBeNull();
  expect(screen.queryByRole("button", { name: "Remove clip audio" })).toBeNull();
  expect(screen.getByRole("button", { name: "Apply shorter timing" })).toBeDisabled();
  const changed = applyEditCommand(value, { kind: "source_audio", itemId: "one", muted: true, gain: .2 });
  expect(changed.items[0]?.sourceAudio).toEqual({ ...before.items[0]!.sourceAudio, muted: true, gain: .2 });
  expect(validateVideoComposition(changed, media)).toEqual([]);
});

it("identifies every excluded cue and disables destructive controls while an edit is pending", () => {
  const value = trimmed(), command = vi.fn();
  value.items[0]!.sourceAudio.timing = { startFrame: 90, endFrame: 120 };
  value.text = Array.from({ length: 20 }, (_, index) => ({ ...value.text[0]!, id: `caption_${index}`, text: `Retained cue ${index + 1}`, startFrame: 90, endFrame: 120 }));
  const view = render(<TimingRepair composition={value} media={media} target={{ kind: "item", itemId: "one" }} disabled command={command} onDone={vi.fn()} onManual={vi.fn()} />);
  expect(screen.getAllByRole("button", { name: /^Remove caption:/ })).toHaveLength(20);
  for (const button of screen.getAllByRole("button", { name: /^Remove/ })) expect(button).toBeDisabled();
  view.rerender(<TimingRepair composition={value} media={media} target={{ kind: "item", itemId: "one" }} disabled={false} command={command} onDone={vi.fn()} onManual={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Remove caption: Retained cue 20" }));
  expect(command).toHaveBeenCalledExactlyOnceWith({ kind: "remove_text", textId: "caption_19" });
});

function AudioHarness({ initial, onCommand }: { initial: VideoComposition; onCommand(command: EditCommand): void }): ReactElement {
  const [value, setValue] = useState(initial);
  const item = value.items[0];
  if (!item) throw new Error("Audio harness requires a visual item");
  return <AudioControls composition={value} item={item} disabled={false} command={command => { onCommand(command); if (command.kind === "restore") throw new Error("Not a history action"); setValue(current => applyEditCommand(current, command)); }} />;
}

it("normal volume and mute controls preserve retained invalid timing and do not invent timing fields", () => {
  const command = vi.fn(), value = trimmed();
  render(<AudioHarness initial={value} onCommand={command} />);
  expect(screen.queryByRole("spinbutton", { name: /Start|End/ })).toBeNull();
  const slider = screen.getByRole("slider", { name: "Clip volume" });
  fireEvent.change(slider, { target: { value: ".7" } }); fireEvent.keyUp(slider, { key: "ArrowRight" });
  fireEvent.click(screen.getByRole("button", { name: "Mute" }));
  let applied = value;
  for (const [edit] of command.mock.calls) applied = applyEditCommand(applied, edit);
  expect(applied.items[0]?.sourceAudio).toEqual({ muted: true, gain: .7, timing: { startFrame: 0, endFrame: 120 } });
  expect(validateVideoComposition(applied, media)).toContainEqual(expect.objectContaining({ elementId: "one", code: "source_audio_timing" }));
});

it("copying a deliberately shortened sound uses that interval and then keeps the occupied-track guard", () => {
  const value = structuredClone(composition), command = vi.fn();
  value.items[0] = { ...value.items[0]!, inFrame: 15, outFrame: 135, sourceAudio: { muted: false, gain: .6, timing: { startFrame: 30, endFrame: 90 } } };
  render(<AudioHarness initial={value} onCommand={command} />);
  fireEvent.click(screen.getByRole("button", { name: "Copy audio" }));
  const edit = command.mock.calls[0]?.[0]; expect(edit).toMatchObject({ kind: "copy_audio", itemId: "one" });
  const copied = applyEditCommand(value, edit);
  expect(copied.backgroundAudio).toMatchObject({ versionId: "version_one", sourceInFrame: 45, startFrame: 30, endFrame: 90 });
  expect(copied.items[0]?.sourceAudio).toEqual(value.items[0]?.sourceAudio);
  expect(screen.getByRole("button", { name: "Copy audio" })).toBeDisabled();
  expect(screen.getByText("The background audio track is already in use.")).toBeVisible();
});
