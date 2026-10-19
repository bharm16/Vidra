import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { VideoCompositionSchema } from "@shared/schemas/workflow/video-edit.schemas";
import { EditorIssues } from "../components/EditorIssues";

const composition = VideoCompositionSchema.parse({ normalizationVersion: "vidra-cfr30/v1", preset: "landscape", fps: 30, items: [{ id: "clip", versionId: "version_one", kind: "clip", inFrame: 0, outFrame: 60, displayFrames: 60, fit: "fit", sourceAudio: { muted: false, gain: 1, timing: { startFrame: 0, endFrame: 120 } } }], text: [{ id: "caption", text: "Keep these words", anchor: { kind: "item", itemId: "clip" }, startFrame: 30, endFrame: 105, x: .1, y: .8, width: .8, height: .1, fontSize: 32, color: "#ffffff", align: "center" }] });

it("groups the two retained E04 intervals into one exact-source warning and repair action", () => {
  const onRepair = vi.fn();
  render(<EditorIssues composition={composition} issues={[{ elementId: "clip", code: "source_audio_timing", message: "Audio outside clip" }, { elementId: "caption", code: "text_timing", message: "Caption outside clip" }]} onSelect={vi.fn()} onRepair={onRepair} />);
  expect(screen.getByText("Two timings extend past Clip 1")).toBeVisible();
  expect(screen.getByText("Caption ends at 3.5s. Clip audio ends at 4.0s. The clip is now 2.0s.")).toBeVisible();
  expect(onRepair).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Fix timing" })); expect(onRepair).toHaveBeenCalledWith({ kind: "text", id: "caption" });
});

it("routes a retained audio-only error to that clip's audio without fabricating a caption", () => {
  const onRepair = vi.fn(); const onSelect = vi.fn();
  render(<EditorIssues composition={{ ...composition, text: [] }} issues={[{ elementId: "clip", code: "source_audio_timing", message: "Audio outside clip" }]} onSelect={onSelect} onRepair={onRepair} />);
  fireEvent.click(screen.getByRole("button", { name: "Fix timing" })); expect(onRepair).toHaveBeenCalledWith({ kind: "source-audio", id: "clip" }); expect(onSelect).not.toHaveBeenCalled();
});

it("shows the source E20 instruction and opens the renderer-identified caption", () => {
  const onSelect = vi.fn();
  render(<EditorIssues composition={composition} issues={[{ elementId: "caption", code: "text_render_policy", message: "Text caption: this font does not support 🔥.", unsupportedCodePoints: [0x1f525] }]} onSelect={onSelect} onRepair={vi.fn()} />);
  expect(screen.getByText("Caption 1 cannot be exported")).toBeVisible();
  expect(screen.getByText("Choose a font or edit the unsupported character.")).toBeVisible();
  expect(screen.queryByText("Text caption: this font does not support 🔥.")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Edit caption" }));
  expect(onSelect).toHaveBeenCalledWith({ kind: "text", id: "caption" });
});
