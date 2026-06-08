import { tmpdir } from "node:os";
import { join } from "node:path";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import { logger } from "@infrastructure/Logger";
import { generateId } from "@utils/uid";
import { StorageService } from "@services/storage/StorageService";
import type { FrameBridge } from "./types";
import sharp from "sharp";

interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  fps: number;
}

export class FrameBridgeService {
  private readonly log = logger.child({ service: "FrameBridgeService" });

  constructor(private storage: StorageService) {}

  async extractBridgeFrame(
    userId: string,
    videoId: string,
    videoUrl: string,
    shotId: string,
    position: "first" | "last" = "last",
  ): Promise<FrameBridge> {
    this.log.info("Extracting bridge frame", { videoId, position });

    const metadata = await this.getVideoMetadata(videoUrl);
    const timestamp =
      position === "first" ? 0 : Math.max(0, metadata.duration - 0.1);

    const frameBuffer = await this.extractFrameAt(videoUrl, timestamp);

    const stored = await this.storage.savePreviewImage(userId, frameBuffer, {
      sourceVideo: videoId,
      position,
      timestamp: timestamp.toString(),
    });

    return {
      id: this.generateId("frame"),
      sourceVideoId: videoId,
      sourceShotId: shotId,
      frameUrl: stored.viewUrl,
      framePosition: position,
      frameTimestamp: timestamp,
      resolution: { width: metadata.width, height: metadata.height },
      aspectRatio: this.calculateAspectRatio(metadata.width, metadata.height),
      extractedAt: new Date(),
    };
  }

  async extractRepresentativeFrame(
    userId: string,
    videoId: string,
    videoUrl: string,
    shotId: string,
  ): Promise<FrameBridge> {
    const metadata = await this.getVideoMetadata(videoUrl);
    const candidates = [0.25, 0.5, 0.75].map((pct) => pct * metadata.duration);

    let bestFrame: Buffer | null = null;
    let bestTimestamp = candidates[1] ?? 0;
    let bestScore = -Infinity;

    for (const timestamp of candidates) {
      const frame = await this.extractFrameAt(videoUrl, timestamp);
      const score = await this.scoreFrameQuality(frame);
      if (score > bestScore) {
        bestScore = score;
        bestFrame = frame;
        bestTimestamp = timestamp;
      }
    }

    if (!bestFrame) {
      throw new Error("Failed to extract representative frame");
    }

    const stored = await this.storage.savePreviewImage(userId, bestFrame, {
      sourceVideo: videoId,
      position: "representative",
      timestamp: bestTimestamp.toString(),
    });

    return {
      id: this.generateId("frame"),
      sourceVideoId: videoId,
      sourceShotId: shotId,
      frameUrl: stored.viewUrl,
      framePosition: "representative",
      frameTimestamp: bestTimestamp,
      resolution: { width: metadata.width, height: metadata.height },
      aspectRatio: this.calculateAspectRatio(metadata.width, metadata.height),
      extractedAt: new Date(),
    };
  }

  async extractFrameBuffer(
    videoUrl: string,
    timestamp: number,
  ): Promise<Buffer> {
    return this.extractFrameAt(videoUrl, timestamp);
  }

  private async getVideoMetadata(videoUrl: string): Promise<VideoMetadata> {
    const args = [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "format=duration",
      "-show_entries",
      "stream=width,height,r_frame_rate",
      "-of",
      "json",
      videoUrl,
    ];

    const output = await this.exec("ffprobe", args);
    const parsed = JSON.parse(output) as {
      format?: { duration?: string };
      streams?: Array<{
        width?: number;
        height?: number;
        r_frame_rate?: string;
      }>;
    };

    const stream = parsed.streams?.[0];
    const rawDuration = parsed.format?.duration
      ? Number(parsed.format.duration)
      : 0;
    const duration = Number.isFinite(rawDuration) ? rawDuration : 0;
    const width = stream?.width || 1920;
    const height = stream?.height || 1080;
    const fps = this.parseFps(stream?.r_frame_rate || "24/1");

    return { duration, width, height, fps };
  }

  private parseFps(raw: string): number {
    const parts = raw.split("/").map(Number);
    const numerator = parts[0];
    const denominator = parts[1];
    if (
      parts.length === 2 &&
      denominator !== undefined &&
      denominator !== 0 &&
      numerator !== undefined
    ) {
      return numerator / denominator;
    }
    const fallback = Number(raw);
    return Number.isFinite(fallback) && fallback > 0 ? fallback : 24;
  }

  private async extractFrameAt(
    videoUrl: string,
    timestamp: number,
  ): Promise<Buffer> {
    const tempDir = await fs.mkdtemp(join(tmpdir(), "frame-"));
    const outputPath = join(tempDir, `frame-${Date.now()}.png`);

    const args = [
      "-y",
      "-ss",
      String(Math.max(0, timestamp)),
      "-i",
      videoUrl,
      "-frames:v",
      "1",
      "-f",
      "image2",
      "-vcodec",
      "png",
      outputPath,
    ];

    await this.exec("ffmpeg", args);
    const buffer = await fs.readFile(outputPath);
    await fs.rm(tempDir, { recursive: true, force: true });

    return buffer;
  }

  private async scoreFrameQuality(frame: Buffer): Promise<number> {
    const { data, info } = await sharp(frame)
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const width = info.width;
    const height = info.height;
    const idx = (x: number, y: number) => y * width + x;

    let sum = 0;
    let sumSq = 0;
    let count = 0;

    // Laplacian approximation
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const center = data[idx(x, y)] ?? 0;
        const laplacian =
          -4 * center +
          (data[idx(x - 1, y)] ?? 0) +
          (data[idx(x + 1, y)] ?? 0) +
          (data[idx(x, y - 1)] ?? 0) +
          (data[idx(x, y + 1)] ?? 0);
        sum += laplacian;
        sumSq += laplacian * laplacian;
        count += 1;
      }
    }

    if (count === 0) return 0;
    const mean = sum / count;
    const variance = sumSq / count - mean * mean;
    return variance;
  }

  private calculateAspectRatio(width: number, height: number): string {
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const divisor = gcd(width, height);
    return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
  }

  private generateId(prefix: string): string {
    return generateId(prefix);
  }

  private async exec(command: string, args: string[]): Promise<string> {
    return await new Promise((resolve, reject) => {
      const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(
            new Error(`${command} failed (${code}): ${stderr.slice(0, 400)}`),
          );
        }
      });
    });
  }

  // no-op: buffer upload handled directly
}
