import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { VideoCompositionSchema } from "@shared/schemas/workflow/video-edit.schemas";
import { MediaVersionSchema } from "@shared/schemas/workflow/media.schemas";
import { EditorPreview } from "../components/EditorPreview";

const composition = VideoCompositionSchema.parse({ normalizationVersion: "vidra-cfr30/v1", preset: "landscape", fps: 30, items: [{ id: "item_one", versionId: "version_one", kind: "picture", inFrame: 0, outFrame: 90, displayFrames: 90, fit: "fit", sourceAudio: { muted: true, gain: 1 } }], text: [{ id: "text_one", text: "Exact caption", anchor: { kind: "item", itemId: "item_one" }, startFrame: 15, endFrame: 60, x: .08, y: .83, width: .84, height: .12, fontSize: 32, fontWeight: 500, color: "#ffffff", align: "center" }] });
const version = MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "version_one", ownerId: "creator", projectId: "project_one", kind: "image", label: "Stadium", origin: { kind: "upload" }, sourceInputs: [], object: { identity: "verified", assetId: "asset_one", storagePath: "users/creator/one.png", generation: "1", sha256: "a".repeat(64), bytes: 100 }, metadata: { state: "verified", width: 1920, height: 1080, durationSeconds: 0, audio: "absent", probeVersion: "fixture/v1" }, association: "linked", createdAt: "2026-10-17T05:00:00.000Z" });
const base = { composition, frame: 30, playing: false, volume: 1, muted: false, media: [version], sources: { version_one: { url: "https://owned.example/exact.png", loading: false } }, onFrame: vi.fn(), onPlaying: vi.fn(), onRetry: vi.fn(), onFailed: vi.fn() };

it("renders missing authorized sources as a repairable unavailable state without a substitute picture", () => {
  const { container } = render(<EditorPreview {...base} sources={{ version_one: { loading: false, error: "Access denied" } }} />);
  expect(screen.getByRole("heading", { name: "Source unavailable" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Retry source" })).toBeVisible();
  expect(container.querySelector("img,video")).toBeNull();
});
it("shows captions only inside their exact saved interval and does not display orphaned text", () => {
  const { rerender } = render(<EditorPreview {...base} />); expect(screen.getByText("Exact caption")).toBeVisible();
  rerender(<EditorPreview {...base} frame={60} />); expect(screen.queryByText("Exact caption")).toBeNull();
  const orphaned = { ...composition, items: [] };
  rerender(<EditorPreview {...base} composition={orphaned} />); expect(screen.queryByText("Exact caption")).toBeNull();
});
it("omits only renderer-rejected code points for the identified caption without changing saved words", () => {
  const rejected = VideoCompositionSchema.parse({ ...composition, text: [{ ...composition.text[0], text: "Evening.🔥é" }, { ...composition.text[0], id: "text_other", text: "Other 🔥" }] });
  const original = structuredClone(rejected);
  const { rerender } = render(<EditorPreview {...base} composition={rejected} issues={[{ elementId: "text_one", code: "text_render_policy", message: "Edit the unsupported character.", unsupportedCodePoints: [0x1f525] }]} />);
  expect(screen.getByText("Evening.é")).toBeVisible();
  expect(screen.getByText("Other 🔥")).toBeVisible();
  expect(rejected).toEqual(original);
  rerender(<EditorPreview {...base} composition={rejected} issues={[{ elementId: "text_one", code: "text_timing", message: "Timing needs repair.", unsupportedCodePoints: [0x1f525] }]} />);
  expect(screen.getByText("Evening.🔥é")).toBeVisible();
  rerender(<EditorPreview {...base} composition={rejected} issues={[{ elementId: "text_one", code: "text_render_policy", message: "The text exceeds its box." }]} />);
  expect(screen.getByText("Evening.🔥é")).toBeVisible();
  rerender(<EditorPreview {...base} composition={rejected} />);
  expect(screen.getByText("Evening.🔥é")).toBeVisible();
  expect(rejected).toEqual(original);
});
it("previews saved clip audio only inside its exact interval, including seeks and explicit mute", () => {
  const clip = VideoCompositionSchema.parse({ ...composition, items: [{ ...composition.items[0], kind: "clip", inFrame: 30, outFrame: 120, sourceAudio: { muted: false, gain: .75, timing: { startFrame: 15, endFrame: 60 } } }], text: [] });
  const media = [MediaVersionSchema.parse({ ...version, kind: "video", metadata: { ...version.metadata, durationSeconds: 4, audio: "present" } })];
  const { container, rerender } = render(<EditorPreview {...base} media={media} composition={clip} frame={14} />);
  const player = container.querySelector<HTMLVideoElement>(".ve-source-crop video"); if (!player) throw new Error("Expected exact source player");
  expect(player.muted).toBe(true); expect(player.currentTime).toBeCloseTo(44 / 30);
  rerender(<EditorPreview {...base} media={media} composition={clip} frame={15} />); expect(player.muted).toBe(false); expect(player.volume).toBe(.75);
  rerender(<EditorPreview {...base} media={media} composition={clip} frame={59} />); expect(player.muted).toBe(false);
  rerender(<EditorPreview {...base} media={media} composition={clip} frame={60} />); expect(player.muted).toBe(true);
  rerender(<EditorPreview {...base} media={media} composition={clip} frame={30} muted />); expect(player.muted).toBe(true);
  const removed = VideoCompositionSchema.parse({ ...clip, items: clip.items.map(item => ({ ...item, sourceAudio: { ...item.sourceAudio, removed: true } })) });
  rerender(<EditorPreview {...base} media={media} composition={removed} frame={30} />); expect(player.muted).toBe(true);
  rerender(<EditorPreview {...base} media={media} composition={clip} frame={30} />); expect(player.muted).toBe(false);
  expect(clip.items[0]?.sourceAudio).toEqual({ muted: false, gain: .75, timing: { startFrame: 15, endFrame: 60 } });
});
