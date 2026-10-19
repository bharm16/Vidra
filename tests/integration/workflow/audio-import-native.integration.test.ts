import { afterAll, beforeAll, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ImportCommandSchema } from "@shared/schemas/workflow/import.schemas";
import { verifyImportFile } from "@services/project-media/ProjectMediaStorage";

const execute = promisify(execFile); let directory = "";
beforeAll(async () => { directory = await mkdtemp(join(tmpdir(), "vidra-audio-native-")); });
afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });
it("decodes real MP3, PCM WAV, Vorbis/Opus OGG and AAC M4A as owned audio metadata", async () => {
  for (const [extension, codec, contentType] of [["mp3", "libmp3lame", "audio/mpeg"], ["wav", "pcm_s16le", "audio/wav"], ["ogg", "vorbis", "audio/ogg"], ["opus", "libopus", "audio/ogg"], ["m4a", "aac", "audio/mp4"]] as const) {
    const path = join(directory, `source.${extension}`);
    await execute("ffmpeg", ["-nostdin", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "1", "-ac", "2", "-c:a", codec, ...(codec === "vorbis" ? ["-strict", "experimental"] : []), path], { timeout: 15000, maxBuffer: 1024 * 1024 });
    const bytes = await readFile(path); const command = ImportCommandSchema.parse({ id: `import_${extension}`, filename: `source.${extension}`, contentType, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
    const result = await verifyImportFile(path, command);
    expect(result.metadata).toMatchObject({ state: "verified", contentType, audio: "present", probeVersion: "ffmpeg-audio-v1" });
    expect(result.metadata).not.toHaveProperty("width"); expect(result.metadata).not.toHaveProperty("height");
    if (result.metadata.state !== "verified") throw new Error("Audio metadata was not verified");
    expect(result.metadata.durationSeconds).toBeGreaterThan(.9); expect(result.metadata.durationSeconds).toBeLessThan(1.1);
  }
});
it("rejects real MP4 footage declared as an audio-only import", async () => {
  const path = join(directory, "not-audio.mp4");
  await execute("ffmpeg", ["-nostdin", "-v", "error", "-f", "lavfi", "-i", "color=c=red:size=64x36:rate=30", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "0.3", "-c:v", "libx264", "-c:a", "aac", path], { timeout: 15000, maxBuffer: 1024 * 1024 });
  const bytes = await readFile(path);
  await expect(verifyImportFile(path, ImportCommandSchema.parse({ id: "import_video_disguised", filename: "voice.m4a", contentType: "audio/mp4", bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }))).rejects.toMatchObject({ code: "invalid_settings" });
});
