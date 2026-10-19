import { mkdtemp, rm, copyFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { afterAll, beforeAll, expect, it } from "vitest";
import { canonicalJson } from "@shared/workflow/canonicalJson";
import { applyEditCommand, validateVideoComposition } from "@shared/video-edit/composition";
import { sha256Hex } from "@utils/hash";
import { VideoExportSchema } from "@shared/schemas/workflow/video-edit.schemas";
import { MediaVersionSchema } from "@shared/schemas/workflow/media.schemas";
import { NativeVideoRenderer } from "@services/video-export/NativeVideoRenderer";
import { hashLocalFile, type ExportStorage } from "@services/video-export/ExportStorage";
import { runNative } from "@services/video-export/NativeProcess";
const root = await mkdtemp(join(tmpdir(), "vidra-render-proof-"));
const clipPath = join(root, "clip.mp4"); const picturePath = join(root, "picture.png");
const local = new Map<string, string>();
const storage: ExportStorage = { remove: async () => undefined, download: async (_owner, source, target) => { const path = local.get(source.id); if (!path) throw new Error("missing source"); await copyFile(path, target); }, inspect: async () => undefined, store: async () => { throw new Error("unused in native proof"); }, access: async () => { throw new Error("unused in native proof"); } };
const renderer = new NativeVideoRenderer(storage); const signal = new AbortController().signal;
beforeAll(async () => { await sharp({ create: { width: 64, height: 36, channels: 3, background: "#00ff00" } }).png().toFile(picturePath); await runNative("ffmpeg", ["-v", "error", "-nostdin", "-y", "-f", "lavfi", "-i", "color=c=red:s=64x36:r=30:d=0.5", "-f", "lavfi", "-i", "color=c=blue:s=64x36:r=30:d=0.5", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1", "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v]", "-map", "[v]", "-map", "2:a", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", clipPath], { timeoutMs: 30_000 }); }, 30_000);
afterAll(async () => { await rm(root, { recursive: true, force: true }); });
async function record() {
 const timestamp = "2026-10-17T00:00:00.000Z";
 const source = async (id: string, path: string, kind: "image" | "video") => { const evidence = await hashLocalFile(path); local.set(`version_${id}`, path); return MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", id: `version_${id}`, ownerId: "creator", projectId: "project_native", kind, label: id, origin: { kind: "upload" }, sourceInputs: [], object: { identity: "verified", assetId: id, storagePath: `users/creator/${id}`, generation: "1", ...evidence }, metadata: { state: "verified", width: 64, height: 36, durationSeconds: kind === "image" ? 0 : 1, audio: kind === "image" ? "absent" : "present", probeVersion: "native-proof" }, association: "linked", createdAt: timestamp }); };
 const accepted = VideoExportSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "export_native", ownerId: "creator", projectId: "project_native", editId: "edit_native", revision: 7, submissionId: "submission_native", executionDraftId: "draft_native", executionDraftRevision: 1, composition: { normalizationVersion: "vidra-cfr30/v1", preset: "landscape", fps: 30, items: [{ id: "clip", versionId: "version_clip", kind: "clip", inFrame: 15, outFrame: 30, displayFrames: 15, fit: "fill", sourceAudio: { muted: false, gain: 0.75 } }, { id: "still", versionId: "version_still", kind: "picture", inFrame: 0, outFrame: 0, displayFrames: 90, fit: "fit", sourceAudio: { muted: true, gain: 1 } }], text: [{ id: "caption", text: "Vidra native export", anchor: { kind: "composition" }, startFrame: 0, endFrame: 45, x: 0.1, y: 0.1, width: 0.8, height: 0.15, fontSize: 40, fontWeight: 600, color: "#ffffff", align: "center" }], backgroundAudio: { id: "music", versionId: "version_clip", sourceInFrame: 0, startFrame: 0, endFrame: 30, gain: 0.25 } }, compositionHash: "a".repeat(64), sources: [await source("clip", clipPath, "video"), await source("still", picturePath, "image")], renderer: await renderer.fingerprint(), attemptId: "attempt_native", state: "rendering", progress: 0, createdAt: timestamp, updatedAt: timestamp });
 accepted.compositionHash = sha256Hex(canonicalJson(accepted.composition)); return accepted;
}
it("renders exact trims, three-second still, caption, fit/fill and real audio to a verified 105-frame MP4", async () => { const input = await record(); const rendered = await renderer.render(input, signal, () => undefined); try { expect(rendered.frames).toBe(105); expect(rendered.width).toBe(1920); expect(rendered.height).toBe(1080); expect(rendered.bytes).toBeGreaterThan(1000); const first = join(root, "first.png"); const second = join(root, "second.png"); await runNative("ffmpeg", ["-v", "error", "-nostdin", "-y", "-ss", "0.1", "-i", rendered.localPath, "-frames:v", "1", first], { timeoutMs: 10_000 }); await runNative("ffmpeg", ["-v", "error", "-nostdin", "-y", "-ss", "1.6", "-i", rendered.localPath, "-frames:v", "1", second], { timeoutMs: 10_000 }); const pixel = async (path: string) => [...await sharp(path).extract({ left: 960, top: 700, width: 1, height: 1 }).raw().toBuffer()]; const blue = await pixel(first); const green = await pixel(second); expect(blue[2]).toBeGreaterThan(220); expect(blue[0]).toBeLessThan(30); expect(green[1]).toBeGreaterThan(220); expect(green[0]).toBeLessThan(30); const whitePixels = async (path: string) => { const raw = await sharp(path).extract({ left: 192, top: 108, width: 1536, height: 162 }).removeAlpha().raw().toBuffer(); let count = 0; for (let index = 0; index < raw.length; index += 3) if ((raw[index] ?? 0) > 210 && (raw[index + 1] ?? 0) > 210 && (raw[index + 2] ?? 0) > 210) count += 1; return count; }; expect(await whitePixels(first)).toBeGreaterThan(20); expect(await whitePixels(second)).toBe(0); const pcm = join(root, "audio.f32"); await runNative("ffmpeg", ["-v", "error", "-nostdin", "-y", "-i", rendered.localPath, "-map", "0:a:0", "-f", "f32le", "-ac", "1", "-ar", "48000", pcm], { timeoutMs: 10_000 }); const samples = await readFile(pcm); const peak = (start: number, end: number) => { let maximum = 0; for (let frame = start; frame < end; frame += 1) maximum = Math.max(maximum, Math.abs(samples.readFloatLE(frame * 4))); return maximum; }; expect(peak(4800, 9600)).toBeGreaterThan(0.01); expect(peak(72000, 76800)).toBeLessThan(0.0001); expect(await hashLocalFile(rendered.localPath)).toEqual({ bytes: rendered.bytes, sha256: rendered.sha256 }); } finally { await rm(rendered.directory, { recursive: true, force: true }); } }, 120_000);
it("rejects altered source bytes and renderer changes without substituting a placeholder", async () => { const input = await record(); const source = input.sources[0]; if (!source || source.object.identity !== "verified") throw new Error("fixture"); source.object.sha256 = "b".repeat(64); await expect(renderer.render(input, signal, () => undefined)).rejects.toThrow("exact stored bytes"); await expect(renderer.render({ ...input, renderer: "unavailable-build" }, signal, () => undefined)).rejects.toThrow("exact renderer"); }, 30_000);

it("normalizes an exact clip into a verified owned30fps preview without altering source bytes", async () => { const input = await record(); const source = input.sources[0]; if (!source) throw new Error("fixture"); const normalized = await renderer.normalize("creator", source, signal); try { expect(normalized.frames).toBe(30); expect(normalized.framesPerSecond).toBe(30); expect(normalized.audio).toBe("present"); expect(normalized.width).toBe(64); expect(normalized.height).toBe(36); expect(await hashLocalFile(clipPath)).toEqual(await hashLocalFile(local.get(source.id) ?? "")); } finally { await rm(normalized.directory, { recursive: true, force: true }); } }, 30_000);
it("Copy audio preserves a delayed source track's offset instead of moving sound to time zero", async () => { const delayed = join(root, "delayed.mp4"); await runNative("ffmpeg", ["-v", "error", "-nostdin", "-y", "-f", "lavfi", "-i", "color=c=blue:s=64x36:r=30:d=1", "-itsoffset", "0.25", "-f", "lavfi", "-i", "sine=frequency=800:sample_rate=48000:duration=0.5", "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "alac", delayed], { timeoutMs: 30_000 }); const input = await record(); const original = input.sources[0]; if (!original) throw new Error("fixture"); const evidence = await hashLocalFile(delayed); const source = MediaVersionSchema.parse({ ...original, id: "version_delayed", object: { identity: "verified", assetId: "delayed", storagePath: "users/creator/delayed.mp4", generation: "1", ...evidence } }); local.set(source.id, delayed); const composition = { ...input.composition, items: [{ ...input.composition.items[0], id: "delayed", versionId: source.id, kind: "clip", inFrame: 0, outFrame: 30, displayFrames: 30, fit: "fit", sourceAudio: { muted: true, gain: 1 } }], text: [], backgroundAudio: { id: "copied", versionId: source.id, sourceInFrame: 0, startFrame: 0, endFrame: 30, gain: 1 } }; const recordWithDelay = VideoExportSchema.parse({ ...input, sources: [source], composition, compositionHash: sha256Hex(canonicalJson(composition)) }); const rendered = await renderer.render(recordWithDelay, signal, () => undefined); try { const pcm = join(root, "delayed-audio.f32"); await runNative("ffmpeg", ["-v", "error", "-nostdin", "-y", "-i", rendered.localPath, "-map", "0:a:0", "-f", "f32le", "-ac", "1", "-ar", "48000", pcm], { timeoutMs: 10_000 }); const samples = await readFile(pcm); let early = 0; let late = 0; for (let frame = 4800; frame < 7200; frame += 1) early = Math.max(early, Math.abs(samples.readFloatLE(frame * 4))); for (let frame = 16800; frame < 19200; frame += 1) late = Math.max(late, Math.abs(samples.readFloatLE(frame * 4))); expect(early).toBeLessThan(0.001); expect(late).toBeGreaterThan(0.01); } finally { await rm(rendered.directory, { recursive: true, force: true }); } }, 60_000);

async function decodePcm(path: string, name: string): Promise<Buffer> {
  const pcm = join(root, name + ".f32");
  await runNative("ffmpeg", ["-v", "error", "-nostdin", "-y", "-i", path, "-map", "0:a:0", "-f", "f32le", "-ac", "1", "-ar", "48000", pcm], { timeoutMs: 10_000 });
  return readFile(pcm);
}
function pcmPeak(samples: Buffer, startSeconds: number, endSeconds: number): number {
  const start = Math.round(startSeconds * 48000), end = Math.round(endSeconds * 48000);
  expect(samples.byteLength).toBeGreaterThanOrEqual(end * 4);
  let peak = 0;
  for (let index = start; index < end; index += 1) peak = Math.max(peak, Math.abs(samples.readFloatLE(index * 4)));
  return peak;
}

it("renders only the retained source-audio subinterval with silence before and after it", async () => {
  const input = await record(); const clip = input.composition.items[0], still = input.composition.items[1];
  if (!clip || !still) throw new Error("fixture");
  const composition = { ...input.composition, items: [{ ...still, displayFrames: 15 }, { ...clip, inFrame: 0, outFrame: 30, displayFrames: 30, sourceAudio: { muted: false, gain: 0.75, timing: { startFrame: 6, endFrame: 18 } } }], text: [] };
  delete composition.backgroundAudio;
  const accepted = VideoExportSchema.parse({ ...input, composition, compositionHash: sha256Hex(canonicalJson(composition)) });
  const rendered = await renderer.render(accepted, signal, () => undefined);
  try {
    const samples = await decodePcm(rendered.localPath, "source-interval");
    expect(rendered.frames).toBe(45);
    expect(pcmPeak(samples, 0.1, 0.35)).toBeLessThan(0.0001);
    expect(pcmPeak(samples, 0.55, 0.65)).toBeLessThan(0.0001);
    expect(pcmPeak(samples, 0.8, 1)).toBeGreaterThan(0.01);
    expect(pcmPeak(samples, 1.25, 1.4)).toBeLessThan(0.0001);
    expect(await hashLocalFile(rendered.localPath)).toEqual({ bytes: rendered.bytes, sha256: rendered.sha256 });
  } finally { await rm(rendered.directory, { recursive: true, force: true }); }
}, 60_000);

it("retains delayed source-stream offset and clip source-in while gating source audio", async () => {
  const delayed = join(root, "interval-delayed.mp4");
  await runNative("ffmpeg", ["-v", "error", "-nostdin", "-y", "-f", "lavfi", "-i", "color=c=blue:s=64x36:r=30:d=2", "-itsoffset", "0.5", "-f", "lavfi", "-i", "sine=frequency=800:sample_rate=48000:duration=1", "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "alac", delayed], { timeoutMs: 30_000 });
  const input = await record(); const original = input.sources[0], clip = input.composition.items[0], still = input.composition.items[1];
  if (!original || original.metadata.state !== "verified" || !clip || !still) throw new Error("fixture");
  const source = MediaVersionSchema.parse({ ...original, id: "version_interval_delayed", object: { identity: "verified", assetId: "interval-delayed", storagePath: "users/creator/interval-delayed.mp4", generation: "1", ...await hashLocalFile(delayed) }, metadata: { ...original.metadata, durationSeconds: 2 } });
  local.set(source.id, delayed);
  const composition = { ...input.composition, items: [{ ...still, displayFrames: 15 }, { ...clip, versionId: source.id, inFrame: 9, outFrame: 39, displayFrames: 30, sourceAudio: { muted: false, gain: 1, timing: { startFrame: 3, endFrame: 21 } } }], text: [] };
  delete composition.backgroundAudio;
  const accepted = VideoExportSchema.parse({ ...input, sources: [source, ...input.sources.filter(version => version.kind === "image")], composition, compositionHash: sha256Hex(canonicalJson(composition)) });
  const rendered = await renderer.render(accepted, signal, () => undefined);
  try {
    const samples = await decodePcm(rendered.localPath, "source-interval-offset");
    expect(rendered.frames).toBe(45);
    // The clip starts at 0.5s in the edit. Source in 0.3s and stream delay 0.5s
    // put its first sound at 0.7s, after its selected interval begins at 0.6s.
    expect(pcmPeak(samples, 0.1, 0.35)).toBeLessThan(0.0001);
    expect(pcmPeak(samples, 0.61, 0.65)).toBeLessThan(0.001);
    expect(pcmPeak(samples, 0.8, 1)).toBeGreaterThan(0.01);
    expect(pcmPeak(samples, 1.3, 1.45)).toBeLessThan(0.001);
  } finally { await rm(rendered.directory, { recursive: true, force: true }); }
}, 60_000);

it("rejects invalid muted timing when probing finds audio omitted by the captured metadata", async () => {
  const input = await record(); const original = input.sources[0], clip = input.composition.items[0];
  if (!original || original.metadata.state !== "verified" || !clip) throw new Error("fixture");
  const source = MediaVersionSchema.parse({ ...original, metadata: { ...original.metadata, audio: "absent" } });
  const composition = { ...input.composition, items: [{ ...clip, sourceAudio: { muted: true, gain: 1, timing: { startFrame: 0, endFrame: 30 } } }], text: [] };
  delete composition.backgroundAudio;
  const accepted = VideoExportSchema.parse({ ...input, sources: [source], composition, compositionHash: sha256Hex(canonicalJson(composition)) });
  await expect(renderer.render(accepted, signal, () => undefined)).rejects.toThrow("invalid source audio timing");
}, 30_000);

it("exports a trimmed silent clip despite its inert retained source-audio overhang", async () => {
  const silent = join(root, "silent.mp4");
  await runNative("ffmpeg", ["-v", "error", "-nostdin", "-y", "-i", clipPath, "-map", "0:v:0", "-c:v", "copy", "-an", silent], { timeoutMs: 30_000 });
  const input = await record(); const original = input.sources[0], clip = input.composition.items[0];
  if (!original || original.metadata.state !== "verified" || !clip) throw new Error("fixture");
  const source = MediaVersionSchema.parse({ ...original, id: "version_silent", object: { identity: "verified", assetId: "silent", storagePath: "users/creator/silent.mp4", generation: "1", ...await hashLocalFile(silent) }, metadata: { ...original.metadata, audio: "absent" } });
  local.set(source.id, silent);
  const whole = VideoExportSchema.parse({ ...input, sources: [source], composition: { ...input.composition, items: [{ ...clip, versionId: source.id, inFrame: 0, outFrame: 30, displayFrames: 30, sourceAudio: { muted: false, gain: 1 } }], text: [], backgroundAudio: undefined } });
  const composition = applyEditCommand(whole.composition, { kind: "trim", itemId: clip.id, inFrame: 0, outFrame: 15 });
  expect(composition.items[0]?.sourceAudio.timing).toEqual({ startFrame: 0, endFrame: 30 });
  expect(validateVideoComposition(composition, [source])).toEqual([]);
  const accepted = VideoExportSchema.parse({ ...whole, composition, compositionHash: sha256Hex(canonicalJson(composition)) });
  const rendered = await renderer.render(accepted, signal, () => undefined);
  try {
    expect(rendered.frames).toBe(15);
    expect(pcmPeak(await decodePcm(rendered.localPath, "silent-retained-audio"), 0.05, 0.45)).toBeLessThan(0.0001);
  } finally { await rm(rendered.directory, { recursive: true, force: true }); }
}, 60_000);

it("exports explicitly removed clip audio as silence while retaining its invalid timing and clip duration", async () => {
  const input = await record(); const source = input.sources[0], clip = input.composition.items[0];
  if (!source || !clip) throw new Error("fixture");
  const whole = VideoExportSchema.parse({ ...input, sources: [source], composition: { ...input.composition, items: [{ ...clip, inFrame: 0, outFrame: 30, displayFrames: 30 }], text: [], backgroundAudio: undefined } });
  const trimmed = applyEditCommand(whole.composition, { kind: "trim", itemId: clip.id, inFrame: 0, outFrame: 15 });
  expect(validateVideoComposition(trimmed, [source]).map(issue => issue.code)).toContain("source_audio_timing");
  const composition = applyEditCommand(trimmed, { kind: "source_audio", itemId: clip.id, muted: false, gain: 0.75, removed: true });
  const captured = canonicalJson(composition);
  expect(composition.items[0]?.sourceAudio).toEqual({ muted: false, gain: 0.75, timing: { startFrame: 0, endFrame: 30 }, removed: true });
  expect(validateVideoComposition(composition, [source])).toEqual([]);
  const accepted = VideoExportSchema.parse({ ...whole, composition, compositionHash: sha256Hex(captured) });
  const rendered = await renderer.render(accepted, signal, () => undefined);
  try {
    expect(rendered.frames).toBe(15);
    expect(pcmPeak(await decodePcm(rendered.localPath, "removed-retained-audio"), 0.05, 0.45)).toBeLessThan(0.0001);
    expect(canonicalJson(accepted.composition)).toBe(captured);
    expect(await hashLocalFile(rendered.localPath)).toEqual({ bytes: rendered.bytes, sha256: rendered.sha256 });
  } finally { await rm(rendered.directory, { recursive: true, force: true }); }
}, 60_000);
