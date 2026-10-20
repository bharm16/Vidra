import type { Bucket } from "@google-cloud/storage";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileTypeFromFile } from "file-type";
import sharp from "sharp";
import { z } from "zod";
import { MediaMetadataSchema, type MediaMetadata } from "@shared/schemas/workflow/media.schemas";
import { AUDIO_IMPORT_LIMITS, canonicalImportContentType, ImportCommandSchema, type ImportCommand } from "@shared/schemas/workflow/import.schemas";
import { WorkflowError } from "@services/projects/WorkflowError";

export interface VerifiedImport { generation: string; sha256: string; bytes: number; metadata: MediaMetadata; }
export interface ProjectMediaStorage {
  start(path: string, contentType: string, bytes: number, origin?: string): Promise<string>;
  exists(path: string): Promise<boolean>;
  cancelSession(url: string): Promise<void>;
  offset(url: string, bytes: number): Promise<number | undefined>;
  inspect(path: string, command: ImportCommand): Promise<VerifiedImport>;
  copy(source: string, target: string, generation?: string): Promise<string>;
}
const execute = promisify(execFile);
const ProbeSchema = z.object({ streams: z.array(z.object({ codec_type: z.string(), codec_name: z.string().optional(), width: z.number().optional(), height: z.number().optional(), sample_rate: z.coerce.number().optional(), channels: z.number().optional(), disposition: z.object({ attached_pic: z.number().optional() }).optional() })), format: z.object({ duration: z.coerce.number().positive().max(3600) }) });

/** Decode local bytes only; ffprobe cannot follow playlists or network references. */
export async function verifyImportFile(path: string, command: ImportCommand, accepted: { safeParse(value: unknown): { success: boolean } } = ImportCommandSchema): Promise<Omit<VerifiedImport, "generation">> {
  if (!accepted.safeParse(command).success) throw new WorkflowError("invalid_settings", "This file exceeds the supported size or has an unsupported type.");
  const size = (await stat(path)).size;
  if (size !== command.bytes) throw new WorkflowError("invalid_settings", "This file's size changed. Choose the original file again.");
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  const sha256 = hash.digest("hex");
  if (sha256 !== command.sha256) throw new WorkflowError("invalid_settings", "This file's bytes changed. Choose the original file again.");
  const type = await fileTypeFromFile(path).catch(() => undefined);
  const audio = command.contentType.startsWith("audio/");
  const detectedType = canonicalImportContentType(type?.mime ?? "");
  // MP4 is a container. Audio-only AAC files commonly retain the generic MP4 brand;
  // the stream checks below must prove it contains audio and no moving video.
  const matches = detectedType === command.contentType || (command.contentType === "audio/mp4" && type?.mime === "video/mp4");
  if (!matches) throw new WorkflowError("invalid_settings", "This file isn't supported. Its contents don't match its file type.");
  try {
    if (command.contentType.startsWith("image/")) {
      const picture = sharp(await readFile(path), { limitInputPixels: 40_000_000, failOn: "warning" });
      const info = await picture.metadata();
      if ((info.pages ?? 1) > 1) throw new Error("Animated pictures are unsupported");
      await picture.stats();
      return { sha256, bytes: size, metadata: MediaMetadataSchema.parse({ state: "verified", contentType: command.contentType, width: info.width, height: info.height, durationSeconds: 0, audio: "absent", probeVersion: "sharp-v1" }) };
    }
    const { stdout } = await execute("ffprobe", ["-v", "error", "-protocol_whitelist", "file", "-show_streams", "-show_format", "-of", "json", path], { timeout: 30_000, maxBuffer: 1024 * 1024 });
    const probe = ProbeSchema.parse(JSON.parse(stdout));
    if (audio) {
      const stream = probe.streams.find(candidate => candidate.codec_type === "audio");
      if (!stream || !stream.channels || stream.channels > 8 || !stream.sample_rate || stream.sample_rate > 192000 || probe.streams.some(candidate => candidate.codec_type === "video" && candidate.disposition?.attached_pic !== 1)) throw new WorkflowError("invalid_settings", "Choose an audio file with a readable audio stream and no video.");
      if (probe.format.duration > AUDIO_IMPORT_LIMITS.maxDurationSeconds) throw new WorkflowError("invalid_settings", "Audio must be five minutes or shorter.");
      const decoded = await execute("ffmpeg", ["-nostdin", "-v", "error", "-xerror", "-err_detect", "explode", "-protocol_whitelist", "file,pipe", "-threads", "1", "-i", path, "-map", "0:a:0", "-vn", "-sn", "-dn", "-threads", "1", "-progress", "pipe:1", "-nostats", "-f", "null", "-"], { timeout: 60_000, maxBuffer: 1024 * 1024 });
      const times = [...decoded.stdout.matchAll(/^out_time_us=(\d+)$/gm)];
      const durationSeconds = Number(times.at(-1)?.[1]) / 1_000_000;
      if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > AUDIO_IMPORT_LIMITS.maxDurationSeconds) throw new WorkflowError("invalid_settings", "Choose readable audio that is five minutes or shorter.");
      return { sha256, bytes: size, metadata: MediaMetadataSchema.parse({ state: "verified", contentType: command.contentType, durationSeconds, audio: "present", probeVersion: "ffmpeg-audio-v1" }) };
    }
    const video = probe.streams.find(stream => stream.codec_type === "video");
    if (!video?.width || !video.height || video.width * video.height > 40_000_000) throw new Error("No supported video stream");
    return { sha256, bytes: size, metadata: MediaMetadataSchema.parse({ state: "verified", contentType: command.contentType, width: video.width, height: video.height, durationSeconds: probe.format.duration, audio: probe.streams.some(stream => stream.codec_type === "audio") ? "present" : "absent", probeVersion: "ffprobe-v1" }) };
  } catch (error) {
    if (error instanceof WorkflowError) throw error;
    if (error instanceof Error && "code" in error && error.code === "ENOENT") throw new WorkflowError("capability_unavailable", `${audio ? "Audio" : "Clip"} checking is temporarily unavailable. Retry upload later.`);
    throw new WorkflowError("invalid_settings", audio ? "This audio file could not be decoded. Choose readable MP3, WAV, OGG or M4A audio, up to five minutes." : "This file isn't supported. Choose a readable picture or clip (up to one hour).");
  }
}

export class GcsProjectMediaStorage implements ProjectMediaStorage {
  constructor(private readonly bucket: Bucket) {}
  async exists(path: string): Promise<boolean> { return (await this.bucket.file(path).exists())[0]; }
  async cancelSession(url: string): Promise<void> {
    const result = await fetch(url, { method: "DELETE", redirect: "error", signal: AbortSignal.timeout(15000) });
    if (![200, 204, 404, 410, 499].includes(result.status)) throw new WorkflowError("capability_unavailable", "Cancellation could not be confirmed. Retry when connected.");
  }
  async start(path: string, contentType: string, bytes: number, origin?: string): Promise<string> {
    const [url] = await this.bucket.file(path).createResumableUpload({ metadata: { contentType, contentLength: bytes }, ...(origin ? { origin } : {}), preconditionOpts: { ifGenerationMatch: 0 } });
    return url;
  }
  async offset(url: string, bytes: number): Promise<number | undefined> {
    const result = await fetch(url, { method: "PUT", headers: { "Content-Length": "0", "Content-Range": `bytes */${bytes}` }, redirect: "manual", signal: AbortSignal.timeout(15000) });
    if (result.ok) return bytes;
    if (result.status === 404 || result.status === 410) return undefined;
    if (result.status !== 308) throw new WorkflowError("capability_unavailable", "The upload could not resume. Retry upload.");
    const range = result.headers.get("range");
    if (!range) return 0;
    const parsed = /^bytes=0-(\d+)$/.exec(range);
    if (!parsed?.[1]) throw new WorkflowError("capability_unavailable", "The upload position could not be checked.");
    return z.number().int().min(0).max(bytes).parse(Number(parsed[1]) + 1);
  }
  async inspect(path: string, command: ImportCommand): Promise<VerifiedImport> {
    const file = this.bucket.file(path);
    const [metadata] = await file.getMetadata();
    if (Number(metadata.size) !== command.bytes || !metadata.generation) throw new WorkflowError("invalid_settings", "The uploaded file is incomplete or has changed.");
    const directory = await mkdtemp(join(tmpdir(), "vidra-import-"));
    try {
      const target = join(directory, "media");
      await this.bucket.file(path, { generation: metadata.generation }).download({ destination: target, validation: "crc32c" });
      return { ...await verifyImportFile(target, command), generation: String(metadata.generation) };
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
  async copy(source: string, target: string, generation?: string): Promise<string> {
    try { await this.bucket.file(source, generation ? { generation } : {}).copy(this.bucket.file(target), { preconditionOpts: { ifGenerationMatch: 0 } }); }
    catch (error) { if (!(typeof error === "object" && error !== null && "code" in error && error.code === 412)) throw error; }
    const [metadata] = await this.bucket.file(target).getMetadata();
    return z.string().min(1).parse(metadata.generation);
  }
}
