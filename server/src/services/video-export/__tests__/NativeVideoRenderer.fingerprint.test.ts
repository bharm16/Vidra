import { afterEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { canonicalJson } from "@shared/workflow/canonicalJson";
import { VideoExportSchema } from "@shared/schemas/workflow/video-edit.schemas";
import type { VideoItem } from "@shared/schemas/workflow/video-edit.schemas";
import { NativeVideoRenderer } from "../NativeVideoRenderer";
import type { ExportStorage } from "../ExportStorage";

vi.mock("../NativeProcess", () => ({
  runNative: vi.fn(async () => ({ stdout: "controlled-native-version", stderr: "" })),
}));
vi.mock("../CaptionRasterizer", () => ({ fontFingerprint: async () => "controlled-font-identity", rasterizeCaption: vi.fn() }));
vi.mock("../ExportStorage", async importOriginal => {
  const original = await importOriginal<typeof import("../ExportStorage")>();
  return {
    ...original,
    hashLocalFile: vi.fn(async () => ({ sha256: "a".repeat(64), bytes: 1 })),
  };
});

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

const mediaAccessForbidden = vi.fn(async (): Promise<never> => {
  throw new Error("Renderer fingerprinting must not access stored media.");
});
const storage: ExportStorage = {
  download: mediaAccessForbidden,
  remove: mediaAccessForbidden,
  inspect: mediaAccessForbidden,
  store: mediaAccessForbidden,
  access: mediaAccessForbidden,
};

it("identifies the selected native font backend and remains stable for an unchanged backend", async () => {
  // Keep executable/font/version evidence fixed so a different font backend
  // cannot silently reuse an existing export's renderer identity.
  const renderer = new NativeVideoRenderer(storage, process.execPath, process.execPath);
  vi.stubEnv("PANGOCAIRO_BACKEND", "fontconfig");
  const fontconfig = await renderer.fingerprint();
  expect(fontconfig).toMatch(/^vidra-native-cfr30\/v3:[a-f0-9]{64}$/);
  expect(await renderer.fingerprint()).toBe(fontconfig);

  vi.stubEnv("PANGOCAIRO_BACKEND", "coretext");
  const coretext = await renderer.fingerprint();
  expect(coretext).not.toBe(fontconfig);
  expect(await renderer.fingerprint()).toBe(coretext);

  vi.stubEnv("PANGOCAIRO_BACKEND", undefined);
  const platformDefault = await renderer.fingerprint();
  expect(platformDefault).not.toBe(fontconfig);
  expect(platformDefault).not.toBe(coretext);
});

async function acceptedRecord(sourceAudio: VideoItem["sourceAudio"]) {
  const renderer = new NativeVideoRenderer(storage, process.execPath, process.execPath);
  const record = VideoExportSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "export_bad_timing", ownerId: "creator", projectId: "project_native", editId: "edit_native", revision: 1, submissionId: "submission_native", executionDraftId: "draft_native", executionDraftRevision: 1, composition: { normalizationVersion: "vidra-cfr30/v1", preset: "landscape", fps: 30, items: [{ id: "clip", versionId: "version_clip", kind: "clip", inFrame: 0, outFrame: 30, displayFrames: 30, fit: "fill", sourceAudio }], text: [] }, compositionHash: "a".repeat(64), sources: [{ schemaVersion: "vidra-workflow/v2", id: "version_clip", ownerId: "creator", projectId: "project_native", kind: "video", label: "Clip", origin: { kind: "upload" }, sourceInputs: [], object: { identity: "verified", assetId: "clip", storagePath: "users/creator/clip.mp4", generation: "1", sha256: "a".repeat(64), bytes: 1 }, metadata: { state: "verified", width: 64, height: 36, durationSeconds: 1, audio: "present", probeVersion: "controlled" }, association: "linked", createdAt: "2026-10-17T00:00:00.000Z" }], renderer: await renderer.fingerprint(), attemptId: "attempt_native", state: "rendering", progress: 0, createdAt: "2026-10-17T00:00:00.000Z", updatedAt: "2026-10-17T00:00:00.000Z" });
  record.compositionHash = createHash("sha256").update(canonicalJson(record.composition)).digest("hex");
  return { renderer, record };
}

it.each([false, true])("rejects invalid captured source-audio intervals before reading media (muted=%s)", async muted => {
  for (const timing of [{ startFrame: -1, endFrame: 15 }, { startFrame: 0, endFrame: 31 }, { startFrame: 10, endFrame: 10 }, { startFrame: 20, endFrame: 10 }]) {
    const { renderer, record } = await acceptedRecord({ muted, gain: 1, timing });
    await expect(renderer.render(record, new AbortController().signal, () => undefined)).rejects.toThrow("Clip clip has invalid source audio timing");
  }
  expect(mediaAccessForbidden).not.toHaveBeenCalled();
});

it("ignores removed source-audio timing without rewriting the captured settings", async () => {
  const sourceAudio = { muted: false, gain: 0.75, timing: { startFrame: -15, endFrame: 45 }, removed: true };
  const { renderer, record } = await acceptedRecord(sourceAudio);
  // Crossing the timing guard reaches the deliberately unavailable storage port.
  await expect(renderer.render(record, new AbortController().signal, () => undefined)).rejects.toThrow("Renderer fingerprinting must not access stored media.");
  expect(mediaAccessForbidden).toHaveBeenCalledTimes(1);
  expect(record.composition.items[0]?.sourceAudio).toEqual(sourceAudio);
});

it("rejects a queued export captured with renderer v2 before reading media", async () => {
  const { renderer, record } = await acceptedRecord({ muted: false, gain: 1 });
  record.renderer = record.renderer.replace("vidra-native-cfr30/v3:", "vidra-native-cfr30/v2:");
  await expect(renderer.render(record, new AbortController().signal, () => undefined)).rejects.toThrow("The exact renderer implementation for this accepted export is unavailable.");
  expect(mediaAccessForbidden).not.toHaveBeenCalled();
});
