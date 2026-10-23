import { access, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { canonicalJson } from "@shared/workflow/canonicalJson";
import { absoluteText, audioTracks, compositionFrames, sourceAudioInterval, timelineItems, VIDEO_PRESETS, VIDEO_EDIT_LIMITS } from "@shared/video-edit/composition";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import type { VideoExport, VideoComposition, VideoItem } from "@shared/schemas/workflow/video-edit.schemas";
import type { ExportStorage } from "./ExportStorage";
import { hashLocalFile } from "./ExportStorage";
import { fontFingerprint, rasterizeCaption } from "./CaptionRasterizer";
import { runNative } from "./NativeProcess";
import { CaptionPolicyError } from "./CaptionPolicyError";

const StreamSchema = z.object({ codec_type: z.string(), codec_name: z.string().optional(), width: z.number().optional(), height: z.number().optional(), avg_frame_rate: z.string().optional(), nb_read_frames: z.coerce.number().optional(), start_time: z.coerce.number().optional(), sample_rate: z.coerce.number().optional(), channels: z.number().optional(), duration: z.coerce.number().optional() });
const ProbeSchema = z.object({ streams: z.array(StreamSchema), format: z.object({ duration: z.coerce.number().optional() }) });
type Probe = z.infer<typeof ProbeSchema>;
// Bump when frame/sample selection, filter behavior or output assembly changes.
const RENDER_ALGORITHM_REVISION = "vidra-native-cfr30/v3";
function validateSourceAudioTiming(item: VideoItem): void {
  if (item.sourceAudio.removed || !item.sourceAudio.timing) return;
  const audio = sourceAudioInterval(item);
  if (!Number.isInteger(audio.startFrame) || !Number.isInteger(audio.endFrame) || audio.startFrame < 0 || audio.endFrame <= audio.startFrame || audio.endFrame > item.displayFrames) throw new Error(`Clip ${item.id} has invalid source audio timing. Fit its timing explicitly before exporting.`);
}
export interface NormalizedVideo { localPath: string; directory: string; sha256: string; bytes: number; frames: number; width: number; height: number; framesPerSecond: 30; audio: "present" | "absent"; }
export interface RenderedVideo { localPath: string; directory: string; sha256: string; bytes: number; frames: number; width: number; height: number; }
export interface VideoRenderer {
  fingerprint(): Promise<string>;
  validateText(composition: VideoComposition): Promise<void>;
  render(record: VideoExport, signal: AbortSignal, progress: (value: number) => void): Promise<RenderedVideo>;
}
async function binaryPath(name: string): Promise<string> {
  if (name.includes("/")) { await access(name, constants.X_OK); return realpath(name); }
  for (const root of (process.env.PATH ?? "").split(delimiter)) { const path = join(root, name); try { await access(path, constants.X_OK); return realpath(path); } catch { /* Continue only through configured executable search roots. */ } }
  throw new Error(`The required ${name} renderer executable is unavailable.`);
}
export class NativeVideoRenderer implements VideoRenderer {
  constructor(private readonly storage: ExportStorage, private readonly ffmpeg = "ffmpeg", private readonly ffprobe = "ffprobe") {}
  fingerprint(): Promise<string> {
    return (async (): Promise<string> => { const hash = createHash("sha256"); hash.update(RENDER_ALGORITHM_REVISION); for (const name of [this.ffmpeg, this.ffprobe]) { const binary = await binaryPath(name); hash.update((await hashLocalFile(binary)).sha256); hash.update((await runNative(binary, ["-version"], { timeoutMs: 10_000 })).stdout); } hash.update(await fontFingerprint()); hash.update(JSON.stringify(sharp.versions)); hash.update(JSON.stringify({ platform: process.platform, pangoCairoBackend: process.env.PANGOCAIRO_BACKEND ?? "platform-default" })); return `${RENDER_ALGORITHM_REVISION}:${hash.digest("hex")}`; })();
  }
  async validateText(composition: VideoComposition): Promise<void> {
    const issues: CaptionPolicyError["issues"] = [];
    for (const cue of composition.text) {
      try { await rasterizeCaption(cue, composition.preset); }
      catch (error) { if (!(error instanceof CaptionPolicyError)) throw error; issues.push(...error.issues); }
    }
    if (issues.length) throw new CaptionPolicyError(issues);
  }
  private async probe(path: string, signal: AbortSignal, countFrames = false): Promise<Probe> {
    const result = await runNative(this.ffprobe, ["-v", "error", "-protocol_whitelist", "file,pipe", "-format_whitelist", "mov,matroska,webm,png_pipe,jpeg_pipe,webp_pipe,mp3,wav,ogg,flac,aac", ...(countFrames ? ["-count_frames"] : []), "-show_streams", "-show_format", "-of", "json", path], { signal, timeoutMs: 30_000 }); return ProbeSchema.parse(JSON.parse(result.stdout));
  }
  /** Same CFR normalization as the final render; original storage bytes never change. */
  async normalize(ownerId: string, source: MediaVersion, signal: AbortSignal): Promise<NormalizedVideo> {
    if (source.ownerId !== ownerId || source.object.identity !== "verified" || source.metadata.state !== "verified" || (source.kind !== "video" && source.kind !== "export") || source.object.bytes > VIDEO_EDIT_LIMITS.maxSourceBytes) throw new Error(`Source ${source.id} cannot be normalized for video editing.`);
    await this.fingerprint();
    const executionSignal = AbortSignal.any([signal, AbortSignal.timeout(300_000)]);
    const directory = await mkdtemp(join(tmpdir(), "vidra-preview-")); let complete = false;
    try {
      const input = join(directory, "source"); await this.storage.download(ownerId, source, input, executionSignal);
      const bytes = await hashLocalFile(input);
      if (bytes.sha256 !== source.object.sha256 || bytes.bytes !== source.object.bytes) throw new Error(`Source ${source.id} no longer matches its exact stored bytes.`);
      const probe = await this.probe(input, executionSignal); const visual = probe.streams.find(stream => stream.codec_type === "video"); const audio = probe.streams.find(stream => stream.codec_type === "audio");
      if (!visual?.width || !visual.height || visual.width * visual.height > 8_294_400 || !probe.format.duration || probe.format.duration > VIDEO_EDIT_LIMITS.maxDecodeSeconds) throw new Error(`Source ${source.id} exceeds the supported preview geometry or duration bound.`);
      const filters = ["[0:v:0]setpts=PTS-STARTPTS,fps=fps=30:start_time=0:round=near,scale=w='min(1920,iw)':h='min(1920,ih)':force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2,setsar=1,format=yuv420p[v]"];
      if (audio) { const offset = Math.round(((audio.start_time ?? 0) - (visual.start_time ?? 0)) * 48000); const align = offset > 0 ? `adelay=${offset}S:all=1,` : offset < 0 ? `atrim=start_sample=${-offset},asetpts=PTS-STARTPTS,` : ""; filters.push(`[0:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS,${align}apad,atrim=end_sample=${Math.ceil(probe.format.duration * 30) * 1600}[a]`); }
      const output = join(directory, "preview.mp4"); const args = ["-v", "error", "-nostdin", "-y", "-threads", "1", "-filter_complex_threads", "1", "-max_alloc", "268435456", "-protocol_whitelist", "file,pipe", "-format_whitelist", "mov,matroska,webm", "-i", input, "-filter_complex", filters.join(";"), "-map", "[v]", ...(audio ? ["-map", "[a]", "-c:a", "aac", "-ar", "48000", "-ac", "2"] : ["-an"]), "-c:v", "libx264", "-preset", "veryfast", "-threads", "1", "-pix_fmt", "yuv420p", "-r", "30", "-b:v", "3M", "-maxrate", "5M", "-bufsize", "6M", "-t", String(probe.format.duration), "-map_metadata", "-1", "-movflags", "+faststart", "-fs", "268435456", output];
      await runNative(this.ffmpeg, args, { signal: executionSignal, timeoutMs: 180_000 });
      const normalized = await this.probe(output, executionSignal, true); const result = normalized.streams.find(stream => stream.codec_type === "video");
      if (!result?.width || !result.height || !result.nb_read_frames || result.avg_frame_rate !== "30/1" || result.codec_name !== "h264" || result.nb_read_frames > 9001) throw new Error("The normalized preview failed frame and geometry verification.");
      await runNative(this.ffmpeg, ["-v", "error", "-xerror", "-nostdin", "-threads", "1", "-protocol_whitelist", "file,pipe", "-i", output, "-f", "null", "-"], { signal: executionSignal, timeoutMs: 120_000 });
      const evidence = await hashLocalFile(output); if (evidence.bytes > 268435456) throw new Error("The preview exceeded its stored byte bound."); complete = true; return { localPath: output, directory, ...evidence, frames: result.nb_read_frames, width: result.width, height: result.height, framesPerSecond: 30, audio: audio ? "present" : "absent" };
    } catch (error) { if (executionSignal.aborted && !signal.aborted) throw new Error("The preview exceeded its bounded execution deadline."); throw error; }
    finally { if (!complete) await rm(directory, { recursive: true, force: true }); }
  }
  async render(record: VideoExport, signal: AbortSignal, progress: (value: number) => void): Promise<RenderedVideo> {
    if (createHash("sha256").update(canonicalJson(record.composition)).digest("hex") !== record.compositionHash) throw new Error("The accepted render manifest no longer matches its captured composition hash.");
    for (const item of record.composition.items) {
      const source = record.sources.find(candidate => candidate.id === item.versionId);
      if (item.kind === "clip" && source?.metadata.state === "verified" && source.metadata.audio === "present") validateSourceAudioTiming(item);
    }
    if (await this.fingerprint() !== record.renderer) throw new Error("The exact renderer implementation for this accepted export is unavailable.");
    const executionSignal = AbortSignal.any([signal, AbortSignal.timeout(300_000)]);
    const directory = await mkdtemp(join(tmpdir(), "vidra-export-")); let complete = false;
    try {
      const local = new Map<string, { path: string; probe: Probe }>(); let totalBytes = 0; let decodeSeconds = 0;
      for (const source of record.sources) {
        if (source.object.identity !== "verified") throw new Error(`Source ${source.id} lacks a pinned object identity.`);
        const path = join(directory, `source-${local.size}`); await this.storage.download(record.ownerId, source, path, executionSignal);
        const evidence = await hashLocalFile(path); totalBytes += evidence.bytes;
        if (evidence.sha256 !== source.object.sha256 || evidence.bytes !== source.object.bytes || totalBytes > VIDEO_EDIT_LIMITS.maxSourceBytes) throw new Error(`Source ${source.id} does not match its exact stored bytes or exceeds the input limit.`);
        const probe = await this.probe(path, executionSignal); const visual = probe.streams.find(stream => stream.codec_type === "video");
        if (visual?.width && visual.height && visual.width * visual.height > 8_294_400) throw new Error(`Source ${source.id} exceeds the supported 4K decoder bound.`);
        if (source.kind !== "image") { const seconds = probe.format.duration; if (!seconds || !Number.isFinite(seconds)) throw new Error(`Source ${source.id} has no verified finite duration.`); decodeSeconds += seconds; }
        if (decodeSeconds > VIDEO_EDIT_LIMITS.maxDecodeSeconds) throw new Error("The sources exceed the decoding duration limit.");
        local.set(source.id, { path, probe });
      }
      const { width, height } = VIDEO_PRESETS[record.composition.preset]; const frames = compositionFrames(record.composition); const seconds = frames / 30;
      const args = ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-max_alloc", "268435456", "-filter_complex_threads", "1"];
      const filters: string[] = []; let input = 0;
      for (const [index, { item }] of timelineItems(record.composition).entries()) {
        const source = local.get(item.versionId); if (!source) throw new Error(`Source ${item.versionId} is unavailable.`);
        const inputIndex = input++; args.push("-threads", "1", "-protocol_whitelist", "file,pipe", "-format_whitelist", "mov,matroska,webm,png_pipe,jpeg_pipe,webp_pipe,mp3,wav,ogg,flac,aac"); if (item.kind === "picture") args.push("-loop", "1", "-framerate", "30"); args.push("-i", source.path);
        const transform = item.fit === "fit" ? `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black` : `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
        const crop = item.fit === "crop" && item.crop ? `crop=iw*${item.crop.width}:ih*${item.crop.height}:iw*${item.crop.x}:ih*${item.crop.y},` : "";
        const trimStart = item.kind === "picture" ? 0 : item.inFrame; const trimEnd = trimStart + item.displayFrames;
        filters.push(`[${inputIndex}:v:0]setpts=PTS-STARTPTS,fps=fps=30:start_time=0:round=near,trim=start_frame=${trimStart}:end_frame=${trimEnd},setpts=PTS-STARTPTS,${crop}${transform},setsar=1,format=yuv420p[v${index}]`);
        const audio = source.probe.streams.find(stream => stream.codec_type === "audio"); const video = source.probe.streams.find(stream => stream.codec_type === "video");
        if (item.kind === "clip" && audio) validateSourceAudioTiming(item);
        if (item.kind === "clip" && audio && !item.sourceAudio.muted && !item.sourceAudio.removed) {
          const interval = sourceAudioInterval(item);
          const offsetSamples = Math.round(((audio.start_time ?? 0) - (video?.start_time ?? 0)) * 48000);
          const align = offsetSamples > 0 ? `adelay=${offsetSamples}S:all=1,` : offsetSamples < 0 ? `atrim=start_sample=${-offsetSamples},asetpts=PTS-STARTPTS,` : "";
          const placement = interval.startFrame !== 0 || interval.endFrame !== item.displayFrames ? `${interval.startFrame ? `,adelay=${interval.startFrame * 1600}S:all=1` : ""},apad,atrim=end_sample=${item.displayFrames * 1600}` : "";
          filters.push(`[${inputIndex}:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS,${align}apad,atrim=start_sample=${(trimStart + interval.startFrame) * 1600}:end_sample=${(trimStart + interval.endFrame) * 1600},asetpts=PTS-STARTPTS,volume=${item.sourceAudio.gain}${placement}[a${index}]`);
        } else filters.push(`anullsrc=r=48000:cl=stereo,atrim=end_sample=${item.displayFrames * 1600},asetpts=PTS-STARTPTS[a${index}]`);
      }
      filters.push(`${record.composition.items.map((_item, index) => `[v${index}][a${index}]`).join("")}concat=n=${record.composition.items.length}:v=1:a=1[basev][basea]`);
      let videoLabel = "basev";
      for (const [index, cue] of record.composition.text.entries()) {
        const raster = await rasterizeCaption(cue, record.composition.preset); const timing = absoluteText(record.composition, cue); if (!timing) throw new Error(`Text ${cue.id} has no available anchor.`);
        const pngPath = join(directory, `caption-${index}.png`); await writeFile(pngPath, raster.png, { mode: 0o600 }); const captionInput = input++; args.push("-threads", "1", "-protocol_whitelist", "file,pipe", "-loop", "1", "-framerate", "30", "-i", pngPath);
        const next = `captionv${index}`; filters.push(`[${videoLabel}][${captionInput}:v:0]overlay=x=${raster.x}:y=${raster.y}:enable='gte(n,${timing.startFrame})*lt(n,${timing.endFrame})':eof_action=pass[${next}]`); videoLabel = next;
      }
      let audioLabel = "basea";
      // Voiceover and music are each mixed over the clip sound in turn.
      for (const [track, background] of audioTracks(record.composition).entries()) {
        const source = local.get(background.versionId); if (!source?.probe.streams.some(stream => stream.codec_type === "audio")) throw new Error(`Audio ${background.id} is unavailable.`);
        const backgroundInput = input++; args.push("-threads", "1", "-protocol_whitelist", "file,pipe", "-format_whitelist", "mov,matroska,webm,mp3,wav,ogg,flac,aac", "-i", source.path);
        const end = Math.min(frames, background.endFrame); const backgroundAudioStream = source.probe.streams.find(stream => stream.codec_type === "audio"); const backgroundVideoStream = source.probe.streams.find(stream => stream.codec_type === "video"); const backgroundOffset = backgroundVideoStream ? Math.round(((backgroundAudioStream?.start_time ?? 0) - (backgroundVideoStream.start_time ?? 0)) * 48000) : 0; const backgroundAlign = backgroundOffset > 0 ? `adelay=${backgroundOffset}S:all=1,` : backgroundOffset < 0 ? `atrim=start_sample=${-backgroundOffset},asetpts=PTS-STARTPTS,` : ""; filters.push(`[${backgroundInput}:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS,${backgroundAlign}apad,atrim=start_sample=${background.sourceInFrame * 1600}:end_sample=${(background.sourceInFrame + end - background.startFrame) * 1600},asetpts=PTS-STARTPTS,volume=${background.gain},adelay=${background.startFrame * 1600}S:all=1,apad,atrim=end_sample=${frames * 1600}[backgrounda${track}]`); filters.push(`[${audioLabel}][backgrounda${track}]amix=inputs=2:duration=first:normalize=0[mixeda${track}]`); audioLabel = `mixeda${track}`;
      }
      const graph = join(directory, "render-filter.txt"); await writeFile(graph, filters.join(";\n"), { mode: 0o600 });
      const output = join(directory, "output.mp4"); args.push("-filter_complex_script", graph, "-map", `[${videoLabel}]`, "-map", `[${audioLabel}]`, "-frames:v", String(frames), "-t", String(seconds), "-c:v", "libx264", "-preset", "veryfast", "-threads", "1", "-pix_fmt", "yuv420p", "-r", "30", "-b:v", "5M", "-maxrate", "8M", "-bufsize", "10M", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "192k", "-movflags", "+faststart", "-map_metadata", "-1", "-fs", "134217728", "-progress", "pipe:1", output);
      await runNative(this.ffmpeg, args, { signal: executionSignal, timeoutMs: 180_000, onProgress: chunk => { const match = /out_time_us=(\d+)/.exec(chunk); if (match?.[1]) progress(Math.min(0.99, Number(match[1]) / (seconds * 1_000_000))); } });
      const probe = await this.probe(output, executionSignal, true); const visual = probe.streams.find(stream => stream.codec_type === "video"); const audio = probe.streams.find(stream => stream.codec_type === "audio");
      if (probe.streams.length !== 2 || visual?.codec_name !== "h264" || visual.width !== width || visual.height !== height || visual.avg_frame_rate !== "30/1" || visual.nb_read_frames !== frames || audio?.codec_name !== "aac" || audio.sample_rate !== 48000 || audio.channels !== 2 || Math.abs((audio.duration ?? 0) - seconds) > 0.08) throw new Error("The rendered file failed exact frame, geometry, codec or audio verification.");
      await runNative(this.ffmpeg, ["-v", "error", "-xerror", "-nostdin", "-threads", "1", "-protocol_whitelist", "file,pipe", "-i", output, "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-"], { signal: executionSignal, timeoutMs: 120_000 });
      const evidence = await hashLocalFile(output); if (!evidence.bytes || evidence.bytes > 134217728) throw new Error("The finalized export exceeds the output bound."); complete = true; return { localPath: output, directory, ...evidence, frames, width, height };
    } catch (error) { if (executionSignal.aborted && !signal.aborted) throw new Error("The export exceeded its bounded execution deadline."); throw error; } finally { if (!complete) await rm(directory, { recursive: true, force: true }); }
  }
}
