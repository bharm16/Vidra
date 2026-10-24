import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ImportCommandSchema } from "@shared/schemas/workflow/import.schemas";
import { verifyImportFile } from "../ProjectMediaStorage";

const native = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("@services/video-export/NativeProcess", () => ({ runNative: native.execute }));
const directories: string[] = [];
const wave = Buffer.from("524946462800000057415645666d7420100000000100010080bb00000077010002001000646174610400000000000000", "hex");
const m4a = Buffer.from("00000018667479704d344120000000004d3441206d703432", "hex");
const audioProbe = { streams: [{ codec_type: "audio", codec_name: "pcm_s16le", sample_rate: "48000", channels: 1 }], format: { duration: "1" } };
async function file(bytes: Buffer): Promise<string> { const directory = await mkdtemp(join(tmpdir(), "vidra-audio-test-")); directories.push(directory); const path = join(directory, "not-trusted.wav"); await writeFile(path, bytes); return path; }
function command(bytes: Buffer, contentType: string = "audio/wav"): ReturnType<typeof ImportCommandSchema.parse> { return ImportCommandSchema.parse({ id: "import_audio", filename: "not-trusted.wav", contentType, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }); }
beforeEach(() => { native.execute.mockReset(); native.execute.mockImplementation(async (program: string) => ({ stdout: program === "ffprobe" ? JSON.stringify(audioProbe) : "out_time_us=1000000\nprogress=end\n", stderr: "" })); });
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

it("proves audio bytes and decoded duration without inventing visual dimensions", async () => {
  expect(await verifyImportFile(await file(wave), command(wave))).toMatchObject({ sha256: command(wave).sha256, metadata: { state: "verified", contentType: "audio/wav", audio: "present", durationSeconds: 1, probeVersion: "ffmpeg-audio-v1" } });
  const result = await verifyImportFile(await file(wave), command(wave)); expect(result.metadata).not.toHaveProperty("width"); expect(result.metadata).not.toHaveProperty("height");
  expect(native.execute).toHaveBeenCalledWith("ffmpeg", expect.arrayContaining(["-protocol_whitelist", "file,pipe", "-map", "0:a:0"]), expect.objectContaining({ timeoutMs: 60000 }));
});
it("rejects a familiar audio filename containing unrelated bytes before native probing", async () => { const bytes = Buffer.from("This is not an audio file"); await expect(verifyImportFile(await file(bytes), command(bytes))).rejects.toMatchObject({ code: "invalid_settings" }); expect(native.execute).not.toHaveBeenCalled(); });
it("does not publish a claimed format when the actual audio container disagrees", async () => { await expect(verifyImportFile(await file(wave), command(wave, "audio/mpeg"))).rejects.toMatchObject({ code: "invalid_settings", message: expect.stringContaining("contents don't match") }); expect(native.execute).not.toHaveBeenCalled(); });
it("rejects MP4 video falsely declared as audio despite a compatible container signature", async () => {
  native.execute.mockResolvedValueOnce({ stdout: JSON.stringify({ ...audioProbe, streams: [...audioProbe.streams, { codec_type: "video", width: 1920, height: 1080 }] }), stderr: "" });
  await expect(verifyImportFile(await file(m4a), command(m4a, "audio/mp4"))).rejects.toMatchObject({ code: "invalid_settings", message: expect.stringContaining("no video") });
});
it("rejects an audio container without an audio stream", async () => { native.execute.mockResolvedValueOnce({ stdout: JSON.stringify({ streams: [], format: { duration: 1 } }), stderr: "" }); await expect(verifyImportFile(await file(wave), command(wave))).rejects.toMatchObject({ code: "invalid_settings" }); });
it("enforces both declared and actually decoded five-minute limits", async () => {
  native.execute.mockResolvedValueOnce({ stdout: JSON.stringify({ ...audioProbe, format: { duration: 301 } }), stderr: "" });
  await expect(verifyImportFile(await file(wave), command(wave))).rejects.toMatchObject({ code: "invalid_settings", message: expect.stringContaining("five minutes") });
  native.execute.mockImplementation(async (program: string) => ({ stdout: program === "ffprobe" ? JSON.stringify(audioProbe) : "out_time_us=301000000\nprogress=end\n", stderr: "" }));
  await expect(verifyImportFile(await file(wave), command(wave))).rejects.toMatchObject({ code: "invalid_settings" });
});
it("does not publish corrupt audio that passed header probing", async () => { native.execute.mockResolvedValueOnce({ stdout: JSON.stringify(audioProbe), stderr: "" }).mockRejectedValueOnce(new Error("Invalid packet")); await expect(verifyImportFile(await file(wave), command(wave))).rejects.toMatchObject({ code: "invalid_settings", message: expect.stringContaining("decoded") }); });
it("keeps missing decoder capability retryable and fingerprint changes unusable", async () => {
  native.execute.mockRejectedValueOnce(Object.assign(new Error("Missing ffmpeg"), { code: "ENOENT" })); await expect(verifyImportFile(await file(wave), command(wave))).rejects.toMatchObject({ code: "capability_unavailable" });
  native.execute.mockClear(); await expect(verifyImportFile(await file(wave), { ...command(wave), sha256: "b".repeat(64) })).rejects.toMatchObject({ code: "invalid_settings" }); expect(native.execute).not.toHaveBeenCalled();
});
