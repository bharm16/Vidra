import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { z } from "zod";
import type {
  StoredVideoAsset,
  VideoAssetStore,
} from "../../../server/src/services/video-generation/storage/types";

const runFile = promisify(execFile);
const probeSchema = z.object({
  format: z.object({ duration: z.string() }),
  streams: z.array(
    z.object({
      codec_type: z.string(),
      codec_name: z.string().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
    }),
  ),
});

export interface CompletionArtifact {
  path: string;
  sha256: string;
  bytes: number;
  kind: "video" | "image" | "text";
  verification: Record<string, unknown>;
}

export async function verifyVideoArtifact(
  path: string,
): Promise<CompletionArtifact> {
  const bytes = await readFile(path);
  if (bytes.length < 12 || bytes.subarray(4, 8).toString() !== "ftyp")
    throw new Error("Downloaded output is not an MP4 container");
  const { stdout } = await runFile(
    "ffprobe",
    ["-v", "error", "-show_streams", "-show_format", "-of", "json", path],
    { timeout: 30_000, maxBuffer: 1_000_000 },
  );
  const probe = probeSchema.parse(JSON.parse(stdout));
  const stream = probe.streams.find((entry) => entry.codec_type === "video");
  const duration = Number(probe.format.duration);
  if (
    !stream ||
    !stream.width ||
    !stream.height ||
    !Number.isFinite(duration) ||
    duration <= 0
  )
    throw new Error("MP4 has no playable video stream/duration");
  await runFile(
    "ffmpeg",
    ["-v", "error", "-i", path, "-map", "0:v:0", "-f", "null", "-"],
    { timeout: 60_000, maxBuffer: 1_000_000 },
  );
  return {
    path,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
    kind: "video",
    verification: {
      container: "mp4",
      codec: stream.codec_name,
      width: stream.width,
      height: stream.height,
      durationSeconds: duration,
      decoded: true,
    },
  };
}

export async function saveImageArtifact(
  directory: string,
  bytes: Buffer,
): Promise<CompletionArtifact> {
  const metadata = await sharp(bytes).metadata();
  if (
    !metadata.width ||
    !metadata.height ||
    !metadata.format ||
    !["webp", "png", "jpeg"].includes(metadata.format)
  )
    throw new Error("Image output has invalid dimensions/format");
  await sharp(bytes).raw().toBuffer();
  await mkdir(directory, { recursive: true });
  const path = join(directory, `fal-output.${metadata.format}`);
  await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
  return {
    path,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
    kind: "image",
    verification: {
      format: metadata.format,
      width: metadata.width,
      height: metadata.height,
      decoded: true,
    },
  };
}

/** The provider's real bytes are kept locally; this is not production GCS qualification. */
export function localCompletionVideoStore(path: string): VideoAssetStore {
  const persist = async (
    bytes: Buffer,
    contentType: string,
  ): Promise<StoredVideoAsset> => {
    await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
    return {
      id: "completion-proof",
      url: path,
      contentType,
      createdAt: Date.now(),
      sizeBytes: bytes.length,
    };
  };
  return {
    storeFromBuffer: persist,
    storeFromStream: async (stream, contentType): Promise<StoredVideoAsset> => {
      const chunks: Buffer[] = [];
      let total = 0;
      for await (const chunk of stream) {
        if (!(chunk instanceof Uint8Array))
          throw new Error("Unexpected video stream chunk");
        total += chunk.byteLength;
        if (total > 100 * 1024 * 1024)
          throw new Error("Completion output exceeded100MiB download bound");
        chunks.push(Buffer.from(chunk));
      }
      return persist(Buffer.concat(chunks), contentType);
    },
    getStream: async (): Promise<null> => null,
    getPublicUrl: async (): Promise<null> => null,
    cleanupExpired: async (): Promise<number> => 0,
  };
}
