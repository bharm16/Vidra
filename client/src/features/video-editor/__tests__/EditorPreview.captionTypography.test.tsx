import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { VideoCompositionSchema } from "@shared/schemas/workflow/video-edit.schemas";
import { MediaVersionSchema } from "@shared/schemas/workflow/media.schemas";
import { EditorPreview } from "../components/EditorPreview";

const composition = VideoCompositionSchema.parse({ normalizationVersion: "vidra-cfr30/v1", preset: "landscape", fps: 30, items: [{ id: "item_one", versionId: "version_one", kind: "picture", inFrame: 0, outFrame: 90, displayFrames: 90, fit: "fit", sourceAudio: { muted: true, gain: 1 } }], text: [{ id: "text_figtree", text: "Saved Figtree caption", anchor: { kind: "item", itemId: "item_one" }, startFrame: 0, endFrame: 90, x: 12 / 358, y: .8, width: 334 / 358, height: .12, fontSize: 69.72067, fontWeight: 500, fontFamily: "Figtree", letterSpacingEm: .01, lineHeightEm: 18 / 13, color: "#f7f7f7", align: "center" }] });
const media = [MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "version_one", ownerId: "creator", projectId: "project_one", kind: "image", label: "Stadium", origin: { kind: "upload" }, sourceInputs: [], object: { identity: "verified", assetId: "asset_one", storagePath: "users/creator/one.png", generation: "1", sha256: "a".repeat(64), bytes: 100 }, metadata: { state: "verified", width: 1920, height: 1080, durationSeconds: 0, audio: "absent", probeVersion: "fixture/v1" }, association: "linked", createdAt: "2026-10-17T05:00:00.000Z" })];
const props = { frame: 30, playing: false, volume: 1, muted: false, media, sources: { version_one: { url: "https://owned.example/exact.png", loading: false } }, onFrame: vi.fn(), onPlaying: vi.fn(), onRetry: vi.fn(), onFailed: vi.fn() };

it("keeps saved caption typography through a viewport change and separate edit selection", () => {
  const before = structuredClone(composition);
  const { rerender } = render(<EditorPreview {...props} composition={composition} />);
  const cue = screen.getByText("Saved Figtree caption");
  expect(cue.style.fontFamily).toContain("Vidra Video Figtree");
  expect(cue.style.fontWeight).toBe("500");
  expect(cue.style.letterSpacing).toBe("0.01em");
  expect(Number(cue.style.lineHeight)).toBeCloseTo(18 / 13);
  window.dispatchEvent(new Event("resize"));
  rerender(<EditorPreview {...props} composition={composition} />);
  expect(cue.style.fontFamily).toContain("Vidra Video Figtree");
  expect(composition).toEqual(before);

  const legacy = VideoCompositionSchema.parse({ ...composition, text: [{ ...composition.text[0], id: "text_legacy", text: "Legacy Inter caption", fontFamily: undefined, letterSpacingEm: undefined, lineHeightEm: undefined, fontSize: 32 }] });
  rerender(<EditorPreview {...props} composition={legacy} />);
  const oldCue = screen.getByText("Legacy Inter caption");
  expect(oldCue.style.fontFamily).toBe("");
  expect(oldCue.style.lineHeight).toBe("");
  expect(oldCue.style.letterSpacing).toBe("");
  expect(legacy.text[0]?.fontSize).toBe(32);
  rerender(<EditorPreview {...props} composition={composition} />);
  expect(screen.getByText("Saved Figtree caption").style.letterSpacing).toBe("0.01em");
  expect(Number(screen.getByText("Saved Figtree caption").style.lineHeight)).toBeCloseTo(18 / 13);
});
