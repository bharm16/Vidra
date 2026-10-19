import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { VideoCompositionSchema } from "@shared/schemas/workflow/video-edit.schemas";
import { EditorTimeline } from "../components/EditorTimeline";

it("draws background music only up to the edit end that export uses", () => {
  const composition = VideoCompositionSchema.parse({ normalizationVersion: "vidra-cfr30/v1", preset: "landscape", fps: 30, items: [{ id: "item_one", versionId: "version_one", kind: "clip", inFrame: 0, outFrame: 240, displayFrames: 240, fit: "fit", sourceAudio: { muted: false, gain: 1 } }], text: [], backgroundAudio: { id: "audio_one", versionId: "version_music", sourceInFrame: 0, startFrame: 0, endFrame: 360, gain: .35 } });
  render(<EditorTimeline composition={composition} media={[]} sources={{}} frame={0} zoom={1} readonly={false} onSeek={vi.fn()} onSelect={vi.fn()} onMove={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Background audio" })).toHaveStyle({ left: "0px", width: `${8 * 68}px` });
});
